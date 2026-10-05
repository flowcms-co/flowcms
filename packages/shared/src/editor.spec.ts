import { describe, expect, it } from "vitest";
import { enterChoice, filterOptions, isEmptyBody, offerCreate, quickCreateData, refPlaceholder, selectionLabel, showSlugLine, showsBodyEditor } from "./editor";

describe("reference picker", () => {
    it("names a single target type in the placeholder and stays generic for polymorphic fields", () => {
        expect(refPlaceholder(["Tag"], false)).toBe("Search tags…");
        expect(refPlaceholder(["City"], false)).toBe("Search cities…");
        expect(refPlaceholder(["Tag"], true)).toBe("No tags yet");
        expect(refPlaceholder(["Tag", "City"], false)).toBe("Search entries…");
        expect(refPlaceholder(["Tag", "City"], true)).toBe("No entries to link yet");
    });

    it("shows the slug line only when options share a label", () => {
        expect(showSlugLine("News", "news-2", ["News", "news "])).toBe(true);
        expect(showSlugLine("News", "news", ["News", "Tips"])).toBe(false);
        expect(showSlugLine("News", "news", ["News"])).toBe(false);
        expect(showSlugLine("News", null, ["News", "News"])).toBe(false);
    });

    it("offers create only for unmatched text, one target type and create permission", () => {
        expect(offerCreate("Rust", ["Go", "Rusty"], 1, true)).toBe(true);
        expect(offerCreate("  rust ", ["Rust"], 1, true)).toBe(false);
        expect(offerCreate("   ", [], 1, true)).toBe(false);
        expect(offerCreate("Rust", [], 2, true)).toBe(false);
        expect(offerCreate("Rust", [], 1, false)).toBe(false);
    });

    it("Enter picks an exact match and never creates over it", () => {
        expect(enterChoice(["Go", "Rust"], -1, "rust", false)).toEqual({ kind: "pick", index: 1 });
        // Even with the create row highlighted, an exact match wins.
        expect(enterChoice(["Go", "Rust"], 2, "Rust", true)).toEqual({ kind: "pick", index: 1 });
        expect(enterChoice(["Go", "Rusty"], 0, "Rust", true)).toEqual({ kind: "pick", index: 0 });
        expect(enterChoice(["Go", "Rusty"], -1, "Rust", true)).toEqual({ kind: "create" });
        expect(enterChoice(["Go", "Rusty"], 2, "Rust", true)).toEqual({ kind: "create" });
        expect(enterChoice(["Go"], -1, "Rust", false)).toBeNull();
    });

    it("shows only options whose title or slug contains what is typed", () => {
        const options = [
            { id: "1", title: "Basement flood cleanup cost", slug: "basement-flood-cleanup-cost" },
            { id: "2", title: "Burst pipe repair", slug: "burst-pipe-repair" },
            { id: "3", title: "Frozen lines", slug: "frozen-pipe-thawing" },
        ];
        expect(filterOptions(options, "pipe").map((o) => o.id)).toEqual(["2", "3"]); // title, and slug
        expect(filterOptions(options, "  PIPE ").map((o) => o.id)).toEqual(["2", "3"]);
        expect(filterOptions(options, "")).toEqual(options);
        expect(filterOptions(options, "roof")).toEqual([]);
    });

    it("labels an empty selection as none selected, not as an empty type", () => {
        expect(selectionLabel(0)).toBe("None selected");
        expect(selectionLabel(2)).toBe("2 selected");
    });

    it("Enter picks the highlighted option", () => {
        expect(enterChoice(["Burst pipe repair", "Frozen pipe thawing"], 1, "pipe", false)).toEqual({ kind: "pick", index: 1 });
        expect(enterChoice(["Burst pipe repair"], 0, "pipe", true)).toEqual({ kind: "pick", index: 0 });
    });

    it("fills required Text fields from the typed text", () => {
        const fields = [
            { name: "title", type: "Text", required: true },
            { name: "slug", type: "Slug", required: true },
            { name: "label", type: "Text", required: true },
            { name: "note", type: "Text", required: false },
            { name: "color", type: "Number", required: false },
        ];
        expect(quickCreateData(fields, "  Rust ")).toEqual({ label: "Rust" });
        expect(quickCreateData([...fields, { name: "icon", type: "Media", required: true }], "Rust")).toBeNull();
    });
});

describe("body editor", () => {
    it("treats empty markup as no body", () => {
        for (const v of ["", "  ", "<p></p>", "<p> </p><p><br></p>", undefined, null]) expect(isEmptyBody(v)).toBe(true);
        expect(isEmptyBody("<p>Hi</p>")).toBe(false);
    });

    it("hides the Body editor on a field-less type unless flagged or holding content", () => {
        expect(showsBodyEditor({ fields: [] }, {})).toBe(false);
        expect(showsBodyEditor({ fields: [] }, { body: "<p></p>" })).toBe(false);
        expect(showsBodyEditor({ fields: [], freeFormBody: true }, {})).toBe(true);
        expect(showsBodyEditor({ fields: [] }, { body: "<p>Legacy</p>" })).toBe(true);
    });

    it("keeps the Body editor for a type with a body field", () => {
        expect(showsBodyEditor({ fields: [{ name: "Body", type: "Rich text" }] }, {})).toBe(true);
        expect(showsBodyEditor({ fields: [{ name: "intro", type: "Rich text" }] }, {})).toBe(false);
    });
});
