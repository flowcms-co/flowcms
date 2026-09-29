import { describe, expect, it } from "vitest";
import { authorWhere, autoAuthorId, effectiveAuthorId } from "./author";

const e = (authorId: string | null, lastEditorId: string | null, authorOverrideId: string | null) => ({ authorId, lastEditorId, authorOverrideId });

describe("effectiveAuthorId", () => {
    it("creator mode shows the creator even after someone else edits", () => {
        expect(effectiveAuthorId(e("ann", "bob", null), "creator")).toBe("ann");
    });
    it("lastEditor mode shows the last editor, falling back to the creator", () => {
        expect(effectiveAuthorId(e("ann", "bob", null), "lastEditor")).toBe("bob");
        expect(effectiveAuthorId(e("ann", null, null), "lastEditor")).toBe("ann");
    });
    it("a hand-picked author wins in both modes", () => {
        expect(effectiveAuthorId(e("ann", "bob", "cat"), "creator")).toBe("cat");
        expect(effectiveAuthorId(e("ann", "bob", "cat"), "lastEditor")).toBe("cat");
        expect(autoAuthorId(e("ann", "bob", "cat"), "lastEditor")).toBe("bob");
    });
    it("an unknown mode behaves like creator", () => {
        expect(effectiveAuthorId(e("ann", "bob", null), "nonsense")).toBe("ann");
    });
});

describe("authorWhere", () => {
    it("never matches an overridden entry through its automatic author", () => {
        for (const mode of ["creator", "lastEditor"]) {
            const [override, auto] = authorWhere("ann", mode).OR as Record<string, unknown>[];
            expect(override).toEqual({ authorOverrideId: "ann" });
            expect(auto.authorOverrideId).toBeNull();
        }
    });
});
