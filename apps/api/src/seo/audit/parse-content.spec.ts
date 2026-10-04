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
