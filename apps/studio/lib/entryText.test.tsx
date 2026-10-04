import { describe, expect, it } from "vitest";
import { entryText } from "./entryText";

describe("entryText", () => {
    it("reads text from any rich-text field and from sections, not only `body`", () => {
        const text = entryText({
            title: "Fire damage restoration",
            slug: "fire-damage",
            metaDescription: "Should not be scanned as page copy",
            intro: "<p>We restore homes after a fire.</p>",
            heroImage: "/media/abc.webp",
            sections: [{ __component: "hero", heading: "Call us any time", cta: "https://example.com/contact", theme: "dark" }],
        });
        expect(text).toBe("We restore homes after a fire. Call us any time");
    });

    it("still reads a plain body field", () => {
        expect(entryText({ body: "<h2>Hello there</h2><p>General Kenobi</p>" })).toBe("Hello there General Kenobi");
        expect(entryText(null)).toBe("");
    });
});
