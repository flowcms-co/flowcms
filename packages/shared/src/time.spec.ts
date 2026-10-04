import { describe, expect, it } from "vitest";
import { safeTimeZone, zonedClock, zonedDayKey, zonedDayStart, zonedWeekStart, zonedWeekday } from "./time";

describe("zoned calendar maths", () => {
    // 2026-10-05 is a Monday. 20:00 UTC that day is already Tuesday 01:30 in India.
    const at = new Date("2026-10-05T20:00:00Z");

    it("finds the day and week a moment falls in for the workspace's zone", () => {
        expect(zonedDayKey(at, "UTC")).toBe("2026-10-05");
        expect(zonedDayKey(at, "Asia/Kolkata")).toBe("2026-10-06");
        expect(zonedWeekday(at, "UTC")).toBe(0);
        expect(zonedWeekday(at, "Asia/Kolkata")).toBe(1);
        expect(zonedDayStart(at, "Asia/Kolkata").toISOString()).toBe("2026-10-05T18:30:00.000Z");
        expect(zonedWeekStart(at, "Asia/Kolkata").toISOString()).toBe("2026-10-04T18:30:00.000Z");
        expect(zonedClock(at, "Asia/Kolkata")).toEqual({ hour: 1, day: 6, month: 10 });
    });

    it("keeps midnight right across a daylight-saving change", () => {
        // US clocks go back on 2026-11-01; the day after starts at 05:00 UTC, not 04:00.
        expect(zonedDayStart(new Date("2026-11-01T12:00:00Z"), "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
        expect(zonedDayStart(new Date("2026-11-01T12:00:00Z"), "America/New_York", 1).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    });

    it("falls back to UTC for a zone the runtime doesn't know", () => {
        expect(safeTimeZone("Mars/Olympus")).toBe("UTC");
        expect(safeTimeZone(null)).toBe("UTC");
        expect(safeTimeZone("Europe/Paris")).toBe("Europe/Paris");
    });
});

describe("isTimeZone", () => {
    it("accepts real IANA zones and rejects everything else", async () => {
        const { isTimeZone, timeZones, safeTimeZone } = await import("./time");
        expect(["UTC", "Europe/London", "Asia/Kolkata"].every(isTimeZone)).toBe(true);
        expect(["", " Europe/London", "Mars/Olympus", "London", null, 5].some(isTimeZone)).toBe(false);
        expect(timeZones()[0]).toBe("UTC");
        expect(timeZones()).toContain("Europe/London");
        // A bad stored value never throws: it falls back to UTC.
        expect(safeTimeZone("Mars/Olympus")).toBe("UTC");
    });
});
