import { describe, expect, it } from "vitest";
import { dataSources, issueCounts, pillarText, ratingOf, scoreCta, speedExplainer } from "./seoDash";

const NOW = Date.parse("2026-10-05T12:00:00Z");

describe("seoDash", () => {
    it("labels a score the same everywhere", () => {
        expect(ratingOf(78).label).toBe("Good");
        expect(ratingOf(60).label).toBe("Fair");
        expect(ratingOf(49).label).toBe("Needs work");
    });

    it("shows a dash and the reason for a pillar with no data, not 0", () => {
        expect(pillarText({ score: null, note: "No Search Console data" })).toEqual({ value: "—", note: "No Search Console data" });
        expect(pillarText({ score: 0 })).toEqual({ value: "0", note: null });
    });

    it("explains what the Speed number is made of", () => {
        const text = speedExplainer({ url: "https://nearbypros.com", strategy: "mobile", performance: 71, metrics: [] })!;
        expect(text).toContain("nearbypros.com, mobile");
        expect(text).toContain("Lighthouse performance: 71");
        expect(speedExplainer(null)).toBeNull();
    });

    it("counts critical issues and warnings from the Optimizer's groups", () => {
        expect(issueCounts([{ severity: "high", count: 3 }, { severity: "med", count: 1000 }, { severity: "med", count: 7 }, { severity: "low", count: 500 }])).toEqual({ critical: 3, warnings: 1007 });
    });

    it("builds the data sources footer from real connector state", () => {
        const none = dataSources(null, null, NOW);
        expect(none.every((s) => !s.on)).toBe(true);
        expect(none.map((s) => s.state)).toEqual(["not connected", "not connected", "no site URL", "no site URL"]);

        const some = dataSources(
            { gsc: { connected: true, lastSync: "2026-10-05T09:00:00Z" }, ga4: { connected: true, lastSync: null } },
            { site: "https://nearbypros.com", pagespeed: { connected: false, needsKey: true } },
            NOW,
        );
        expect(some.map((s) => s.state)).toEqual(["synced 3 hours ago", "not synced yet", "needs an API key", "nearbypros.com"]);
    });

    it("only offers a scan when a scan can produce a score", () => {
        expect(scoreCta(null, false).href).toBe("/settings/workspace");
        expect(scoreCta("https://x.com", false).href).toBe("/seo");
        expect(scoreCta("https://x.com", true)).toMatchObject({ description: "You don't have access to this data." });
    });
});

describe("capped checks and the page flag", () => {
    it("says checked N of M when a check is capped, and nothing when it covered every page", async () => {
        const { coverageNote } = await import("./seoDash");
        expect(coverageNote("Duplicate content", { checked: 400, total: 1615, capped: true, by: "impressions" })).toBe(
            "Duplicate content: checked 400 of 1,615 pages, the pages with the most search impressions. The rest were not checked.",
        );
        expect(coverageNote("Internal links", { checked: 500, total: 1615, capped: true, by: "recency" })).toContain("checked 500 of 1,615 pages, the most recently published");
        expect(coverageNote("Duplicate content", { checked: 80, total: 80, capped: false, by: "recency" })).toBeNull();
        expect(coverageNote("Duplicate content", null)).toBeNull();
    });

    it("prompts when a type has a URL pattern but is not marked as pages", async () => {
        const { needsPageFlag, storedPageFlag } = await import("./seoDash");
        expect(needsPageFlag({ routePattern: "/{service.slug}/{city.slug}", isPage: false })).toBe(true);
        expect(needsPageFlag({ routePattern: "/{service.slug}/{city.slug}", isPage: true })).toBe(false);
        expect(needsPageFlag({ routePattern: "", isPage: false })).toBe(false);
        // Never set by hand: nothing is stored, so the default (on once a pattern exists) applies.
        expect(storedPageFlag({ isPage: false, isPageSet: false })).toBeUndefined();
        expect(storedPageFlag({ isPage: false, isPageSet: true })).toBe(false);
    });
});
