import { describe, it, expect, vi } from "vitest";

// The cards pull in gsap (count-up numbers), which needs matchMedia at import time.
vi.hoisted(() => {
    window.matchMedia ??= (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })) as never;
});
vi.mock("@/lib/api", () => ({ api: vi.fn(), ApiError: class extends Error {} }));

import { buildLive } from "./SearchPerformanceCard";
import { buildTiles, emptyCopy } from "./WeeklyProgressCard";

const day = (i: number) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, value: 5 });
const totals = { clicks: 150, impressions: 3000, ctr: 5, position: 8, sessions: 0 };
const prev = { clicks: 100, impressions: 3000, ctr: 3.3, position: 10, sessions: 0 };

describe("SearchPerformanceCard", () => {
    it("labels the headline by its real source and compares with the previous period", () => {
        const series = { clicks: Array.from({ length: 30 }, (_, i) => day(i)), impressions: [], sessions: [] };
        const gsc = buildLive({ hasData: true, totals, previous: prev, series })!;
        expect(gsc.bigLabel).toBe("Search clicks (Search Console)");
        expect(gsc.bigDelta).toBe(50);
        expect(gsc.chart.reduce((a, c) => a + c.cur, 0)).toBe(150); // bucket totals, not samples
        expect(gsc.scale.unit).toBe(""); // small site: plain numbers, not a 0 to 10K axis
        const pos = gsc.metrics.find((m) => m.key === "pos")!;
        expect(pos.delta).toBe(-20);
        expect(pos.good).toBe(true); // a lower position is an improvement

        const ga4 = buildLive({ hasData: true, totals: { ...totals, clicks: 0, sessions: 420 }, previous: null, series: { clicks: [], impressions: [], sessions: [day(0)] } })!;
        expect(ga4.bigLabel).toBe("Sessions (GA4)");
        expect(ga4.big).toBe("420");
        expect(ga4.bigDelta).toBeNull(); // no delta without a previous period
        expect(ga4.metrics.every((m) => m.value === "—")).toBe(true);
    });

    it("builds nothing without data", () => {
        expect(buildLive({ hasData: false })).toBeNull();
    });
});

describe("WeeklyProgressCard", () => {
    it("shows this week's totals against the server's previous week", () => {
        const tiles = buildTiles({ hasData: true, totals, previous: prev, series: { clicks: [], impressions: [], sessions: [] } });
        expect(tiles.find((t) => t.key === "organic")).toMatchObject({ value: "150", delta: 50 });
        expect(tiles.every((t) => t.href === "/seo")).toBe(true);
        expect(buildTiles({ hasData: true, totals, previous: null, series: { clicks: [], impressions: [], sessions: [] } })[0].delta).toBeNull();
    });

    it("tells not connected, stale, empty, failed and forbidden apart, and links to settings", () => {
        expect(emptyCopy("not-connected").action).toEqual({ label: "Connect analytics", href: "/settings/integrations?tab=analytics" });
        expect(emptyCopy("stale", { gsc: { connected: true, lastSync: new Date(Date.now() - 20 * 86_400_000).toISOString() } }).description).toMatch(/connected, but the last sync was 20 days ago/);
        expect(emptyCopy("no-data").title).toBe("Connected, no data yet");
        expect(emptyCopy("error").title).toBe("Couldn't load traffic data");
        expect(emptyCopy("forbidden").title).toBe("You don't have access to this data");
    });
});
