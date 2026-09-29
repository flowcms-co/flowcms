import { describe, expect, it } from "vitest";
import { parseExpiry } from "./api-tokens.service";

describe("parseExpiry", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    it("treats no expiry as never expiring", () => {
        expect(parseExpiry(undefined, now)).toBeNull();
        expect(parseExpiry("", now)).toBeNull();
    });
    it("accepts a future date", () => {
        expect(parseExpiry("2026-02-01T00:00:00Z", now)?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    });
    it("refuses a past date, the current moment, and an unreadable date", () => {
        expect(() => parseExpiry("2026-01-09T00:00:00Z", now)).toThrow(/future/);
        expect(() => parseExpiry(now.toISOString(), now)).toThrow(/future/);
        expect(() => parseExpiry("next tuesday-ish", now)).toThrow(/valid date/);
    });
});
