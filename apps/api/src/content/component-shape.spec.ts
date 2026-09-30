import { describe, expect, it } from "vitest";
import { isEmptyValue, keepStoredShape, migrateRepeatable } from "./component-shape";
import type { SchemaField } from "./entry-validation";

const sections: SchemaField = { name: "contentSections", type: "Component", fields: [{ name: "heading", type: "Text" }] };
const stored = { title: "Water damage", contentSections: [{ heading: "One" }, { heading: "Two" }] };

describe("keepStoredShape", () => {
    it("keeps a stored list when the editor sends the empty single block it showed", () => {
        expect(keepStoredShape([sections], stored, { contentSections: {} }).contentSections).toEqual(stored.contentSections);
        expect(keepStoredShape([sections], stored, { contentSections: { heading: "" } }).contentSections).toEqual(stored.contentSections);
    });
    it("keeps a stored block when an empty list is sent over it", () => {
        const one = { contentSections: { heading: "Only" } };
        expect(keepStoredShape([sections], one, { contentSections: [] }).contentSections).toEqual(one.contentSections);
    });
    it("lets a real edit through, whatever its shape", () => {
        expect(keepStoredShape([sections], stored, { contentSections: { heading: "Rewritten" } }).contentSections).toEqual({ heading: "Rewritten" });
        expect(keepStoredShape([sections], stored, { contentSections: [{ heading: "A" }] }).contentSections).toEqual([{ heading: "A" }]);
        expect(keepStoredShape([sections], stored, { contentSections: [] }).contentSections).toEqual([]);
    });
    it("ignores fields that were not sent, and non-component fields", () => {
        expect(keepStoredShape([sections], stored, { title: "" })).toEqual({ title: "" });
    });
    it("looks inside a single component for nested lists", () => {
        const hero: SchemaField = { name: "hero", type: "Component", fields: [sections] };
        const data = { hero: { contentSections: [{ heading: "Nested" }] } };
        expect(keepStoredShape([hero], data, { hero: { contentSections: {} } })).toEqual(data);
    });
});

describe("migrateRepeatable", () => {
    const single: SchemaField = { id: "f1", name: "contentSections", type: "Component" };
    const repeat: SchemaField = { ...single, repeatable: true };
    it("wraps a block into a list when the field becomes repeatable", () => {
        const r = migrateRepeatable([single], [repeat], { contentSections: { heading: "One" } });
        expect(r).toEqual({ data: { contentSections: [{ heading: "One" }] }, changed: true, warnings: [] });
        expect(migrateRepeatable([single], [repeat], { contentSections: {} }).data).toEqual({ contentSections: [] });
    });
    it("takes the first block, with a warning, when the field becomes single", () => {
        const r = migrateRepeatable([repeat], [single], { contentSections: [{ heading: "One" }, { heading: "Two" }] });
        expect(r.data).toEqual({ contentSections: { heading: "One" } });
        expect(r.warnings[0]).toMatch(/first of 2/);
    });
    it("leaves data alone when the flag did not change or the shape already fits", () => {
        const d = { contentSections: [{ heading: "One" }] };
        expect(migrateRepeatable([repeat], [repeat], d).changed).toBe(false);
        expect(migrateRepeatable([single], [repeat], d).changed).toBe(false);
    });
    it("matches a renamed field by id", () => {
        const renamed = { ...repeat, name: "sections" };
        expect(migrateRepeatable([single], [renamed], { sections: { heading: "One" } }).data).toEqual({ sections: [{ heading: "One" }] });
    });
});

describe("isEmptyValue", () => {
    it("treats blanks, empty containers and containers of blanks as empty", () => {
        for (const v of [null, undefined, "", [], {}, { a: "" }, [{}], { a: { b: null } }]) expect(isEmptyValue(v)).toBe(true);
        for (const v of [0, false, "x", [1], { a: "x" }]) expect(isEmptyValue(v)).toBe(false);
    });
});
