import { describe, it, expect } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { elementHtml, expandElements } from "@flowcms/shared";
import { contentWarnings, validateEntryData, type SchemaField } from "./entry-validation";

/** Run validation and return the field-keyed error map (empty when it passes). */
function errorsFor(fields: SchemaField[], data: Record<string, unknown>, enforceRequired = true): Record<string, string> {
    try {
        validateEntryData(fields, data, { enforceRequired });
        return {};
    } catch (e) {
        if (e instanceof BadRequestException) {
            const res = e.getResponse() as { errors?: Record<string, string> };
            return res.errors ?? {};
        }
        throw e;
    }
}

describe("Reference field validation", () => {
    it("accepts a string id for a single reference", () => {
        const fields: SchemaField[] = [{ name: "author", type: "Reference", referencedTypeId: "t1", required: true }];
        expect(errorsFor(fields, { author: "entry_123" })).toEqual({});
    });

    it("rejects a non-string single reference", () => {
        const fields: SchemaField[] = [{ name: "author", type: "Reference", referencedTypeId: "t1" }];
        expect(errorsFor(fields, { author: 42 }).author).toMatch(/must be a reference/);
    });

    it("accepts an array of ids for a multiple reference", () => {
        const fields: SchemaField[] = [{ name: "tags", type: "Reference", referencedTypeId: "t1", multiple: true, required: true }];
        expect(errorsFor(fields, { tags: ["a", "b"] })).toEqual({});
    });

    it("rejects a non-array (or non-string array) multiple reference", () => {
        const fields: SchemaField[] = [{ name: "tags", type: "Reference", referencedTypeId: "t1", multiple: true }];
        expect(errorsFor(fields, { tags: "a" }).tags).toMatch(/list of references/);
        expect(errorsFor(fields, { tags: [1, 2] }).tags).toMatch(/list of references/);
    });

    it("treats a required multiple reference with an empty list as missing", () => {
        const fields: SchemaField[] = [{ name: "tags", type: "Reference", referencedTypeId: "t1", multiple: true, required: true }];
        expect(errorsFor(fields, { tags: [] }).tags).toMatch(/required/);
    });

    it("skips reverse (mapped-by) fields entirely, even when required and absent", () => {
        const fields: SchemaField[] = [
            { name: "posts", type: "Reference", referencedTypeId: "t1", mappedByField: "author", multiple: true, required: true },
        ];
        expect(errorsFor(fields, {})).toEqual({});
    });
});

describe("elements in rich text", () => {
    const fields: SchemaField[] = [
        { name: "body", type: "Rich text" },
        { name: "blocks", type: "Component", repeatable: true, fields: [{ name: "content", type: "Rich text" }] },
    ];
    const step = (n: number) => ({ label: `L${n}`, time: "", text: `T${n}` });
    const good = elementHtml("steps", { title: "t", layout: "horizontal", steps: [1, 2, 3].map(step) });
    const bad = elementHtml("steps", { title: "t", layout: "horizontal", steps: [1, 2].map(step) });

    it("a good element publishes, with no rules on the type", () => {
        expect(errorsFor(fields, { body: `<p>x</p>${good}` })).toEqual({});
    });

    it("a bad element blocks publishing, at the field path, even inside a component", () => {
        expect(errorsFor(fields, { body: `<p>x</p>${bad}` }).body).toMatch(/at least 3 steps/);
        expect(errorsFor(fields, { blocks: [{ content: bad }] })["blocks[0].content"]).toMatch(/at least 3 steps/);
    });

    it("a draft saves with the bad element and only warns", () => {
        expect(errorsFor(fields, { body: bad }, false)).toEqual({});
        const w = contentWarnings(fields, { body: bad }, null);
        expect(w).toHaveLength(1);
        expect(w[0]).toMatchObject({ path: "body", level: "warn" });
        expect(contentWarnings(fields, { body: good }, null)).toEqual([]);
    });
});

describe("delivered element markup is refused on every save", () => {
    const fields: SchemaField[] = [
        { name: "body", type: "Rich text" },
        { name: "blocks", type: "Component", repeatable: true, fields: [{ name: "content", type: "Rich text" }] },
    ];
    const delivered = expandElements(elementHtml("steps", { title: "t", layout: "horizontal", steps: [1, 2, 3].map((n) => ({ label: `L${n}`, time: "", text: `T${n}` })) }));

    it("refuses expanded markup, in a draft save too, at the field path", () => {
        expect(errorsFor(fields, { body: `<p>x</p>${delivered}` }, false).body).toMatch(/delivered HTML/);
        expect(errorsFor(fields, { blocks: [{ content: delivered }] }, false)["blocks[0].content"]).toMatch(/delivered HTML/);
    });

    it("lets the stored form and ordinary markup through", () => {
        expect(errorsFor(fields, { body: `<p class="flow-elsewhere">x</p>` }, false)).toEqual({});
        expect(errorsFor(fields, { body: elementHtml("steps", { steps: [] }) }, false)).toEqual({});
    });
});
