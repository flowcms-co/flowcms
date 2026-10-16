import { describe, expect, it } from "vitest";
import { isImageRef, preview, textOf, topFields, wordDiff } from "./activity";

describe("activity helpers", () => {
    it("diffs word by word, keeping what didn't change", () => {
        const parts = wordDiff("Arrives within 60 minutes, day or night.", "Arrives within 45 minutes, day or night.");
        expect(parts.filter((p) => p.kind !== "same")).toEqual([
            { text: "60", kind: "del" },
            { text: "45", kind: "add" },
        ]);
        expect(parts.filter((p) => p.kind !== "add").map((p) => p.text).join("")).toBe("Arrives within 60 minutes, day or night.");
        expect(parts.filter((p) => p.kind !== "del").map((p) => p.text).join("")).toBe("Arrives within 45 minutes, day or night.");
    });

    it("reads rich text as text and never as markup", () => {
        expect(textOf('<p>Costs &amp; <a href="/x">timing</a></p><ul><li>One</li></ul>')).toBe("Costs & timing One");
        expect(preview("")).toBe("(empty)");
        expect(preview({ a: 1 })).toBe('{"a":1}');
    });

    it("spots media references and image URLs", () => {
        expect(isImageRef("/media/3f2a.webp")).toBe(true);
        expect(isImageRef("https://media.example.com/a.jpg?w=300")).toBe(true);
        expect(isImageRef("/media/<script>")).toBe(false);
        expect(isImageRef("Hello")).toBe(false);
    });

    it("names the top-level fields a set of changes touches", () => {
        expect(topFields([{ path: "faq[0].answer", before: 1, after: 2 }, { path: "faq[1].q", before: 1, after: 2 }, { path: "title", before: 1, after: 2 }])).toEqual(["faq", "title"]);
    });
});
