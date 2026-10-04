import { describe, expect, it } from "vitest";
import { layoutPreviewNote } from "./roles";

describe("layoutPreviewNote", () => {
    it("says a view-as dashboard is a layout preview showing the viewer's own data", () => {
        const note = layoutPreviewNote("super", "editor");
        expect(note).toContain("Layout preview");
        expect(note).toContain("still your own");
    });

    it("is silent when not previewing", () => {
        expect(layoutPreviewNote("super", null)).toBeNull();
        expect(layoutPreviewNote("super", "super")).toBeNull();
    });
});
