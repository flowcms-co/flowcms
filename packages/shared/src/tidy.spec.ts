import { describe, expect, it } from "vitest";
import { filterPastedHtml, tidyNote, tidyRich, tidyText, totalCount, emptyCounts } from "./tidy";

describe("tidyText", () => {
    it.each([
        ["trims both ends", "  Heading here  ", "Heading here"],
        ["collapses double spaces", "Water  damage   costs", "Water damage costs"],
        ["non-breaking spaces between words", "Water damage&nbsp;costs", "Water damage costs"],
        ["tabs and odd space characters", "Water\tdamage costs　now", "Water damage costs now"],
        ["zero-width characters", "Wa​ter dam﻿age", "Water damage"],
        ["windows line endings", "One\r\nTwo", "One\nTwo"],
        ["runs of blank lines", "One\n\n\n\n\nTwo", "One\n\nTwo"],
        ["spaces around a line break", "One  \n  Two", "One\nTwo"],
        ["leaves a clean value alone", "Understanding Ceiling Repair Costs", "Understanding Ceiling Repair Costs"],
        ["leaves punctuation and words alone", "Why Early Remediation Helps? It's “quoted” – really", "Why Early Remediation Helps? It's “quoted” – really"],
    ])("%s", (_name, input, output) => {
        expect(tidyText(input).value).toBe(output);
    });

    it("strips a trailing colon only when asked", () => {
        expect(tidyText("Signs It's Time:", { stripColon: true }).value).toBe("Signs It's Time");
        expect(tidyText("Signs It's Time : ", { stripColon: true }).value).toBe("Signs It's Time");
        expect(tidyText("Signs It's Time:").value).toBe("Signs It's Time:");
        expect(tidyText("Signs：", { stripColon: true }).value).toBe("Signs");
        // A colon in the middle is part of the words, not stray formatting.
        expect(tidyText("Step 1: Call", { stripColon: true }).value).toBe("Step 1: Call");
    });

    it("live mode keeps the space a person is about to follow with a word", () => {
        expect(tidyText("Water ", { live: true }).value).toBe("Water ");
        expect(tidyText(" Water  damage", { live: true }).value).toBe("Water damage");
        expect(tidyText("Heading:", { live: true, stripColon: true }).value).toBe("Heading:");
    });

    it("counts what it fixed, and is idempotent", () => {
        const r = tidyText("  a  b   c  ", { stripColon: true });
        expect(r.value).toBe("a b c");
        expect(r.counts.spaces).toBe(1 + 2 + 2 + 2);
        expect(tidyText(r.value, { stripColon: true }).counts).toEqual(emptyCounts());
    });
});

describe("tidyRich", () => {
    it.each([
        ["empty paragraph", "<p>One</p><p></p><p>Two</p>", "<p>One</p><p>Two</p>"],
        ["paragraph with only a space", "<p>One</p><p> </p>", "<p>One</p>"],
        ["paragraph with only &nbsp;", "<p>One</p><p>&nbsp;</p><p>Two</p>", "<p>One</p><p>Two</p>"],
        ["paragraph with only a <br>", "<p>One</p><p><br></p><p><br/></p>", "<p>One</p>"],
        ["paragraph with only empty bold", "<p>One</p><p><strong> </strong></p>", "<p>One</p>"],
        ["trailing <br>", "<p>One<br></p><p>Two<br /><br></p>", "<p>One</p><p>Two</p>"],
        ["trailing <br> inside a closing tag", "<p>One <strong>bold<br></strong></p>", "<p>One <strong>bold</strong></p>"],
        ["three or more <br> in a row", "<p>One<br><br><br><br>Two</p>", "<p>One<br><br>Two</p>"],
        ["double spaces", "<p>Water  damage   costs</p>", "<p>Water damage costs</p>"],
        ["leading and trailing spaces", "<p>  One two  </p><h2> Heading </h2>", "<p>One two</p><h2>Heading</h2>"],
        ["spaces inside a leading bold", "<p><strong> One</strong> two <em>three </em></p>", "<p><strong>One</strong> two <em>three</em></p>"],
        ["stray &nbsp; between words", "<p>Water&nbsp;damage&nbsp;costs</p>", "<p>Water damage costs</p>"],
        ["numeric nbsp and the character itself", "<p>a&#160;b c</p>", "<p>a b c</p>"],
        ["odd space characters", "<p>a b c　d</p>", "<p>a b c d</p>"],
        ["runs of blank lines between blocks", "<p>One</p>\n\n\n\n<p>Two</p>", "<p>One</p>\n<p>Two</p>"],
        ["pasted inline styles", '<p style="font-family: Arial; color: #333">One</p>', "<p>One</p>"],
        ["font tags", '<p><font face="Arial" size="3">One</font></p>', "<p>One</p>"],
        ["style-only spans", '<p><span style="font-size:11pt">One</span> two</p>', "<p>One two</p>"],
        ["Google Docs wrapper", '<b style="font-weight:normal;" id="docs-internal-guid-1234-abcd"><p style="line-height:1.38">One</p></b>', "<p>One</p>"],
        ["keeps spans that carry an attribute", '<p><span class="x">One</span></p>', '<p><span class="x">One</span></p>'],
        ["keeps real bold, italic and links", '<p>A <strong>b</strong> <em>c</em> <a href="/x">d</a></p>', '<p>A <strong>b</strong> <em>c</em> <a href="/x">d</a></p>'],
        ["keeps a paragraph that holds only a picture", '<p><img src="/a.png"></p>', '<p><img src="/a.png"></p>'],
        ["keeps list structure", "<ul><li>One</li><li> Two </li></ul>", "<ul><li>One</li><li>Two</li></ul>"],
        ["leaves code blocks alone", "<pre>a  b\n\n\n\nc</pre>", "<pre>a  b\n\n\n\nc</pre>"],
        ["leaves a clean value alone", '<p>Read the <a href="/resources/cost">cost guide</a> first.</p>', '<p>Read the <a href="/resources/cost">cost guide</a> first.</p>'],
    ])("%s", (_name, input, output) => {
        expect(tidyRich(input).value).toBe(output);
    });

    const DIRTY = '<p style="x">  Water&nbsp;&nbsp;damage <font>costs</font><br></p><p>&nbsp;</p>\n\n\n<p>Call  us<br><br><br></p>';

    it("never changes the words", () => {
        const words = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/&nbsp;| /g, " ").split(/\s+/).filter(Boolean).join(" ");
        expect(words(tidyRich(DIRTY).value)).toBe(words(DIRTY));
    });

    it("is idempotent", () => {
        const once = tidyRich(DIRTY);
        expect(tidyRich(once.value).value).toBe(once.value);
        expect(totalCount(tidyRich(once.value).counts)).toBe(0);
    });

    it("counts each kind of fix", () => {
        const c = tidyRich('<p style="a">Water&nbsp;damage  costs<br></p><p></p><p>x</p>').counts;
        expect(c).toMatchObject({ styles: 1, nbsp: 1, spaces: 1, breaks: 1, emptyBlocks: 1 });
    });

    it("handles empty input", () => {
        expect(tidyRich("").value).toBe("");
    });
});

describe("tidyNote", () => {
    it("says what was fixed, in plain words", () => {
        expect(tidyNote({ ...emptyCounts(), spaces: 3 })).toBe("Tidied 3 extra spaces");
        expect(tidyNote({ ...emptyCounts(), spaces: 1 })).toBe("Tidied 1 extra space");
        expect(tidyNote({ ...emptyCounts(), spaces: 2, emptyBlocks: 1 })).toBe("Tidied 2 extra spaces and 1 empty paragraph");
        expect(tidyNote({ ...emptyCounts(), spaces: 2, nbsp: 1, colons: 1 })).toBe("Tidied 2 extra spaces, 1 stray hard space and 1 trailing colon");
        expect(tidyNote(emptyCounts())).toBeNull();
    });
});

describe("filterPastedHtml", () => {
    const intro = ["paragraph", "bold", "italic", "link"];
    it.each([
        ["a heading becomes a paragraph", "<h2>Costs</h2><p>Text</p>", "<p>Costs</p><p>Text</p>"],
        ["a bullet list becomes paragraphs", "<ul><li>One</li><li><p>Two</p></li></ul>", "<p>One</p><p>Two</p>"],
        ["a numbered list becomes paragraphs", "<ol><li>One</li></ol>", "<p>One</p>"],
        ["a table becomes paragraphs", "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>", "<p>A</p><p>B</p>"],
        ["pictures and rules are dropped", '<p>Hi</p><img src="/a.png"><hr>', "<p>Hi</p>"],
        ["a quote is unwrapped", "<blockquote><p>Said</p></blockquote>", "<p>Said</p>"],
        ["allowed marks stay", '<p><strong>a</strong> <em>b</em> <a href="/x">c</a></p>', '<p><strong>a</strong> <em>b</em> <a href="/x">c</a></p>'],
        ["disallowed marks are unwrapped", "<p><u>a</u> <mark>b</mark> <code>c</code></p>", "<p>a b c</p>"],
        ["pasted styles go", '<p style="color:red"><span style="x">a</span></p>', "<p>a</p>"],
        ["a whole pasted document", "<html><body><!--StartFragment--><p>a</p><!--EndFragment--></body></html>", "<p>a</p>"],
    ])("intro: %s", (_n, input, output) => {
        expect(filterPastedHtml(input, intro)).toBe(output);
    });

    it("keeps what a section allows, and turns a numbered list into a bullet list when only bullets are allowed", () => {
        const section = ["paragraph", "bulletList", "bold", "italic", "link"];
        expect(filterPastedHtml("<ul><li>One</li></ul>", section)).toBe("<ul><li>One</li></ul>");
        expect(filterPastedHtml("<ol><li>One</li></ol>", section)).toBe("<ul><li>One</li></ul>");
        expect(filterPastedHtml("<h3>Q?</h3><p>A</p>", section)).toBe("<p>Q?</p><p>A</p>");
    });
});
