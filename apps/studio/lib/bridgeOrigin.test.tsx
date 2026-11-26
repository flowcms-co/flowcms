import { describe, expect, it } from "vitest";
import { fromSiteFrame, siteOriginOf } from "./bridgeOrigin";

describe("bridge origin", () => {
    it("takes the origin from an absolute URL only", () => {
        expect(siteOriginOf("https://site.example/a/b?x=1")).toBe("https://site.example");
        expect(siteOriginOf("/relative")).toBeNull();
        expect(siteOriginOf(null)).toBeNull();
    });

    it("trusts only the frame window on the site origin", () => {
        const win = {};
        expect(fromSiteFrame({ source: win, origin: "https://site.example" }, win, "https://site.example")).toBe(true);
        expect(fromSiteFrame({ source: win, origin: "https://evil.example" }, win, "https://site.example")).toBe(false);
        expect(fromSiteFrame({ source: {}, origin: "https://site.example" }, win, "https://site.example")).toBe(false);
        expect(fromSiteFrame({ source: win, origin: "https://site.example" }, win, null)).toBe(false);
    });
});
