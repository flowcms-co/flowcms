import { describe, expect, it, vi } from "vitest";
import { SeoService } from "./seo.service";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PAGE_HTML = `<html><head><title>${"Water damage restoration near you"}</title><meta name="description" content="${"x".repeat(100)}"><link rel="canonical" href="https://x.com/"><meta name="viewport" content="width=device-width"></head><body><h1>Hi</h1></body></html>`;

function make(psiRows: any[] = []) {
    const store = new Map<string, any>();
    const prisma = {
        metricSnapshot: { findMany: async () => [] },
        pageAudit: { findMany: async () => psiRows, upsert: async () => undefined, deleteMany: async () => undefined },
        integration: { findFirst: async () => null },
    };
    const cache = { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: any) => void store.set(k, v) };
    const sitePages = { siteUrl: async () => "https://x.com", crawlRps: async () => 1, crawlRate: async () => ({ start: 1, max: 1 }), pages: async () => [{ id: "e1", typeId: "t", path: "/gone" }] };
    const seo = new SeoService(prisma as any, null as any, null as any, null as any, cache as any, sitePages as any);
    return { seo, store };
}

describe("SeoService.crawl", () => {
    it("audits only 200 responses and reports the rest with their status", async () => {
        const { seo } = make();
        (seo as any).fetchText = async () => ({ ok: false, status: 404, text: "" });
        (seo as any).fetchHtml = async (url: string) =>
            url.endsWith("/gone") ? { url, ok: false, status: 404, html: "<html><title>Not found</title></html>" } : { url, ok: true, status: 200, html: PAGE_HTML };
        const r = await seo.crawl("w", true);
        expect(r.crawled).toBe(1);
        expect(r.attempted).toBe(2);
        expect(r.blocked).toEqual([{ url: "https://x.com/gone", status: 404 }]);
        expect(r.userAgent).toMatch(/^FlowCMS-SEO-Auditor/);
    });

    it("says the crawler was blocked when every page is refused", async () => {
        const { seo } = make();
        (seo as any).fetchText = async () => ({ ok: false, status: 403, text: "" });
        (seo as any).fetchHtml = async (url: string) => ({ url, ok: false, status: 403, html: "<html>Forbidden</html>" });
        const r = await seo.crawl("w", true);
        expect(r).toMatchObject({ hasData: false, reason: "blocked" });
    });

    it("shares one crawl between concurrent callers", async () => {
        const { seo } = make();
        (seo as any).fetchText = async () => ({ ok: false, status: 404, text: "" });
        const fetchHtml = vi.fn(async (url: string) => ({ url, ok: true, status: 200, html: PAGE_HTML }));
        (seo as any).fetchHtml = fetchHtml;
        await Promise.all([seo.crawl("w", true), seo.crawl("w", true)]);
        expect(fetchHtml).toHaveBeenCalledTimes(2); // 2 URLs, crawled once
    });

    it("never makes a page load wait on the first crawl", async () => {
        const { seo, store } = make();
        (seo as any).fetchText = async () => ({ ok: false, status: 404, text: "" });
        (seo as any).fetchHtml = async (url: string) => ({ url, ok: true, status: 200, html: PAGE_HTML });
        expect(await seo.crawl("w")).toEqual({ hasData: false, reason: "pending" });
        await vi.waitFor(() => expect(store.get("seo:crawl:w")?.hasData).toBe(true));
        expect((await seo.crawl("w")).hasData).toBe(true);
    });
});

describe("SeoService.vitals", () => {
    it("serves stored runs per URL and strategy without calling PageSpeed on the request", async () => {
        const run = (strategy: string, performance: number) => ({ url: "https://x.com", strategy, fetchedAt: new Date().toISOString(), performance, opportunities: [], vitals: [{ metric: "LCP", value: "2.1s", target: "< 2.5s", status: "good", source: "lab", scored: true }] });
        const { seo } = make([
            { target: "desktop:https://x.com", lastCheckedAt: new Date(), live: run("desktop", 96) },
            { target: "mobile:https://x.com", lastCheckedAt: new Date(), live: run("mobile", 71) },
        ]);
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const v = await seo.vitals("w");
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(v).toMatchObject({ hasData: true, performance: 71, tested: { url: "https://x.com", strategy: "mobile" }, refreshing: false });
        expect(v.pages.map((p: any) => [p.strategy, p.performance])).toEqual([["desktop", 96], ["mobile", 71]]);
        fetchSpy.mockRestore();
    });

    it("reports a stored failure with its reason and the key hint", async () => {
        const { seo } = make([{ target: "mobile:https://x.com", lastCheckedAt: new Date(), live: { url: "https://x.com", strategy: "mobile", fetchedAt: "", performance: null, vitals: [], opportunities: [], error: "psi-429", needsKey: true } }]);
        const v = await seo.vitals("w");
        expect(v).toMatchObject({ hasData: false, reason: "psi-429", needsKey: true });
        expect(v.message).toMatch(/API key/);
    });
});
