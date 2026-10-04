import { describe, expect, it, vi } from "vitest";
import { buildLive } from "./ContentCalendarCard";

vi.mock("@/components/ui/Card", () => ({ default: () => null }));
vi.mock("@/lib/useDashboard", () => ({ useDashboard: () => ({ data: null, loading: true, error: false }) }));

describe("calendar week", () => {
    // Week of Mon 2026-10-05 in India (UTC+5:30): starts Sun 18:30 UTC.
    const weekStart = "2026-10-04T18:30:00.000Z";
    const tz = "Asia/Kolkata";
    const now = new Date("2026-10-07T06:00:00Z");
    const item = (id: string, date: string, status = "SCHEDULED") => ({ id, title: id, type: "Blog", date, status });

    it("places items by day and hour in the workspace's time zone", () => {
        // 20:00 UTC Monday is 01:30 Tuesday in India.
        const built = buildLive([item("late", "2026-10-05T20:00:00Z"), item("pub", "2026-10-07T04:30:00Z", "PUBLISHED")], weekStart, tz, now);
        expect(built.events.map((e) => [e.id, e.startCol, e.hour])).toEqual([["late", 1, "01:00"], ["pub", 2, "10:00"]]);
        expect(built.week[2]).toMatchObject({ today: true });
        expect(built.week[1].dot).toBe("active");
    });

    it("ignores anything outside the week it was given", () => {
        const built = buildLive([item("old", "2025-01-01T10:00:00Z")], weekStart, tz, now);
        expect(built.events).toEqual([]);
        expect(built.hours).toEqual([]);
    });
});
