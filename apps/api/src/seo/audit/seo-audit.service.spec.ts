import { describe, expect, it } from "vitest";
import { writableMeta } from "./seo-job.handlers";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { LIVE, make, page } from "./audit.harness";

describe("SeoAuditService", () => {
    it("audits every page (no 500 cap), stores the real path, and drops rows of non-pages", async () => {
        const pages = Array.from({ length: 620 }, (_, i) => page(`p${i}`, `/svc/p${i}`));
        const { audit, ledger } = make({ pages, ledger: [{ target: "a-city-entry", entryId: "a-city-entry", task: "page", l1Findings: [] }] });
        const r = await audit.auditWorkspace("w");
        expect(r.scanned).toBe(620);
        expect(ledger).toHaveLength(620);
        expect(ledger.find((x) => x.target === "a-city-entry")).toBeUndefined();
        expect(ledger.find((x) => x.target === "p7").url).toBe("/svc/p7");
    });

    it("reads the live page at the mapped URL when the workspace has a site URL", async () => {
        const { audit, ledger, seo } = make({ pages: [page("p1", "/fire-damage-restoration/albuquerque-nm")], site: "https://nearbypros.com" });
        await audit.auditWorkspace("w");
        expect(seo.livePage.mock.calls[0][0]).toBe("https://nearbypros.com/fire-damage-restoration/albuquerque-nm");
        const codes = ledger[0].l1Findings.map((f: any) => f.code);
        expect(codes).not.toContain("TECH_CANONICAL_MISSING");
        expect(codes).not.toContain("META_DESC_MISSING");
    });

    it("says PageSpeed is unavailable instead of inventing an LCP issue", async () => {
        const { audit } = make({ pages: [page("p1", "/a")] });
        await audit.auditWorkspace("w");
        const issues = await audit.issues("w");
        expect(issues.groups.find((g) => g.key === "CWV_LCP_POOR")).toBeUndefined();
        const psi = issues.groups.find((g) => g.key === "PSI_UNAVAILABLE")!;
        expect(psi.explanation).toMatch(/did not answer in time/);
        expect(issues.counts.pages).toBe(1);
    });

    it("generates alt for section images, the set the audit flags", async () => {
        const data = { sections: [{ __component: "hero", Image: "/media/pipe.webp", "Alt text": "" }] };
        const { audit, assets } = make({ pages: [page("p1", "/a", data)], media: [{ id: "m1", url: "/media/pipe.webp", alt: null }] });
        const r = await audit.generatePageAlt("w", "u", "p1");
        expect(assets.generateAlt).toHaveBeenCalledWith("w", "u", "m1");
        expect(r.suggestions).toEqual([{ src: "/media/pipe.webp", alt: "A burst pipe under a sink" }]);
    });
});

describe("capped checks and non-page types", () => {
    const body = (i: number) => ({ body: `<p>${Array.from({ length: 40 }, (_, w) => `word${i}x${w}`).join(" ")}</p>` });

    it("reports checked N of M and never calls a capped result clean", async () => {
        const pages = Array.from({ length: 450 }, (_, i) => page(`p${String(i).padStart(3, "0")}`, `/p${i}`, body(i)));
        const { audit } = make({ pages, linksChecked: 400 });
        await audit.auditWorkspace("w");
        const issues = await audit.issues("w");
        // No duplicates among the 400 compared, but 50 pages were not compared: the
        // result says so instead of implying the whole site is free of duplicates.
        expect(issues.groups.find((g) => g.key === "DUPLICATE_CONTENT")).toBeUndefined();
        expect(issues.coverage!.duplicates).toEqual({ checked: 400, total: 450, capped: true, by: "recency" });
        expect(issues.coverage!.links).toMatchObject({ checked: 400, total: 450, capped: true });
    });

    it("lists types with published entries that are not marked as pages", async () => {
        const nonPageTypes = [{ id: "t_city", name: "City", published: 212, hasPattern: false }];
        const { audit } = make({ pages: [page("p1", "/a")], nonPageTypes });
        await audit.auditWorkspace("w");
        expect((await audit.issues("w")).nonPageTypes).toEqual(nonPageTypes);
    });
});

describe("writableMeta", () => {
    it("leaves inherited fields alone and writes the ones the entry owns or truly lacks", () => {
        // Child entry with no own description; the live page shows the parent's template.
        expect(writableMeta({ metaTitle: "", metaDescription: "" }, { title: "Templated", description: "From the service" })).toEqual({ title: false, description: false });
        expect(writableMeta({ metaTitle: "Mine", metaDescription: "" }, { title: "Mine", description: "" })).toEqual({ title: true, description: true });
        expect(writableMeta({}, null)).toEqual({ title: true, description: true });
    });
});

describe("structured data findings", () => {
    const typed = (id: string, path: string, pageType: string) => ({ ...page(id, path), pageType, typeJsonLd: null, noindexIntended: false });
    const live = (ldTypes: string[]) => ({ ...LIVE, ldTypes });

    it("does not report a service page with Service and FAQ schema, names Article when a blog page lacks it, and keeps 'No structured data' for none at all", async () => {
        const pages = [typed("svc", "/svc", "service"), typed("post", "/blog/post", "blog"), typed("bare", "/bare", "service"), typed("ok", "/blog/ok", "blog")];
        const byUrl: Record<string, string[]> = { "/svc": ["Service", "FAQPage", "BreadcrumbList"], "/blog/post": ["BreadcrumbList", "Organization"], "/bare": [], "/blog/ok": ["BlogPosting"] };
        const { audit } = make({ pages, site: "https://x.com", live: (url) => live(byUrl[new URL(url).pathname]) });
        await audit.auditWorkspace("w");
        const { groups } = await audit.issues("w");
        const pagesOf = (key: string) => groups.find((g) => g.key === key)?.pages.map((p) => p.id) ?? [];
        expect(pagesOf("SCHEMA_ARTICLE_MISSING")).toEqual(["post"]);
        expect(groups.find((g) => g.key === "SCHEMA_ARTICLE_MISSING")!.title).toBe("No Article schema");
        expect(pagesOf("SCHEMA_MISSING")).toEqual(["bare"]);
        expect(groups.find((g) => g.key === "SCHEMA_MISSING")!.title).toBe("No structured data");
    });
});

describe("noindexed pages", () => {
    const hidden = (id: string, intended = false) => ({ ...page(id, `/${id}`, { body: `<p>${"same words here again ".repeat(80)}</p>` }), pageType: "service", typeJsonLd: null, noindexIntended: intended });
    // noindex, a 90-character title and no description: all ranking-only problems.
    const noindexLive = { ...LIVE, noindex: true, title: "t".repeat(90), description: "" };

    it("are counted as hidden, kept out of the total and the ranking checks, and count as clean", async () => {
        const pages = [hidden("a"), hidden("b"), hidden("c")];
        const { audit } = make({ pages, site: "https://x.com", live: () => noindexLive });
        await audit.auditWorkspace("w");
        const issues = await audit.issues("w");
        expect(issues.counts).toMatchObject({ noindexed: 3, pages: 3, clean: 3 });
        for (const key of ["TECH_NOINDEX", "META_TITLE_LONG", "META_DESC_MISSING", "DUPLICATE_CONTENT", "CANNIBALIZATION"]) expect(issues.groups.find((g) => g.key === key)).toBeUndefined();
    });

    it("warn only when the page looks like it should rank, unless the type intends noindex", async () => {
        const pages = [hidden("in-sitemap"), hidden("quiet"), hidden("intended", true)];
        const crawl = { hasData: false, sitemapPaths: ["/in-sitemap", "/intended"], navPaths: [] };
        const { audit } = make({ pages, site: "https://x.com", live: () => noindexLive, crawl });
        await audit.auditWorkspace("w");
        const issues = await audit.issues("w");
        const g = issues.groups.find((x) => x.key === "TECH_NOINDEX")!;
        expect(g.pages.map((p) => p.id)).toEqual(["in-sitemap"]);
        expect(g.pages[0].detail).toMatch(/listed in the sitemap/);
        expect(issues.counts.noindexed).toBe(3);
    });
});

describe("rows from before", () => {
    it("discards rows written by an older rule set and never renders a row with no URL and title", async () => {
        const stale = { id: "s1", target: "old", entryId: "old", task: "page", url: null, contentHash: "abc123", l1Findings: [{ code: "TECH_CANONICAL_MISSING", task: "technical_diagnosis", severity: 1 }] };
        const { audit, ledger } = make({ pages: [page("p1", "/a")], ledger: [stale] });
        const before = await audit.issues("w"); // before any run: the old row is not shown
        expect(before.counts.total).toBe(0);
        expect(before.groups.flatMap((g) => g.pages).some((p) => !p.url && !p.title)).toBe(false);
        await audit.auditWorkspace("w");
        expect(ledger.map((r) => r.target)).toEqual(["p1"]);
        expect(ledger[0].contentHash).toMatch(/^r2:/);
    });

    it("while a run is in progress, reports N of M and shows only rows already re-checked", async () => {
        const pages = [page("p1", "/a"), page("p2", "/b")];
        const { audit, store, ledger } = make({ pages });
        await audit.auditWorkspace("w");
        expect((await audit.issues("w")).run).toBeNull();
        // A new run has started and reached p1 only.
        const startedAt = new Date().toISOString();
        store.set("seo:audit-run:w", { done: 1, total: 2, startedAt });
        ledger.find((r) => r.target === "p1").lastCheckedAt = new Date(Date.now() + 1000);
        ledger.find((r) => r.target === "p2").lastCheckedAt = new Date(Date.now() - 60_000);
        const mid = await audit.issues("w");
        expect(mid.run).toEqual({ done: 1, total: 2, startedAt });
        expect(mid.counts.pages).toBe(1);
    });
});
