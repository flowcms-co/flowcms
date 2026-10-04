import { describe, expect, it } from "vitest";
import { crawlSeeds, parsePsi, pctChange, periods, psiReason, psiUrl, singleFlight, sitemapLocs, speedScore, weightedCtr, weightedPosition } from "./seo-math";

const NOW = Date.parse("2026-10-05T00:00:00Z");
const day = (n: number, value: number) => ({ date: new Date(NOW - n * 86_400_000), value });

describe("periods (summary honours its window)", () => {
    const rows = Array.from({ length: 90 }, (_, i) => day(90 - i, 1));

    it("sums only the selected days and compares with the equal period before", () => {
        const p = periods(rows, 30, NOW);
        expect(p.current).toHaveLength(30);
        expect(p.previous).toHaveLength(30);
    });

    it("gives no previous period when the history does not cover it", () => {
        expect(periods(rows, 60, NOW).previous).toHaveLength(0);
        expect(pctChange(10, 0)).toBeNull();
    });

    it("weights CTR and position by impressions", () => {
        const clicks = [day(2, 1), day(1, 10)];
        const impressions = [day(2, 10), day(1, 1000)];
        expect(weightedCtr(clicks, impressions)).toBeCloseTo((11 / 1010) * 100);
        expect(weightedPosition([day(2, 50), day(1, 5)], impressions)).toBeCloseTo((50 * 10 + 5 * 1000) / 1010);
    });
});

describe("parsePsi", () => {
    const lab = {
        lighthouseResult: {
            categories: { performance: { score: 0.71 } },
            audits: {
                "largest-contentful-paint": { numericValue: 2100 },
                "cumulative-layout-shift": { numericValue: 0.02 },
                interactive: { numericValue: 4189 },
                "total-blocking-time": { numericValue: 150 },
            },
        },
    };

    it("never grades Time to Interactive as INP: no field data means no INP score", () => {
        const r = parsePsi("https://x.com/", "mobile", lab);
        const inp = r.vitals.find((v) => v.metric === "INP")!;
        expect(inp).toMatchObject({ value: "No field data", status: "none", scored: false });
        expect(r.vitals.find((v) => v.metric === "TBT (lab)")).toMatchObject({ value: "150ms", status: "good", scored: false });
        // LCP good + CLS good; INP and the lab TBT are left out of the Speed score.
        expect(speedScore(r.vitals)).toBe(100);
        expect(r.performance).toBe(71);
    });

    it("uses field INP when CrUX has it", () => {
        const r = parsePsi("https://x.com/", "desktop", { ...lab, loadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 320 } } } });
        expect(r.vitals.find((v) => v.metric === "INP")).toMatchObject({ value: "320ms", status: "warning", source: "field", scored: true });
        expect(speedScore(r.vitals)).toBe(Math.round((100 + 60 + 100) / 3));
    });

    it("has no speed score without measurements", () => {
        expect(speedScore([])).toBeNull();
        expect(speedScore([{ status: "none", scored: false }])).toBeNull();
    });
});

describe("PageSpeed request and failure reasons", () => {
    it("URL-encodes the API key", () => {
        expect(psiUrl("https://x.com/a b", "mobile", "k&y=1")).toContain("&key=k%26y%3D1");
        expect(psiUrl("https://x.com/", "desktop")).not.toContain("key=");
    });

    it("explains why PageSpeed is unavailable", () => {
        expect(psiReason("psi-429", true)).toMatch(/API key/);
        expect(psiReason("psi-timeout")).toMatch(/did not answer/);
        expect(psiReason("psi-500")).toBe("PageSpeed Insights returned HTTP 500.");
    });
});

describe("crawl seeding", () => {
    it("reads sitemap <loc> entries", () => {
        expect(sitemapLocs("<urlset><url><loc>https://x.com/a</loc></url><url><loc> https://x.com/b?x=1&amp;y=2 </loc></url></urlset>")).toEqual(["https://x.com/a", "https://x.com/b?x=1&y=2"]);
    });

    it("starts at the homepage, mixes sources, drops other hosts and duplicates, and caps", () => {
        const seeds = crawlSeeds("https://x.com", [["https://x.com/top", "https://evil.com/x"], ["https://x.com/s1", "https://x.com/top/", "https://x.com/s2"]], 4);
        expect(seeds).toEqual(["https://x.com", "https://x.com/top", "https://x.com/s1", "https://x.com/s2"]);
    });
});

describe("singleFlight", () => {
    it("runs concurrent calls for one key once", async () => {
        const flight = singleFlight();
        let runs = 0;
        const work = () => new Promise<number>((r) => setTimeout(() => r(++runs), 5));
        const [a, b] = await Promise.all([flight("crawl:w1", work), flight("crawl:w1", work)]);
        expect([a, b, runs]).toEqual([1, 1, 1]);
        expect(await flight("crawl:w1", work)).toBe(2);
    });
});
