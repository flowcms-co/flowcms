import { describe, it, expect } from "vitest";
import { normalizeFieldNames, normalizeSchemaFields, toCamelCase } from "./naming";

describe("toCamelCase", () => {
    it("coerces human strings into camelCase keys", () => {
        expect(toCamelCase("Cover image")).toBe("coverImage");
        expect(toCamelCase("cover_image")).toBe("coverImage");
        expect(toCamelCase("cover-image")).toBe("coverImage");
        expect(toCamelCase("OG image")).toBe("ogImage");
        expect(toCamelCase("Blog post")).toBe("blogPost");
        expect(toCamelCase("Title")).toBe("title");
        expect(toCamelCase("FAQ")).toBe("faq");
    });

    it("normalizes an already-camelCase value to itself", () => {
        expect(toCamelCase("coverImage")).toBe("coverImage");
        expect(toCamelCase("blogPost")).toBe("blogPost");
    });

    it("returns an empty string when there is nothing usable", () => {
        expect(toCamelCase("   ")).toBe("");
        expect(toCamelCase("!!!")).toBe("");
    });
});

describe("normalizeFieldNames", () => {
    it("camelCases every field name", () => {
        const out = normalizeFieldNames([{ name: "Cover image", type: "Media" }, { name: "Meta title", type: "Text" }]);
        expect(out.map((f) => f.name)).toEqual(["coverImage", "metaTitle"]);
    });

    it("de-duplicates sibling names with a numeric suffix", () => {
        const out = normalizeFieldNames([{ name: "Title" }, { name: "title" }, { name: "TITLE" }]);
        expect(out.map((f) => f.name)).toEqual(["title", "title2", "title3"]);
    });

    it("normalizes inline component sub-fields within their own scope", () => {
        const out = normalizeFieldNames([
            {
                name: "SEO block",
                type: "Component",
                fields: [{ name: "Meta title" }, { name: "meta_title" }],
            },
        ]);
        expect(out[0].name).toBe("seoBlock");
        expect(out[0].fields?.map((f) => f.name)).toEqual(["metaTitle", "metaTitle2"]);
    });

    it("falls back to 'field' for an unusable name", () => {
        expect(normalizeFieldNames([{ name: "!!!" }])[0].name).toBe("field");
    });
});

describe("normalizeSchemaFields", () => {
    it("rewrites only the fields array, leaving the rest of the schema intact", () => {
        const schema = { icon: "document", color: "#fff", jsonLd: "Article", fields: [{ name: "Cover image" }] };
        const out = normalizeSchemaFields(schema);
        expect(out.icon).toBe("document");
        expect(out.color).toBe("#fff");
        expect(out.fields?.[0].name).toBe("coverImage");
    });

    it("passes through a schema with no fields array", () => {
        const schema = { icon: "document" } as Record<string, unknown>;
        expect(normalizeSchemaFields(schema)).toBe(schema);
    });
});
