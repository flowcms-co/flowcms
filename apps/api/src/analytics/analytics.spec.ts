import { describe, it, expect, vi, afterEach } from "vitest";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsSchedulerService } from "./analytics-scheduler.service";
import { buildOverview, isSyncDue, totalsOf, DAY_MS, type Snap } from "./analytics-math";

const day = (n: number) => new Date(Date.UTC(2026, 8, n)); // Sept 2026
const snap = (source: string, metric: string, d: Date, value: number): Snap => ({ source, metric, dimension: null, dimensionValue: null, value, date: d });

describe("totalsOf", () => {
    it("uses clicks / impressions for CTR and weights position by impressions", () => {
        const t = totalsOf({
            clicks: [{ date: "a", value: 1 }, { date: "b", value: 10 }],
            impressions: [{ date: "a", value: 2 }, { date: "b", value: 998 }],
            position: [{ date: "a", value: 50 }, { date: "b", value: 5 }],
            sessions: [],
            pageviews: [],
        });
        expect(t.ctr).toBeCloseTo(1.1, 5); // 11 / 1000, not the mean of 50% and 1%
        expect(t.position).toBeCloseTo(5.09, 2); // not the unweighted 27.5
    });
});

describe("buildOverview", () => {
    it("compares the period with the equal period before it, ending on each source's last synced day", () => {
        const snaps: Snap[] = [];
        for (let d = 1; d <= 14; d++) {
            snaps.push(snap("gsc", "clicks", day(d), d <= 7 ? 10 : 20), snap("gsc", "impressions", day(d), 100));
        }
        // GA4 runs two days ahead of Search Console.
        for (let d = 3; d <= 16; d++) snaps.push(snap("ga4", "sessions", day(d), d <= 9 ? 1 : 3));
        const o = buildOverview(snaps, 7)!;
        expect(o.totals.clicks).toBe(140);
        expect(o.previous?.clicks).toBe(70);
        expect(o.series.clicks).toHaveLength(7);
        expect(o.totals.sessions).toBe(21);
        expect(o.previous?.sessions).toBe(7);
        expect(o.asOf).toEqual({ gsc: "2026-09-14", ga4: "2026-09-16" });
    });

    it("has no previous period when the earlier window is empty, and is null with no daily rows", () => {
        const snaps = [1, 2, 3].map((d) => snap("gsc", "clicks", day(d), 5));
        expect(buildOverview(snaps, 7)?.previous).toBeNull();
        expect(buildOverview([], 7)).toBeNull();
    });
});

describe("daily sync", () => {
    it("is due when never synced or a day old, not sooner", () => {
        const now = Date.UTC(2026, 8, 10);
        expect(isSyncDue(null, now)).toBe(true);
        expect(isSyncDue(new Date(now - DAY_MS).toISOString(), now)).toBe(true);
        expect(isSyncDue(new Date(now - DAY_MS / 2).toISOString(), now)).toBe(false);
    });

    it("syncs only the due sources, one at a time", async () => {
        const now = Date.UTC(2026, 8, 10);
        const analytics = {
            syncTargets: vi.fn().mockResolvedValue([
                { workspaceId: "w1", provider: "gsc", config: { lastSyncAt: new Date(now - 2 * DAY_MS).toISOString() } },
                { workspaceId: "w1", provider: "ga4", config: { lastSyncAt: new Date(now - 1000).toISOString() } },
                { workspaceId: "w2", provider: "gsc", config: {} },
            ]),
            sync: vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ results: {} }),
        };
        const sched = new AnalyticsSchedulerService(analytics as never, { tryAcquire: async () => true } as never);
        expect(await sched.syncDue(now)).toBe(2);
        expect(analytics.sync.mock.calls.map((c) => [c[0], c[2]])).toEqual([["w1", "gsc"], ["w2", "gsc"]]);
    });
});

describe("connect", () => {
    // Stored credentials are encrypted; connect() writes them and sync() reads them back.
    process.env.SECRETS_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    afterEach(() => vi.unstubAllGlobals());

    const SA = JSON.stringify({ client_email: "sa@x.iam", private_key: "k" });
    const make = () => {
        const store: { row: Record<string, unknown> | null } = { row: null };
        const prisma = {
            integration: {
                findFirst: vi.fn(async () => store.row),
                findMany: vi.fn(async () => (store.row ? [store.row] : [])),
                create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (store.row = { id: "i1", ...data })),
                update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (store.row = { ...store.row, ...data })),
            },
            metricSnapshot: { count: vi.fn(async () => 8), deleteMany: vi.fn(), createMany: vi.fn() },
            $transaction: vi.fn(async () => []),
        };
        const svc = new AnalyticsService(prisma as never);
        (svc as unknown as { accessToken: () => Promise<string> }).accessToken = async () => "tok";
        return { svc, store, prisma };
    };
    const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

    it("does not report Connected when the service account cannot read the property", async () => {
        const { svc, store } = make();
        vi.stubGlobal("fetch", vi.fn(async () => json({ siteEntry: [] })));
        const r = await svc.connect("w", "u", { type: "gsc", credentials: SA, siteUrl: "https://example.com/" });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/isn't added to any Search Console property/);
        expect(store.row?.status).toBe("ERROR");
    });

    it("rejects a GA4 property the account has no access to", async () => {
        const { svc, store } = make();
        vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "denied" } }, false, 403)));
        const r = await svc.connect("w", "u", { type: "ga4", credentials: SA, propertyId: "123" });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/can't read GA4 property 123/);
        expect(store.row?.status).toBe("ERROR");
    });

    it("verifies the property, then syncs straight away and records the sync time", async () => {
        const { svc, store, prisma } = make();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) =>
                String(url).endsWith("/sites")
                    ? json({ siteEntry: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }] })
                    : json({ rows: [{ keys: ["2026-09-01"], clicks: 3, impressions: 40, ctr: 0.075, position: 8 }] }),
            ),
        );
        const r = await svc.connect("w", "u", { type: "gsc", credentials: SA, siteUrl: "https://example.com/" });
        expect(r).toMatchObject({ ok: true, status: "CONNECTED", found: "Search Console property sc-domain:example.com", rows: 8 });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        const cfg = store.row?.config as { siteUrl: string; lastSyncAt: string; lastError: null };
        expect(cfg.siteUrl).toBe("sc-domain:example.com");
        expect(cfg.lastSyncAt).toBeTruthy();
        expect(cfg.lastError).toBeNull();
    });
});
