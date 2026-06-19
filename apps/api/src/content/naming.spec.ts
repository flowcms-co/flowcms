import { describe, it, expect } from "vitest";
import { normalizeFieldNames, normalizeSchemaFields, normalizeFieldsWithData, toCamelCase, toLowerId } from "./naming";

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

describe("toLowerId", () => {
    it("keeps content-type ids lowercase (they double as URL slugs), not camelCase", () => {
        expect(toLowerId("services")).toBe("services");
        expect(toLowerId("Blog")).toBe("blog");
        expect(toLowerId("Blog Post")).toBe("blogpost");
        expect(toLowerId("case-study")).toBe("casestudy");
    });

    it("strips separators so the id stays a valid identifier", () => {
        expect(toLowerId("Case Study")).toBe("casestudy");
        expect(toLowerId("knowledge_base")).toBe("knowledgebase");
    });
});

describe("normalizeFieldsWithData", () => {
    it("camelCases field keys and rewrites matching data keys in lockstep", () => {
        const { fields, remap } = normalizeFieldsWithData([{ name: "Hero Image" }, { name: "meta_title" }]);
        expect(fields.map((f) => f.name)).toEqual(["heroImage", "metaTitle"]);
        expect(remap({ "Hero Image": "/x.jpg", meta_title: "Hi" })).toEqual({ heroImage: "/x.jpg", metaTitle: "Hi" });
    });

    it("recurses through component sub-fields and repeatable item arrays", () => {
        const { remap } = normalizeFieldsWithData([
            {
                name: "FAQ Section",
                type: "Component",
                repeatable: true,
                fields: [{ name: "Question Text" }, { name: "answer_body" }],
            },
        ]);
        expect(
            remap({ "FAQ Section": [{ "Question Text": "Q1", answer_body: "A1" }, { "Question Text": "Q2", answer_body: "A2" }] }),
        ).toEqual({ faqSection: [{ questionText: "Q1", answerBody: "A1" }, { questionText: "Q2", answerBody: "A2" }] });
    });

    it("preserves data keys that have no matching field", () => {
        const { remap } = normalizeFieldsWithData([{ name: "Title" }]);
        expect(remap({ Title: "Hi", extra: 1 })).toEqual({ title: "Hi", extra: 1 });
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
