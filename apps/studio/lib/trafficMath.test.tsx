import { describe, it, expect } from "vitest";
import { PERIODS, bucketSum, emptyReason, niceScale, pctDelta, syncAge, trafficState } from "./trafficMath";

const NOW = Date.UTC(2026, 9, 5);
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

describe("trafficMath", () => {
    it("offers no period longer than the 90 synced days", () => {
        expect(Math.max(...PERIODS.map((p) => p.days))).toBe(90);
    });

    it("computes the change against the previous period, or nothing without one", () => {
        expect(pctDelta(100, 150)).toBe(50);
        expect(pctDelta(200, 100)).toBe(-50);
        expect(pctDelta(null, 100)).toBeNull();
        expect(pctDelta(0, 100)).toBeNull();
    });

    it("sums buckets instead of sampling single days", () => {
        const pts = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, value: 2 }));
        const b = bucketSum(pts, 6);
        expect(b).toHaveLength(6);
        expect(b.every((x) => x.value === 10)).toBe(true);
        expect(b[0].x).toBe("09-01");
        expect(b.reduce((a, x) => a + x.value, 0)).toBe(60);
    });

    it("scales the axis to the data, so a small site is not flat on a 0 to 10K axis", () => {
        expect(niceScale(37)).toMatchObject({ div: 1, unit: "", max: 40 });
        expect(niceScale(0)).toMatchObject({ div: 1, unit: "", max: 4, ticks: [0, 1, 2, 3, 4] });
        expect(niceScale(42_000)).toMatchObject({ div: 1000, unit: "K", max: 60 });
        const s = niceScale(37);
        expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
    });

    it("tells not connected, no data, stale and current apart", () => {
        expect(trafficState({ gsc: { connected: false }, ga4: { connected: false } }, false, NOW)).toBe("not-connected");
        expect(trafficState({ gsc: { connected: true, lastSync: ago(0), rows: 0 } }, false, NOW)).toBe("no-data");
        expect(trafficState({ gsc: { connected: true, lastSync: ago(20), rows: 400 } }, true, NOW)).toBe("stale");
        expect(trafficState({ gsc: { connected: true, lastSync: ago(20) }, ga4: { connected: true, lastSync: ago(1) } }, true, NOW)).toBe("ok");
    });

    it("says why a connected card is empty", () => {
        expect(emptyReason({})).toBe("Not connected");
        expect(emptyReason({ gsc: { connected: true, lastSync: ago(1), rows: 0 } })).toBe("Connected, no data yet (new property)");
        expect(emptyReason({ ga4: { connected: true, lastSync: ago(1), rows: 0 } })).toBe("No GA4 hits received, check the tag is installed");
        expect(emptyReason({ gsc: { connected: true, lastSync: null } })).toBe("Connected, not synced yet");
        expect(syncAge(ago(20), NOW)).toBe("20 days ago");
    });
});
