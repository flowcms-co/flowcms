import { describe, expect, it } from "vitest";
import { slugify, stripTags, escapeHtml } from "./strings";

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
