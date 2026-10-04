import { describe, expect, it } from "vitest";
import { HostGate, clampRps, isTransient, politeRequest, retryAfterMs, type Clock } from "./polite";
import { SeoAuditService } from "./audit/seo-audit.service";
import { auditSummary } from "./audit/seo-job.handlers";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Virtual time: sleeping advances the clock instantly, so minutes of crawling run in milliseconds. */
function virtualClock(): Clock & { t: number } {
    const c = { t: 0, now: () => c.t, sleep: async (ms: number) => void (c.t += ms) };
    return c;
}

/** A site that answers 429 with Retry-After once it has served more than `limit`
 *  requests in the trailing 60 seconds. */
function rateLimitedServer(clock: Clock, limit = 120) {
    const served: number[] = [];
    const stats = { ok: 0, refused: 0, peakPerMinute: 0 };
    const hit = async () => {
        const now = clock.now();
        while (served.length && served[0] <= now - 60_000) served.shift();
        if (served.length >= limit) {
            stats.refused++;
            return { status: 429, retryAfter: served[0] + 60_000 - now };
        }
        served.push(now);
        stats.ok++;
        stats.peakPerMinute = Math.max(stats.peakPerMinute, served.length);
        return { status: 200 };
    };
    return { hit, stats };
}

const LIVE = { title: "A perfectly reasonable page title for search", description: "d".repeat(120), canonical: "https://x.com/p", noindex: false, ldTypes: ["Article"] };

/** The real audit service over `n` pages, fetching through the real gate against the simulated site. */
function auditAgainst(n: number, rps: number) {
    const clock = virtualClock();
    const server = rateLimitedServer(clock);
    const gate = new HostGate(clock);
    const ledger: any[] = [];
    const find = (w: any) => ledger.find((r) => r.target === w.workspaceId_target_task.target);
    const prisma = {
        pageAudit: {
            findUnique: async ({ where }: any) => find(where) ?? null,
            upsert: async ({ where, create, update }: any) => { const hit = find(where); if (hit) Object.assign(hit, update); else ledger.push({ ...create }); },
            deleteMany: async () => undefined,
        },
        contentEntry: { findMany: async () => [], count: async () => 1 },
        media: { findMany: async () => [] },
    };
    const seo = { livePage: async (_url: string, r: number) => ({ ...LIVE, ...(await politeRequest(gate, "x.com", 1000 / r, server.hit)) }) };
    const pages = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, slug: `p${i}`, locale: "en", title: `Page ${i}`, path: `/p${i}`, typeId: "t", publishedAt: null, data: {} }));
    const sitePages = { pages: async () => pages, siteUrl: async () => "https://x.com", crawlRps: async () => rps };
    const audit = new SeoAuditService(prisma as any, seo as any, null as any, sitePages as any, { del: async () => undefined } as any, null as any);
    return { audit, clock, server, ledger };
}

describe("polite crawling against a site that 429s above 120 requests per minute", () => {
    it("at the default 1 request per second it is never rate limited", async () => {
        const { audit, clock, server, ledger } = auditAgainst(300, 1);
        const r = await audit.auditWorkspace("w");
        expect(server.stats.refused).toBe(0);
        expect(server.stats.peakPerMinute).toBeLessThanOrEqual(60);
        expect(clock.t).toBeGreaterThanOrEqual(299_000); // 300 pages took about 300 seconds
        expect(r).toMatchObject({ scanned: 300, checked: 300, notChecked: 0, rps: 1 });
        expect(ledger).toHaveLength(300);
    });

    it("configured faster, it backs off on 429, resumes, and records no finding for a refused page", async () => {
        const { audit, server, ledger } = auditAgainst(300, 5);
        const progress: { done: number; notChecked: number }[] = [];
        const r = await audit.auditWorkspace("w", (p) => void progress.push(p));
        expect(server.stats.refused).toBeGreaterThan(0); // it did get rate limited
        expect(server.stats.peakPerMinute).toBeLessThanOrEqual(120);
        // After honouring Retry-After every page ended up checked: none left behind.
        expect(r).toMatchObject({ scanned: 300, checked: 300, notChecked: 0 });
        expect(progress.at(-1)).toMatchObject({ done: 300, notChecked: 0 });
        // A 429 never became a finding ("unreachable", "missing canonical"…).
        const codes = new Set(ledger.flatMap((row) => (row.l1Findings ?? []).map((f: any) => f.code)));
        expect(codes.has("TECH_PAGE_UNREACHABLE")).toBe(false);
        expect(ledger.every((row) => !row.live?.notChecked)).toBe(true);
    });

    it("marks pages 'not checked, rate limited' when the site keeps refusing, and says so in the summary", async () => {
        const { audit, ledger } = auditAgainst(3, 1);
        (audit as any).seo.livePage = async () => ({ ...LIVE, status: 429 });
        const r = await audit.auditWorkspace("w");
        expect(r).toMatchObject({ scanned: 3, checked: 0, notChecked: 3 });
        expect(ledger.map((row) => row.live)).toEqual(Array(3).fill({ status: 429, notChecked: "rate limited" }));
        expect(ledger.every((row) => !row.l1Findings?.length)).toBe(true);
        expect(auditSummary(r)).toBe("Checked 0 of 3 pages, 0 unchanged, 3 not checked (rate limited, will retry)");
    });
});

describe("HostGate", () => {
    it("spaces requests per host and holds them for Retry-After", async () => {
        const clock = virtualClock();
        const gate = new HostGate(clock);
        await gate.take("a.com", 1000);
        await gate.take("a.com", 1000);
        expect(clock.t).toBe(1000);
        await gate.take("b.com", 1000); // another host is not held up
        expect(clock.t).toBe(1000);
        expect(gate.backoff("a.com", 30_000)).toBe(30_000);
        await gate.take("a.com", 1000);
        expect(clock.t).toBe(31_000);
    });

    it("doubles the pause when the host gives no Retry-After, and resets on success", () => {
        const gate = new HostGate(virtualClock());
        expect([gate.backoff("a.com"), gate.backoff("a.com"), gate.backoff("a.com")]).toEqual([5000, 10000, 20000]);
        gate.ok("a.com");
        expect(gate.backoff("a.com")).toBe(5000);
    });

    it("reads Retry-After, clamps the configured rate, and knows a transient status", () => {
        expect(retryAfterMs("30", 0)).toBe(30_000);
        expect(retryAfterMs("Thu, 01 Jan 1970 00:01:00 GMT", 0)).toBe(60_000);
        expect(retryAfterMs(null, 0)).toBeUndefined();
        expect([clampRps(undefined), clampRps(50), clampRps(0.01), clampRps(2)]).toEqual([1, 10, 0.1, 2]);
        expect([429, 500, 503, 0].every(isTransient)).toBe(true);
        expect([200, 403, 404].some(isTransient)).toBe(false);
    });
});
