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

describe("audit runs and freshness", () => {
    const NOW2 = Date.parse("2026-10-06T12:00:00Z");

    it("says before a run how many pages it fetches and how long that takes", async () => {
        const { planSummary, duration } = await import("./seoDash");
        const plan = { mode: "changed", total: 1414, toFetch: 1414, reuse: 0, sampled: 0, rps: 1, maxRps: 10, estimatedSeconds: 1414, live: true };
        expect(planSummary(plan)).toContain("1,414 pages of 1,414 will be fetched from your site, about 24 minutes at the current 1 per second");
        expect(planSummary({ ...plan, toFetch: 0, reuse: 1414, estimatedSeconds: 0 })).toContain("no pages will be fetched");
        expect(planSummary({ ...plan, toFetch: 50, sampled: 950, estimatedSeconds: 50 })).toContain("950 pages of large page types will be filled in from a sample");
        expect([duration(30), duration(10_000), duration(100_000 * 1)]).toEqual(["under a minute", "about 3 hours", "about 28 hours"]);
    });

    it("shows progress while a run is going, and nothing otherwise", async () => {
        const { runBanner } = await import("./seoDash");
        expect(runBanner({ done: 120, total: 1414, startedAt: "" })).toContain("Audit in progress, 120 of 1,414 pages fetched");
        expect(runBanner({ done: 120, total: 1414, startedAt: "", paused: true })).toContain("Audit paused");
        expect(runBanner(null)).toBeNull();
    });

    it("labels every page with when it was fetched, and inferred results as inferred", async () => {
        const { checkedLabel } = await import("./seoDash");
        expect(checkedLabel({ fetchedAt: "2026-10-03T12:00:00Z" }, NOW2)).toBe("Last fetched 3 days ago");
        expect(checkedLabel({ fetchedAt: null, inferred: true }, NOW2)).toBe("Inferred from a sample, not fetched");
        expect(checkedLabel({}, NOW2)).toBeNull();
    });

    it("lists what was not verified, and counts noindexed pages as information", async () => {
        const { auditNotes } = await import("./seoDash");
        const notes = auditNotes(
            {
                counts: { notChecked: 2, noindexed: 1327, inferred: 210 },
                freshness: { live: true, oldestFetchedAt: "2026-09-26T12:00:00Z", neverFetched: 210, recheckDays: 14, sampledTypes: [{ name: "City pages", verified: 50, total: 260 }] },
            },
            NOW2,
        );
        expect(notes[0]).toBe("Oldest live check: 10 days ago. Every page is re-checked in the background within 14 days.");
        expect(notes).toContain("1,327 pages hidden from search (noindex). Not counted as issues, and left out of the title, description, readability, schema, duplicate and cannibalization checks.");
        expect(notes.some((x) => x.startsWith("City pages: verified on 50 of 260 pages."))).toBe(true);
        expect(notes.some((x) => x.startsWith("210 pages not fetched yet"))).toBe(true);
        expect(auditNotes({ counts: {} })).toEqual([]);
    });
});
