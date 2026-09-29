import { describe, expect, it } from "vitest";
import { slugify, stripTags, escapeHtml, isAltFieldName, pairedAltField } from "./strings";

describe("slugify", () => {
    it("slugs, truncates without trailing dash, and falls back", () => {
        expect(slugify(" Storm Damage Restoration! ")).toBe("storm-damage-restoration");
        expect(slugify("storm damage", { max: 6 })).toBe("storm");
        expect(slugify("???", { fallback: "page" })).toBe("page");
        expect(slugify("???")).toBe("");
    });
});

describe("stripTags", () => {
    it("drops tags/script/style and decodes common entities", () => {
        expect(stripTags("<p>a &amp; b</p><script>x()</script><style>p{}</style>")).toBe("a & b");
    });
});

describe("escapeHtml", () => {
    it("escapes &, <, >, quote", () => {
        expect(escapeHtml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
    });
});

describe("alt field pairing", () => {
    it("recognises alt field names", () => {
        for (const n of ["Alt text", "Image alt", "heroAlt", "alt_text", "ALT"]) expect(isAltFieldName(n), n).toBe(true);
        for (const n of ["Alternative", "Salt", "Altitude", "Title"]) expect(isAltFieldName(n), n).toBe(false);
    });

    it("pairs by name first, then a lone image with a lone alt field", () => {
        const T = (name: string) => ({ name, type: "Text" });
        const M = (name: string) => ({ name, type: "Media" });
        const two = [M("Hero image"), T("Hero image alt"), M("Thumbnail"), T("Thumbnail alt text")];
        expect(pairedAltField(two, M("Hero image"))).toBe("Hero image alt");
        expect(pairedAltField(two, M("Thumbnail"))).toBe("Thumbnail alt text");
        expect(pairedAltField([M("Image"), T("Alt text"), T("Caption")], M("Image"))).toBe("Alt text");
        // Two images, one unnamed alt: ambiguous, so no pairing.
        expect(pairedAltField([M("Hero"), M("Logo"), T("Alt text")], M("Hero"))).toBeUndefined();
        // An alt-named field that isn't Text doesn't count.
        expect(pairedAltField([M("Image"), { name: "Alt", type: "Number" }], M("Image"))).toBeUndefined();
    });
});
