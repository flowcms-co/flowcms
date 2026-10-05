import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { encryptSecret } from "@flowcms/shared";
import { safeFetch } from "../common/ssrf";
import { SeoService } from "./seo.service";
import { SitePagesService } from "./site-pages.service";
import { WorkspaceController } from "../workspace/workspace.controller";
import { PrefixRejected } from "./audit/seo-audit.service";
import { LIVE, make, page } from "./audit/audit.harness";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("../common/ssrf", () => ({ safeFetch: vi.fn() }));

const KEY = "3f9c0a7e51d2";
const PREFIX = `/_audit/${KEY}`;
const SITE = "https://example.com";
const html = (path: string, extra = "") => `<html><head><title>Page ${path}</title><link rel="canonical" href="${SITE}${path === "/" ? "/" : path}">${extra}</head><body><h1>x</h1></body></html>`;

/** A site that serves every page directly and under the keyed path. */
const site = (overrides: Record<string, () => Response> = {}) =>
    vi.mocked(safeFetch).mockImplementation(async (raw: string) => {
        const u = new URL(raw);
        const real = u.pathname.startsWith(PREFIX) ? u.pathname.slice(PREFIX.length) || "/" : u.pathname;
        if (overrides[u.pathname]) return overrides[u.pathname]();
        if (real === "/robots.txt" || real === "/sitemap.xml" || real === "/llms.txt") return new Response("User-agent: *", { status: 200, headers: { "content-type": "text/plain" } });
        return new Response(html(real), { status: 200, headers: { "content-type": "text/html", etag: '"v1"' } });
    });
const requested = () => vi.mocked(safeFetch).mock.calls.map((c) => c[0] as string);

function seoService(prefix?: string) {
    const store = new Map<string, any>();
    const prisma = { metricSnapshot: { findMany: async () => [] }, pageAudit: { findMany: async () => [] }, integration: { findFirst: async () => null } };
    const cache = { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: any) => void store.set(k, v) };
    const rate = { start: 10, max: 10, prefix, epoch: prefix ? "p" : "direct" };
    const sitePages = { siteUrl: async () => SITE, crawlRate: async () => rate, pages: async () => [{ id: "e1", typeId: "t", path: "/services/fire", noindexIntended: false }] };
    return { seo: new SeoService(prisma as any, null as any, null as any, null as any, cache as any, sitePages as any), store, rate };
}

let logged: string[] = [];
beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64"); // test-only key
    logged = [];
    for (const level of ["log", "warn", "error", "debug"] as const) vi.spyOn(Logger.prototype, level).mockImplementation((...a: any[]) => void logged.push(a.join(" ")));
    vi.spyOn(console, "log").mockImplementation((...a: any[]) => void logged.push(a.join(" ")));
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(safeFetch).mockReset();
});

describe("audit fetch prefix", () => {
    it("off: pages are requested at their own URLs", async () => {
        site();
        const { seo, rate } = seoService();
        const facts = await seo.livePage(`${SITE}/services/fire`, rate);
        expect(requested()).toEqual([`${SITE}/services/fire`]);
        expect(facts).toMatchObject({ status: 200, canonical: `${SITE}/services/fire` });
    });

    it("on: the request carries the prefix; what comes back, is stored and is reported does not", async () => {
        site();
        const { seo, rate } = seoService(PREFIX);
        const facts = await seo.livePage(`${SITE}/services/fire?ref=1`, rate);
        expect(requested()).toEqual([`${SITE}${PREFIX}/services/fire?ref=1`]);
        expect(JSON.stringify(facts)).not.toContain(KEY);
        expect(facts).toMatchObject({ status: 200, title: "Page /services/fire", etag: '"v1"' });
    });

    it("a self-canonical page still passes the canonical comparison", async () => {
        site();
        const { seo } = seoService(PREFIX);
        const f = await (seo as any).fetchHtmlNow(`${SITE}/services/fire`, undefined, PREFIX);
        expect(f.url).toBe(`${SITE}/services/fire`);
        expect((seo as any).parsePage(f.url, f.html)).toMatchObject({ canonical: true, canonicalSelf: true, path: "/services/fire" });
    });

    it("a prefix the site echoes into the page is read as the real URL", async () => {
        site({ [`${PREFIX}/leaky`]: () => new Response(`<html><head><title>T</title><link rel="canonical" href="${SITE}${PREFIX}/leaky"></head></html>`, { status: 200, headers: { "content-type": "text/html" } }) });
        const { seo, rate } = seoService(PREFIX);
        const facts = await seo.livePage(`${SITE}/leaky`, rate);
        expect(facts.canonical).toBe(`${SITE}/leaky`);
    });

    it("redirects: a Location with the prefix is the real URL behind it; one that leaves the prefix is followed as is", async () => {
        site({
            [`${PREFIX}/old`]: () => new Response("", { status: 301, headers: { location: `${PREFIX}/new` } }),
            [`${PREFIX}/gated`]: () => new Response("", { status: 302, headers: { location: "https://login.example.net/start" } }),
        });
        const { seo, rate } = seoService(PREFIX);
        expect((await seo.livePage(`${SITE}/old`, rate)).title).toBe("Page /new");
        await seo.livePage(`${SITE}/gated`, rate);
        expect(requested()).toEqual([`${SITE}${PREFIX}/old`, `${SITE}${PREFIX}/new`, `${SITE}${PREFIX}/gated`, "https://login.example.net/start"]);
    });

    it("the crawl goes through the prefix; robots.txt, the sitemap and llms.txt do not", async () => {
        site();
        const { seo } = seoService(PREFIX);
        const crawl = await seo.crawl("w", true);
        const urls = requested();
        for (const file of ["robots.txt", "sitemap.xml", "llms.txt"]) expect(urls).toContain(`${SITE}/${file}`);
        const pages = urls.filter((u) => !/\.(txt|xml)$/.test(u));
        expect(pages.length).toBeGreaterThan(0);
        expect(pages.every((u) => u.startsWith(`${SITE}${PREFIX}/`))).toBe(true);
        // The stored and reported crawl holds real URLs only.
        expect(JSON.stringify(crawl)).not.toContain(KEY);
        expect(crawl.metaRows.map((r: any) => r.path).sort()).toEqual(["/", "/services/fire"]);
    });

    it("the test button reports both status codes and whether the titles match, never the prefix", async () => {
        site();
        const { seo } = seoService(PREFIX);
        const ok = await seo.testFetchPrefix("w");
        expect(ok).toMatchObject({ ok: true, direct: { status: 200 }, prefixed: { status: 200 }, titlesMatch: true });
        site({ [`${PREFIX}/`]: () => new Response("nope", { status: 404 }) });
        const missing = await seo.testFetchPrefix("w");
        expect(missing).toMatchObject({ ok: false, prefixed: { status: 404 } });
        expect(missing.message).toMatch(/key is wrong, or the prefix is not set up/);
        site({ "/_audit/wrong/": () => new Response("no", { status: 403 }) });
        expect((await seo.testFetchPrefix("w", "/_audit/wrong")).message).toMatch(/blocked/);
        expect(JSON.stringify([ok, missing])).not.toContain(KEY);
    });

    it("never writes the prefix to a log line, even when a fetch fails", async () => {
        vi.mocked(safeFetch).mockRejectedValue(new Error(`connect ECONNREFUSED ${SITE}${PREFIX}/services/fire`));
        const { seo, rate } = seoService(PREFIX);
        expect((await seo.livePage(`${SITE}/services/fire`, rate)).status).toBe(0);
        site();
        await seo.crawl("w", true);
        expect(logged.join("\\n")).not.toContain(KEY);
    });
});

describe("audit fetch prefix: the setting and the audit run", () => {
    function workspace(row: Record<string, any> = {}) {
        const state: Record<string, any> = { id: "w", name: "W", slug: "w", locales: ["en"], defaultLocale: "en", onboardedAt: null, seoLearnedRate: { "example.com": 1.4 }, ...row };
        const prisma = { workspace: { findUniqueOrThrow: async () => state, findUnique: async () => state, update: async ({ data }: any) => Object.assign(state, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v && typeof v === "object" && v.constructor?.name === "DbNull" ? null : v]))) } };
        return { ctrl: new WorkspaceController(prisma as any), state, prisma };
    }
    const user = { workspaceId: "w" } as any;

    it("is write-only: saved encrypted, returned only as set + masked, and rejected when malformed without echoing it", async () => {
        const { ctrl, state } = workspace();
        const saved = await ctrl.update(user, { seoFetchPrefix: PREFIX } as any);
        expect(saved).toMatchObject({ seoFetchPrefixSet: true, seoFetchPrefixMasked: "/_audit/••••" });
        expect(JSON.stringify(saved)).not.toContain(KEY);
        expect(JSON.stringify(await (ctrl as any).get(user))).not.toContain(KEY);
        expect(state.seoFetchPrefixEnc).not.toContain(KEY); // encrypted at rest
        // The learned crawl ceiling belonged to the old fetch path.
        expect(state.seoLearnedRate).toBeNull();

        const bad = await ctrl.update(user, { seoFetchPrefix: `${PREFIX}/?x=1` } as any).catch((e: Error) => e);
        expect(bad).toBeInstanceOf(Error);
        expect((bad as Error).message).not.toContain(KEY);

        expect(await ctrl.update(user, { seoFetchPrefix: "" } as any)).toMatchObject({ seoFetchPrefixSet: false, seoFetchPrefixMasked: null });
    });

    it("reaches the fetcher from the stored setting, with a learned ceiling per host", async () => {
        const { prisma } = workspace({ seoFetchPrefixEnc: encryptSecret(PREFIX), seoCrawlRps: 1, seoCrawlMaxRps: 10 });
        const rate = await new SitePagesService(prisma as any).crawlRate("w");
        expect(rate).toMatchObject({ start: 1, max: 10, prefix: PREFIX, learned: { "example.com": 1.4 } });
        expect(rate.epoch).not.toContain(KEY);
    });

    it("the audit stores and reports real URLs, and nothing about the run carries the prefix", async () => {
        const rate = { start: 1, max: 1, prefix: PREFIX };
        const { audit, ledger, store, seo } = make({ pages: [page("fire", "/services/fire")], site: SITE, rate });
        const result = await audit.auditWorkspace("w");
        expect(seo.livePage.mock.calls[0][0]).toBe(`${SITE}/services/fire`); // identity: the real URL
        expect(ledger[0].url).toBe("/services/fire");
        const everything = JSON.stringify([ledger, result, await audit.issues("w"), await audit.plan("w"), [...store.entries()]]);
        expect(everything).not.toContain(KEY);
    });

    it("stops the run when the site no longer accepts the prefix, instead of recording every page as broken", async () => {
        const pages = Array.from({ length: 30 }, (_, i) => page(`p${i}`, `/p${i}`));
        let accepted = true;
        const rate = { start: 1, max: 1, prefix: PREFIX };
        const { audit, ledger } = make({ pages, site: SITE, rate, live: () => (accepted ? LIVE : { ...LIVE, status: 404 }), prefixAccepted: () => accepted });
        await audit.auditWorkspace("w");
        accepted = false; // the key was rotated on the site
        const err = await audit.auditWorkspace("w", undefined, "full").catch((e) => e);
        expect(err).toBeInstanceOf(PrefixRejected);
        expect(err.message).toBe("Audit fetch prefix is no longer accepted by the site");
        // Every page still holds its last good result: none was rewritten as a 404.
        expect(ledger.every((row) => row.live.status === 200)).toBe(true);
        expect(await audit.runState("w")).toBeNull();
    });

    it("still records a genuine 404 when the prefix itself works", async () => {
        const pages = [page("a", "/a"), page("b", "/b")];
        let gone = false;
        const rate = { start: 1, max: 1, prefix: PREFIX };
        const { audit, ledger } = make({ pages, site: SITE, rate, live: (url) => (gone && url.endsWith("/b") ? { ...LIVE, status: 404 } : LIVE) });
        await audit.auditWorkspace("w");
        gone = true;
        await audit.auditWorkspace("w", undefined, "full");
        expect(ledger.find((r) => r.target === "b").l1Findings.map((f: any) => f.code)).toContain("TECH_PAGE_UNREACHABLE");
        expect(ledger.find((r) => r.target === "a").live.status).toBe(200);
    });
});
