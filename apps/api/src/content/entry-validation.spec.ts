import { describe, it, expect } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { validateEntryData, type SchemaField } from "./entry-validation";

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
