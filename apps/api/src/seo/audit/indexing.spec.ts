import { describe, expect, it } from "vitest";
import { renderFinding, type RenderedFinding } from "./audit-engine";
import { SEO_CODES } from "./seo-codes";
import { expectsArticle, hasArticle, isCurrentRules, navHrefs, noindexFindings, rankSignal, toPaths, withRules } from "./indexing";

const f = (code: string) => renderFinding({ code, task: SEO_CODES[code].task, severity: SEO_CODES[code].severity }) as RenderedFinding;
const signals = (s: Partial<{ sitemap: string[]; nav: string[]; impressions: [string, number][] }> = {}) => ({ sitemap: new Set(s.sitemap ?? []), nav: new Set(s.nav ?? []), impressions: new Map(s.impressions ?? []) });

describe("noindex", () => {
    it("is only a warning when the site contradicts it", () => {
        expect(rankSignal("/a", signals())).toBeNull();
        expect(rankSignal("/a/", signals({ sitemap: ["/a"] }))).toMatch(/sitemap/);
        expect(rankSignal("/a", signals({ impressions: [["/a", 12]] }))).toMatch(/impressions/);
        expect(rankSignal("/a", signals({ nav: ["/a"] }))).toMatch(/navigation/);
    });

    it("drops ranking-only checks on a noindexed page and keeps the rest", () => {
        const all = ["TECH_NOINDEX", "META_TITLE_LONG", "META_DESC_MISSING", "READABILITY_HARD", "SCHEMA_MISSING", "IMG_ALT_MISSING", "THIN_CONTENT"].map(f);
        expect(noindexFindings(all, null).map((x) => x.code)).toEqual(["IMG_ALT_MISSING", "THIN_CONTENT"]);
        const warned = noindexFindings(all, "It is noindex but listed in the sitemap.");
        expect(warned.map((x) => x.code)).toEqual(["TECH_NOINDEX", "IMG_ALT_MISSING", "THIN_CONTENT"]);
        expect(warned[0].fixHint).toMatch(/listed in the sitemap/);
    });

    it("reads navigation links and sitemap paths", () => {
        const html = '<header><a href="/services">S</a></header><main><a href="/body-link">x</a></main><nav><a href="https://x.com/about/">A</a><a href="#top">t</a></nav>';
        expect(toPaths(navHrefs(html))).toEqual(["/services", "/about"]);
        expect(toPaths(["https://x.com/", "https://x.com/a/b/"])).toEqual(["/", "/a/b"]);
    });
});

describe("schema expectations and rule versions", () => {
    it("expects Article schema only on article content types", () => {
        expect(expectsArticle({ pageType: "blog" })).toBe(true);
        expect(expectsArticle({ pageType: "service", jsonLd: "Article" })).toBe(false);
        expect(expectsArticle({ pageType: "reference" })).toBe(false);
        expect(expectsArticle({ jsonLd: "BlogPosting" })).toBe(true);
        expect(expectsArticle({})).toBe(false);
        expect(hasArticle(new Set(["service", "blogposting"]))).toBe(true);
        expect(hasArticle(new Set(["service", "faqpage"]))).toBe(false);
    });

    it("recognises rows written by the current rule set", () => {
        expect(isCurrentRules(withRules("abc123"))).toBe(true);
        expect(isCurrentRules("")).toBe(true); // a row holding no verdict yet
        expect(isCurrentRules("abc123")).toBe(false); // written before rule versions existed
    });
});
