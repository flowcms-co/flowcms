import { describe, expect, it } from "vitest";
import { fillPattern, placeholdersIn, resolvePlaceholders, slugFromPattern } from "./slug-pattern";
import type { SchemaField } from "./entry-validation";

const fields: SchemaField[] = [
    { name: "title", type: "Text" },
    { name: "service", type: "Reference", referencedTypeId: "svc" },
    { name: "city", type: "Reference", referencedTypeId: "city" },
];
const entries: Record<string, { slug: string | null; title: string }> = {
    s1: { slug: "water-damage-restoration", title: "Water Damage Restoration" },
    c1: { slug: "chicago-il", title: "Chicago, IL" },
};
const find = async (id: string) => entries[id] ?? null;
const data = { title: "Water damage in Chicago", service: "s1", city: ["c1"] };

describe("slug patterns", () => {
    it("lists the placeholders once each", () => {
        expect(placeholdersIn("{service.slug}-{city.slug}-{city.slug}")).toEqual(["service.slug", "city.slug"]);
    });
    it("resolves own fields and referenced entries' slug or title", async () => {
        const v = await resolvePlaceholders(fields, data, ["title", "service.slug", "city.title", "city.slug"], find);
        expect(v).toEqual({ title: "Water damage in Chicago", "service.slug": "water-damage-restoration", "city.title": "Chicago, IL", "city.slug": "chicago-il" });
    });
    it("builds the slug the site expects", async () => {
        const v = await resolvePlaceholders(fields, data, ["service.slug", "city.slug"], find);
        expect(slugFromPattern("{service.slug}-{city.slug}", v)).toBe("water-damage-restoration-chicago-il");
        expect(fillPattern("/{service.slug}/{city.slug}", v)).toBe("/water-damage-restoration/chicago-il");
    });
    it("gives no slug while a reference is missing or points nowhere", async () => {
        const v = await resolvePlaceholders(fields, { ...data, city: null }, ["service.slug", "city.slug"], find);
        expect(slugFromPattern("{service.slug}-{city.slug}", v)).toBe("");
        const gone = await resolvePlaceholders(fields, { ...data, city: "nope" }, ["city.slug"], find);
        expect(gone).toEqual({});
    });
    it("ignores keys that are not fields, not references, or ask for something else", async () => {
        const v = await resolvePlaceholders(fields, data, ["nothing", "title.slug", "service.id"], find);
        expect(v).toEqual({});
    });
    it("slugifies whatever the pattern produces", () => {
        expect(slugFromPattern("{title}", { title: "Pest Control in Chicago, IL!" })).toBe("pest-control-in-chicago-il");
    });
});
