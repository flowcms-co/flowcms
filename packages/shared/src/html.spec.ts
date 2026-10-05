import { describe, expect, it } from "vitest";
import { canonicalHtml, fixInternalLinks, internalNofollowLinks, isInternalHref, moveItem, preserveHtml, sameContent, splitBlocks, tidyHtml } from "./html";

// Stored content, as an importer or an earlier editor wrote it.
const ORIGINAL = '<h2>Costs & timing</h2>\n<p>Read the <a href="/resources/basement-flood-cleanup-cost">cost guide</a> first.</p>\n<ul><li>Pumps</li><li>Fans & heaters</li></ul>';
// What the visual editor makes of it on load.
const BASELINE = '<h2>Costs &amp; timing</h2><p>Read the <a href="/resources/basement-flood-cleanup-cost">cost guide</a> first.</p><ul><li><p>Pumps</p></li><li><p>Fans &amp; heaters</p></li></ul><p></p>';

describe("preserveHtml", () => {
    it("returns the stored HTML byte for byte when nothing was edited", () => {
        expect(preserveHtml(ORIGINAL, BASELINE, BASELINE)).toBe(ORIGINAL);
        // The editor adding or dropping its trailing empty paragraph is not an edit.
        expect(preserveHtml(ORIGINAL, BASELINE.replace(/<p><\/p>$/, ""), BASELINE)).toBe(ORIGINAL);
    });

    it("after editing one word, only that word differs", () => {
        const edited = BASELINE.replace("cost guide</a> first", "cost guide</a> today");
        expect(preserveHtml(ORIGINAL, BASELINE, edited)).toBe(ORIGINAL.replace("first", "today"));
    });

    it("keeps untouched blocks when a block is added or removed", () => {
        const added = BASELINE.replace("<p></p>", "<p>New closing line.</p>");
        expect(preserveHtml(ORIGINAL, BASELINE, added)).toBe(`${ORIGINAL}\n<p>New closing line.</p>`);
        const removed = BASELINE.replace(/<ul>.*<\/ul>/, "");
        expect(preserveHtml(ORIGINAL, BASELINE, removed)).toBe(ORIGINAL.split("\n").slice(0, 2).join("\n"));
    });

    it("writes an edited list without wrapping its items in paragraphs, unless they already were", () => {
        const edited = BASELINE.replace("<p>Pumps</p>", "<p>Sump pumps</p>");
        expect(preserveHtml(ORIGINAL, BASELINE, edited)).toContain("<ul><li>Sump pumps</li><li>Fans &amp; heaters</li></ul>");
        const withP = "<ul><li><p>One</p></li></ul>";
        expect(preserveHtml(withP, withP, "<ul><li><p>Two</p></li></ul><p></p>")).toBe("<ul><li><p>Two</p></li></ul>");
    });
});

describe("html helpers", () => {
    it("splits top-level blocks as written", () => {
        expect(splitBlocks('<p>a <b>b</b></p>\n<img src="x.png"><ul><li>1<ul><li>2</li></ul></li></ul>loose')).toEqual(["<p>a <b>b</b></p>", '<img src="x.png">', "<ul><li>1<ul><li>2</li></ul></li></ul>", "loose"]);
    });

    it("tidies only what the editor adds", () => {
        expect(tidyHtml("<p>a</p><p></p><p> </p>")).toBe("<p>a</p>");
        expect(tidyHtml("<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>")).toBe("<ul><li><p>a</p><ul><li>b</li></ul></li></ul>");
    });

    it("knows an internal link from an external one", () => {
        expect(["/a", "a/b", "#top", "?q=1", "https://example.com/a", "//www.example.com/a"].every((h) => isInternalHref(h, "https://example.com"))).toBe(true);
        expect(["https://other.com/a", "mailto:a@example.com", "tel:1"].some((h) => isInternalHref(h, "example.com"))).toBe(false);
        expect(isInternalHref("https://example.com/a")).toBe(false); // no site URL known: only relative links are internal
    });

    it("finds and repairs nofollow on internal links, leaving external links alone", () => {
        const html = '<p><a target="_blank" rel="noopener noreferrer nofollow" href="/guide">in</a> <a rel="nofollow" target="_blank" href="https://other.com">out</a> <a href="/ok">ok</a></p>';
        expect(internalNofollowLinks(html, "example.com")).toEqual(["/guide"]);
        expect(fixInternalLinks(html, "example.com")).toBe('<p><a href="/guide">in</a> <a rel="nofollow" target="_blank" href="https://other.com">out</a> <a href="/ok">ok</a></p>');
    });

    it("sees through editor normalisation when comparing a draft with the live version", () => {
        const live = { title: "T", body: ORIGINAL, sections: [{ text: "<ul><li>A & B</li></ul>" }], guides: ["a", "b"] };
        const noise = {
            title: "T",
            body: BASELINE.replace('<a href="/resources', '<a target="_blank" rel="noopener noreferrer nofollow" href="/resources').replace("<p></p>", "<p> </p>"),
            sections: [{ text: "<ul><li><p>A &amp; B</p></li></ul>" }],
            guides: ["a", "b"],
            summary: "",
        };
        expect(canonicalHtml(noise.body)).toBe(canonicalHtml(live.body));
        expect(sameContent(live, noise)).toBe(true);
        expect(sameContent(live, { ...noise, title: "T2" })).toBe(false);
        expect(sameContent(live, { ...noise, guides: ["b", "a"] })).toBe(false);
        expect(sameContent(live, { ...noise, body: noise.body.replace("first", "now") })).toBe(false);
    });

    it("moves an item within a list", () => {
        expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
        expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
        const same = ["a"];
        expect(moveItem(same, 0, 3)).toBe(same);
    });
});
