import { describe, expect, it } from "vitest";
import { auditPage, type LiveFacts } from "./audit-engine";
import { entryToPageInput, resolveTokens } from "./parse-content";

const codes = (input: ReturnType<typeof entryToPageInput>) => auditPage(input).map((f) => f.code);
const live: LiveFacts = { status: 200, title: "Fire Damage Restoration in Albuquerque, NM | NearbyPros", description: "Local crews restore fire and smoke damage across Albuquerque. Call for a free inspection and a same day response from licensed pros.", canonical: "https://nearbypros.com/fire-damage-restoration/albuquerque-nm", noindex: false, ldTypes: ["Service", "FAQPage"] };
// A headless child entry: nothing SEO-related stored on it.
const entry = { id: "e1", slug: "fire-damage-restoration-albuquerque-nm", data: { title: "{City} Fire Damage", city: "ckv9x2k3n0000abcd1234efgh" } };

describe("entryToPageInput", () => {
    it("audits the live page's tags, not the empty entry fields", () => {
        const input = entryToPageInput(entry, { path: "/fire-damage-restoration/albuquerque-nm", hasSite: true, live });
        expect(input.url).toBe("/fire-damage-restoration/albuquerque-nm");
        const found = codes(input);
        for (const c of ["TECH_CANONICAL_MISSING", "META_DESC_MISSING", "SCHEMA_MISSING", "META_TITLE_SHORT"]) expect(found).not.toContain(c);
    });

    it("still reports what is really missing on the live page", () => {
        const found = codes(entryToPageInput(entry, { hasSite: true, live: { ...live, canonical: "", description: "", ldTypes: [] } }));
        expect(found).toEqual(expect.arrayContaining(["TECH_CANONICAL_MISSING", "META_DESC_MISSING", "SCHEMA_MISSING"]));
    });

    it("reports an unreadable page instead of guessing at its tags", () => {
        const found = codes(entryToPageInput(entry, { hasSite: true, live: { ...live, status: 403 } }));
        expect(found).toContain("TECH_PAGE_UNREACHABLE");
        for (const c of ["TECH_CANONICAL_MISSING", "META_DESC_MISSING", "SCHEMA_MISSING"]) expect(found).not.toContain(c);
    });

    it("falls back to entry fields with no site URL", () => {
        const found = codes(entryToPageInput({ id: "e2", slug: "about", data: { title: "About" } }));
        expect(found).toEqual(expect.arrayContaining(["TECH_CANONICAL_MISSING", "META_DESC_MISSING", "SCHEMA_MISSING", "META_TITLE_SHORT"]));
    });

    it("resolves title tokens before measuring, and skips the length check when it can't", () => {
        expect(resolveTokens("{City} Fire Damage", entry.data, { city: "Albuquerque, NM" })).toBe("Albuquerque, NM Fire Damage");
        const resolved = entryToPageInput({ ...entry, data: { ...entry.data, metaTitle: "{City} Fire Damage Restoration Company" } }, { refTitles: { city: "Albuquerque, NM" } });
        expect(resolved.metaTitle).toBe("Albuquerque, NM Fire Damage Restoration Company");
        expect(codes(entryToPageInput(entry))).not.toContain("META_TITLE_SHORT");
    });

    it("treats a description inherited from a parent entry as satisfied", () => {
        expect(codes(entryToPageInput(entry, { parentHasDescription: true }))).not.toContain("META_DESC_MISSING");
        expect(codes(entryToPageInput(entry))).toContain("META_DESC_MISSING");
    });
});

describe("internal links marked nofollow", () => {
    it("are reported, and external nofollow links are not", () => {
        const body = '<p><a target="_blank" rel="noopener noreferrer nofollow" href="/resources/cost">cost</a> and <a rel="nofollow" href="https://example.com/contact">contact</a> and <a rel="nofollow" href="https://other.com">other</a></p>';
        const input = entryToPageInput({ id: "e", slug: "p", data: { title: "T", body } }, { siteHost: "https://example.com" });
        expect(input.internalNofollow).toBe(2);
        const f = auditPage(input).find((x) => x.code === "LINK_INTERNAL_NOFOLLOW")!;
        expect(f.values).toEqual({ count: 2 });
        expect(codes(entryToPageInput({ id: "e", slug: "p", data: { title: "T", body: '<p><a href="/a">a</a></p>' } }))).not.toContain("LINK_INTERNAL_NOFOLLOW");
    });
});
