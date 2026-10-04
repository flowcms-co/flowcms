import { describe, expect, it } from "vitest";
import { matchZones } from "./TimeZoneSelect";

describe("matchZones", () => {
    const zones = ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"];
    it("searches case-insensitively and treats spaces as underscores", () => {
        expect(matchZones("new york", zones)).toEqual(["America/New_York"]);
        expect(matchZones("LOND", zones)).toEqual(["Europe/London"]);
        expect(matchZones("", zones)).toEqual(zones);
        expect(matchZones("atlantis", zones)).toEqual([]);
    });
});
