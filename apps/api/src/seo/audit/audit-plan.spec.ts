import { describe, expect, it } from "vitest";
import { LIVE, make, page } from "./audit.harness";
import { SAMPLE_SIZE, fetchOrder, inferLive, needsFetch, planRun, templateOf } from "./audit-plan";

/* eslint-disable @typescript-eslint/no-explicit-any */
const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const urls = (seo: any) => seo.livePage.mock.calls.map((c: any[]) => new URL(c[0]).pathname).sort();

describe("incremental runs", () => {
    it("an unchanged workspace triggers zero fetches on a second run", async () => {
        const pages = Array.from({ length: 40 }, (_, i) => page(`p${i}`, `/p${i}`));
        const { audit, seo } = make({ pages, site: "https://x.com" });
        const first = await audit.auditWorkspace("w");
        expect(first).toMatchObject({ fetched: 40, reused: 0 });
        seo.livePage.mockClear();
        const second = await audit.auditWorkspace("w");
        expect(seo.livePage).not.toHaveBeenCalled();
        expect(second).toMatchObject({ scanned: 40, fetched: 0, reused: 40, unchanged: 40 });
        expect((await audit.plan("w")).toFetch).toBe(0);
        expect((await audit.plan("w", "full")).toFetch).toBe(40);
    });

    it("changing one parent entry re-fetches exactly its child pages", async () => {
        // Two services, each with three city pages. A page's changedAt covers the
        // entries it references, so editing a service moves its children's changedAt.
        const child = (service: string, i: number) => page(`${service}-city${i}`, `/${service}/city${i}`, { service: `id_${service}` });
        const pages = [page("fire", "/fire"), page("water", "/water"), ...[0, 1, 2].map((i) => child("fire", i)), ...[0, 1, 2].map((i) => child("water", i))];
        const { audit, seo } = make({ pages, site: "https://x.com" });
        await audit.auditWorkspace("w");
        seo.livePage.mockClear();

        const later = new Date(Date.now() + 60_000); // the "fire" service entry was edited
        for (const p of pages) if (p.id === "fire" || p.id.startsWith("fire-")) p.changedAt = later;
        const r = await audit.auditWorkspace("w");
        expect(urls(seo)).toEqual(["/fire", "/fire/city0", "/fire/city1", "/fire/city2"]);
        expect(r).toMatchObject({ fetched: 4, reused: 4 });
    });

    it("re-fetches a page whose sitemap lastmod is newer, and pages the site signalled as changed", async () => {
        const pages = [page("a", "/a"), page("b", "/b"), page("c", "/c")];
        const lastmod = new Map<string, Date>();
        const { audit, seo } = make({ pages, site: "https://x.com", lastmod });
        await audit.auditWorkspace("w");
        seo.livePage.mockClear();
        lastmod.set("/b", new Date(Date.now() + 60_000));
        expect(await audit.markChanged("w", ["https://x.com/c/", "/nope"])).toBe(1);
        await audit.auditWorkspace("w");
        expect(urls(seo)).toEqual(["/b", "/c"]);
    });

    it("sends stored validators and treats 304 as unchanged without losing the page's facts", async () => {
        const seen: any[] = [];
        const { audit, ledger } = make({
            pages: [page("a", "/a")],
            site: "https://x.com",
            live: (_u, _r, validators) => {
                seen.push(validators);
                return validators?.etag ? { status: 304, title: "", description: "", canonical: "", noindex: false, ldTypes: [] } : { ...LIVE, etag: '"v1"', lastModified: "Mon, 05 Oct 2026 00:00:00 GMT" };
            },
        });
        await audit.auditWorkspace("w");
        const firstFetch = ledger[0].fetchedAt;
        await new Promise((r) => setTimeout(r, 5));
        const r = await audit.auditWorkspace("w", undefined, "full");
        expect(seen[1]).toEqual({ etag: '"v1"', lastModified: "Mon, 05 Oct 2026 00:00:00 GMT" });
        expect(r).toMatchObject({ fetched: 1, unchanged: 1 });
        expect(ledger[0].live).toMatchObject({ status: 200, title: LIVE.title, etag: '"v1"' });
        expect(ledger[0].fetchedAt > firstFetch).toBe(true);
    });
});

describe("template sampling", () => {
    const cities = (n: number) => Array.from({ length: n }, (_, i) => page(`c${String(i).padStart(4, "0")}`, `/svc/c${i}`, {}, { typeId: "city" }));

    it("verifies a large type by a sample of 50 and labels the rest as inferred, never as clean", async () => {
        const pages = cities(260);
        const title = (url: string) => `Title of c${String(Number(new URL(url).pathname.split("/c")[1])).padStart(4, "0")} | Brand name here`;
        const { audit, seo, ledger } = make({ pages, site: "https://x.com", live: (url) => ({ ...LIVE, title: title(url), canonical: url, ldTypes: ["Service", "FAQPage"] }) });
        const r = await audit.auditWorkspace("w");
        expect(seo.livePage).toHaveBeenCalledTimes(SAMPLE_SIZE);
        expect(r).toMatchObject({ fetched: 50, inferred: 210, escalatedTypes: [] });
        const inferred = ledger.filter((row) => row.live?.inferred);
        expect(inferred).toHaveLength(210);
        expect(inferred[0].live).toMatchObject({ inferred: { sample: 50, total: 260 }, ldTypes: ["FAQPage", "Service"] });
        expect(inferred.every((row) => row.fetchedAt === null)).toBe(true);
        // The inferred title follows the template the sample showed.
        expect(inferred[0].live.title).toBe(`Title of ${inferred[0].target} | Brand name here`);

        const issues = await audit.issues("w");
        expect(issues.counts).toMatchObject({ pages: 260, inferred: 210 });
        expect(issues.counts.clean).toBeLessThanOrEqual(50); // only fetched pages can be clean
        expect(issues.freshness!.sampledTypes).toEqual([{ name: "City pages", verified: 50, total: 260 }]);

        // The template changes: the next run samples 50 different pages (the ones
        // just fetched are no longer the stalest), and pages verified before the
        // change go back to inferred rather than staying "verified".
        const first = new Set(seo.livePage.mock.calls.map((c: any[]) => c[0]));
        seo.livePage.mockClear();
        for (const p of pages) p.changedAt = new Date(Date.now() + 60_000);
        await audit.auditWorkspace("w");
        const second = seo.livePage.mock.calls.map((c: any[]) => c[0]);
        expect(second).toHaveLength(SAMPLE_SIZE);
        expect(second.some((u: string) => first.has(u))).toBe(false);
        expect(ledger.filter((row) => row.fetchedAt)).toHaveLength(SAMPLE_SIZE);
    });

    it("a sample that disagrees escalates to a full check of that type", async () => {
        const pages = [...cities(260), page("about", "/about")];
        // Every third city page is noindex: the pages of this type are not alike.
        const live = (url: string) => ({ ...LIVE, canonical: url, noindex: Number(new URL(url).pathname.split("/c")[1] ?? 1) % 3 === 0 });
        const { audit, seo, ledger } = make({ pages, site: "https://x.com", live });
        const r = await audit.auditWorkspace("w");
        expect(r.escalatedTypes).toEqual(["city"]);
        expect(r).toMatchObject({ fetched: 261, inferred: 0 });
        expect(seo.livePage).toHaveBeenCalledTimes(261);
        expect(ledger.every((row) => row.fetchedAt && !row.live.inferred)).toBe(true);
        // Each page carries its own, fetched, noindex state.
        expect(ledger.filter((row) => row.live.noindex)).toHaveLength(87);
    });
});

describe("planning", () => {
    const p = (id: string, typeId = "t", changedAt = day(1)) => ({ id, path: `/${id}`, typeId, changedAt, publishedAt: null });

    it("fetches only what changed since its last fetch", () => {
        expect(needsFetch(p("a"), undefined)).toBe(true);
        expect(needsFetch(p("a"), { fetchedAt: null })).toBe(true);
        expect(needsFetch(p("a"), { fetchedAt: day(2), notChecked: true })).toBe(true);
        expect(needsFetch(p("a", "t", day(3)), { fetchedAt: day(2) })).toBe(true);
        expect(needsFetch(p("a"), { fetchedAt: day(2) })).toBe(false);
        expect(needsFetch(p("a"), { fetchedAt: day(2) }, day(3))).toBe(true);
    });

    it("full fetches everything, and without a site URL nothing is fetched", () => {
        const pages = [p("a"), p("b")];
        const rows = new Map([["a", { fetchedAt: day(2) }], ["b", { fetchedAt: day(2) }]]);
        expect([...planRun(pages, rows, { mode: "changed", hasSite: true }).values()]).toEqual(["reuse", "reuse"]);
        expect([...planRun(pages, rows, { mode: "full", hasSite: true }).values()]).toEqual(["fetch", "fetch"]);
        expect([...planRun(pages, new Map(), { mode: "full", hasSite: false }).values()]).toEqual(["reuse", "reuse"]);
    });

    it("a deploy samples every type instead of crawling it", () => {
        const pages = Array.from({ length: 120 }, (_, i) => p(`c${i}`, "city"));
        const actions = [...planRun(pages, new Map(), { mode: "sample", hasSite: true }).values()];
        expect(actions.filter((a) => a === "fetch")).toHaveLength(SAMPLE_SIZE);
        expect(actions.filter((a) => a === "infer")).toHaveLength(70);
    });

    it("orders indexable pages by impressions, then the rest, then noindexed pages last", () => {
        const pages = [p("hidden"), p("quiet"), p("popular"), p("some")];
        const rows = new Map([["hidden", { fetchedAt: day(1), noindex: true }]]);
        const order = fetchOrder(pages, rows, new Map([["/popular", 900], ["/some", 10], ["/hidden", 5000]]));
        expect(order.map((x) => x.id)).toEqual(["popular", "some", "quiet", "hidden"]);
    });

    it("infers only what a consistent sample shows, and leaves the rest unknown", () => {
        const s = (title: string, entryTitle: string, extra = {}) => ({ live: { ...LIVE, title, description: "From a parent", ...extra }, entryTitle, entryDescription: "" });
        const t = templateOf([s("Fire in Austin | Brand", "Fire in Austin"), s("Water in Reno | Brand", "Water in Reno")])!;
        expect(t.title).toEqual({ prefix: "", suffix: " | Brand" });
        expect(t.descriptionFromEntry).toBe(false);
        const live = inferLive(t, { entryTitle: "Mold in Boise", entryDescription: "", url: "https://x.com/mold/boise" }, { size: 2, total: 9 });
        expect(live).toMatchObject({ title: "Mold in Boise | Brand", descriptionUnknown: true, canonical: "https://x.com/mold/boise", inferred: { sample: 2, total: 9 } });
        // Different JSON-LD, a missing canonical or a failed page: no template.
        expect(templateOf([s("A", "A"), s("B", "B", { ldTypes: ["Service"] })])).toBeNull();
        expect(templateOf([s("A", "A"), s("B", "B", { status: 404 })])).toBeNull();
        // A title the template does not build from the entry is not guessed.
        expect(templateOf([s("Totally custom", "A"), s("Another one", "B")])!.title).toBeNull();
    });
});

describe("run control, estimates and the rolling re-check", () => {
    it("says how many pages a run will fetch and how long that takes before starting", async () => {
        const pages = Array.from({ length: 90 }, (_, i) => page(`p${i}`, `/p${i}`));
        const { audit } = make({ pages, site: "https://x.com", rate: { start: 0.5, max: 10 } });
        expect(await audit.plan("w")).toMatchObject({ total: 90, toFetch: 90, reuse: 0, rps: 0.5, maxRps: 10, estimatedSeconds: 180 });
        await audit.auditWorkspace("w");
        expect(await audit.plan("w")).toMatchObject({ toFetch: 0, reuse: 90, estimatedSeconds: 0 });
    });

    it("stops between pages when cancelled, leaving the rest for the next run", async () => {
        const pages = Array.from({ length: 30 }, (_, i) => page(`p${String(i).padStart(2, "0")}`, `/p${i}`));
        let fetched = 0;
        const h = make({ pages, site: "https://x.com", live: () => { if (++fetched === 8) void h.audit.control("w", "cancel"); return LIVE; } });
        const r = await h.audit.auditWorkspace("w");
        expect(r.cancelled).toBe(true);
        expect(r.fetched).toBeLessThan(30);
        expect(await h.audit.runState("w")).toBeNull();
        // Nothing unfetched was written as checked; the next run picks up the rest.
        expect((await h.audit.plan("w")).toFetch).toBe(30 - r.fetched);
    });

    it("re-fetches the stalest pages first, within the budget, and not during a run", async () => {
        const pages = [page("old", "/old"), page("older", "/older"), page("fresh", "/fresh"), page("sampled", "/sampled")];
        const { audit, seo, ledger, store } = make({ pages, site: "https://x.com" });
        await audit.auditWorkspace("w");
        const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
        const set = (id: string, at: Date | null) => void (ledger.find((r) => r.target === id).fetchedAt = at);
        set("old", ago(20)); set("older", ago(40)); set("fresh", ago(1)); set("sampled", null);
        seo.livePage.mockClear();
        expect(await audit.recheckStalest("w", 2)).toBe(2);
        expect(urls(seo)).toEqual(["/older", "/sampled"]); // never fetched and the oldest, not the 1-day-old page
        seo.livePage.mockClear();
        store.set("seo:audit-run:w", { done: 0, total: 5, startedAt: new Date().toISOString() });
        expect(await audit.recheckStalest("w", 2)).toBe(0);
        expect(seo.livePage).not.toHaveBeenCalled();
    });

    it("brings rows from an older rule set up to date from stored facts, with no request", async () => {
        const stale = { id: "row_a", target: "a", entryId: "a", task: "page", url: "/a", contentHash: "abc123", fetchedAt: new Date(), live: LIVE, l1Findings: [{ code: "TECH_CANONICAL_MISSING", task: "technical_diagnosis", severity: 1 }], workspaceId: "w" };
        const { audit, seo, ledger } = make({ pages: [page("a", "/a")], site: "https://x.com", ledger: [stale] });
        expect(await audit.refreshOldRules()).toBe(1);
        expect(seo.livePage).not.toHaveBeenCalled();
        expect(ledger[0].contentHash).toMatch(/^r2:/);
        expect(ledger[0].l1Findings.map((f: any) => f.code)).not.toContain("TECH_CANONICAL_MISSING");
    });
});
