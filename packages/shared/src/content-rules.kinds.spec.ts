import { describe, expect, it } from "vitest";
import { checkContentRules, type FieldRules } from "./content-rules";
import { cityProblem, labelParagraph, linksIn, wordCount } from "./content-rules-checks";
import { RESOURCES_SCHEMA } from "./seed-schemas";

const one = (fields: Record<string, FieldRules>, data: Record<string, unknown>) => checkContentRules({ fields }, RESOURCES_SCHEMA, {}, data);
const spc = (v: Record<string, unknown>) => ({ servicePageContent: v });
const INTRO = "servicePageContent.introText";
const msgs = (l: { message: string }[]) => l.map((i) => i.message);

describe("text rules", () => {
    it("startsWith ignores case, and names the first word", () => {
        const r = { title: { startsWith: ["Schedule"] } };
        expect(one(r, { title: "schedule a visit" })).toEqual([]);
        expect(msgs(one(r, { title: "Book A Visit" }))).toEqual(["This should start with “Schedule” (it starts with “Book”). Rewrite the beginning."]);
        expect(msgs(one({ title: { startsWith: ["A", "B"] } }, { title: "Zed" }))[0]).toContain("“A” or “B”");
    });
    it("endsWith, notContains, containsAny", () => {
        expect(one({ title: { endsWith: ["?"] } }, { title: "Why?" })).toEqual([]);
        expect(msgs(one({ title: { endsWith: ["?"] } }, { title: "Why" }))[0]).toBe("This should end with “?”. Add it at the end, or reword.");
        expect(msgs(one({ title: { notContains: ["Acme Home"] } }, { title: "Repair | Acme Home" }))[0]).toBe("This should not contain “Acme Home”. Take it out.");
        expect(one({ title: { containsAny: ["Acme Home", "our local"] } }, { title: "Our local pros" })).toEqual([]);
        expect(msgs(one({ title: { containsAny: ["Acme Home", "our local"] } }, { title: "Pros" }))[0]).toBe("This should mention “Acme Home” or “our local”. Add it, or reword so it does.");
    });
    it("pattern, and a bad pattern never blocks", () => {
        expect(msgs(one({ title: { pattern: "^Serving \\d+ cities\\.$" } }, { title: "Serving many cities." }))).toHaveLength(1);
        expect(one({ title: { pattern: "^Serving \\d+ cities\\.$" } }, { title: "Serving 5 cities." })).toEqual([]);
        expect(one({ title: { pattern: "([" } }, { title: "x" })).toEqual([]);
    });
    it("words and characters", () => {
        const r = { title: { minWords: 3, maxWords: 5, minChars: 10, maxChars: 30 } };
        expect(one(r, { title: "one two three four" })).toEqual([]);
        expect(msgs(one({ title: { minWords: 3 } }, { title: "one two" }))).toEqual(["This has 2 words. Aim for at least 3."]);
        expect(msgs(one({ title: { maxWords: 2 } }, { title: "one two three" }))).toEqual(["This has 3 words. Keep it to 2 or fewer."]);
        expect(msgs(one({ title: { maxChars: 5 } }, { title: "abcdefg" }))).toEqual(["This is 7 characters. Keep it to 5 or fewer."]);
        expect(msgs(one({ title: { minChars: 9 } }, { title: "abc" }))).toEqual(["This is 3 characters. Aim for at least 9."]);
        expect(wordCount("a  b\nc")).toBe(3);
    });
    it("mustBeEmpty and plainText", () => {
        expect(one({ title: { mustBeEmpty: true } }, { title: "" })).toEqual([]);
        expect(msgs(one({ title: { mustBeEmpty: true } }, { title: "x" }))).toEqual(["This box should stay empty. Clear it."]);
        expect(msgs(one({ title: { plainText: true } }, { title: "A <b>bold</b> title" }))[0]).toBe("This box has formatting code in it (“<b>”). It is a plain text box, so the code would show on the page. Retype it as plain text.");
        expect(one({ title: { plainText: true } }, { title: "Fish & chips" })).toEqual([]);
    });
    it("sameAs and containedIn read another field", () => {
        const r = { metaTitle: { sameAs: "title" }, focusKeyword: { containedIn: "title" } };
        expect(one(r, { title: "Water Damage Costs", metaTitle: "Water Damage Costs", focusKeyword: "damage costs" })).toEqual([]);
        const bad = one(r, { title: "Water Damage Costs", metaTitle: "Other", focusKeyword: "mold" });
        expect(msgs(bad)).toEqual(["This should be exactly the same as “Water Damage Costs”.", "The words “mold” should also appear in “Water Damage Costs”."]);
    });
    it("a non-text field: notEmpty on a list and on a picked value", () => {
        expect(msgs(one({ trackdriveCategory: { notEmpty: true } }, { title: "x" }))).toHaveLength(1);
        expect(one({ trackdriveCategory: { notEmpty: true } }, { trackdriveCategory: "abc" })).toEqual([]);
        expect(msgs(one({ tags: { minItems: 2, maxItems: 4 } }, { tags: ["a"] }))).toEqual(["This block needs at least 2 items and has 1. Add 1 more."]);
        expect(msgs(one({ relatedPost: { exactItems: 3 } }, {}))).toEqual(["This block needs exactly 3 items and has 0. Add 3 so there are 3."]);
    });
});

describe("city placeholders", () => {
    it.each([
        ["Repair {City:Near You}", null],
        ["{City, STATEABV:Near You} and {State:here}", null],
        ["Serving {CityCount} cities.", { kind: "count", token: "{CityCount}" }],
        ["Repair {Town:Near You}", { kind: "unknown", token: "{Town:Near You}" }],
        ["Repair {City}", { kind: "nofallback", token: "{City}" }],
        ["Repair {City:}", { kind: "nofallback", token: "{City:}" }],
        ["Repair {City:Dallas, TX}", { kind: "comma", token: "{City:Dallas, TX}" }],
        ["Repair {City:a:b}", { kind: "comma", token: "{City:a:b}" }],
        ["Repair {City:Near You", { kind: "brace", token: "{City:Near You" }],
        ["Repair City:Near You}", { kind: "brace", token: "}" }],
    ])("%s", (text, want) => {
        expect(cityProblem(text, false)).toEqual(want);
    });
    it("CityCount is fine where it is allowed", () => {
        expect(cityProblem("Serving {CityCount} cities.", true)).toBeNull();
        expect(one({ title: { cityTokens: "allowCount" } }, { title: "Serving {CityCount} cities." })).toEqual([]);
        expect(msgs(one({ title: { cityTokens: true } }, { title: "Serving {CityCount} cities." }))[0]).toBe("{CityCount} only works in the Hero subheadline. Anywhere else it disappears. Remove it here.");
    });
    it("noBraces keeps tokens out of image descriptions", () => {
        expect(msgs(one({ title: { noBraces: true } }, { title: "A tech in {City:Dallas}" }))[0]).toContain("City placeholders do not work here");
        expect(one({ title: { noBraces: true } }, { title: "A tech" })).toEqual([]);
    });
});

describe("rich text rules", () => {
    const intro = (r: FieldRules, html: string) => one({ [INTRO]: r }, spc({ introText: html }));
    it("minParagraphs, minLists, list item counts", () => {
        expect(msgs(intro({ minParagraphs: 1 }, "<ul><li>a</li></ul>"))).toEqual(["This box has 0 paragraphs and needs at least 1. Add one."]);
        expect(msgs(intro({ minLists: 1 }, "<p>a</p>"))).toEqual(["This box has 0 bullet lists and needs at least 1. Add a list."]);
        expect(msgs(intro({ minListItems: 3 }, "<ul><li>a</li><li>b</li></ul>"))).toEqual(["A bullet list here has 2 points and needs at least 3. Add more points."]);
        expect(msgs(intro({ maxListItems: 2 }, "<ul><li>a</li><li>b</li><li>c</li></ul>"))).toEqual(["A bullet list here has 3 points and can have at most 2. Trim it, or split it."]);
        expect(intro({ minListItems: 2, maxListItems: 3 }, "<p>x</p><ul><li>a</li><li>b</li></ul>")).toEqual([]);
    });
    it("noLabelParagraphs: a bold-only line, and a line ending in a colon", () => {
        const html = (p: string) => `<p>Real text.</p>${p}`;
        expect(msgs(intro({ noLabelParagraphs: true }, html("<p><strong>Professionals typically inspect:</strong></p>")))[0]).toContain("only a label (“Professionals typically inspect:”)");
        expect(intro({ noLabelParagraphs: true }, html("<p><strong>Bold</strong> then words.</p>"))).toEqual([]);
        expect(intro({ noLabelParagraphs: true }, html("<p>Some <strong>bold</strong> and more.</p>"))).toEqual([]);
        expect(msgs(intro({ noLabelParagraphs: true }, html("<p>You can reduce costs by:</p>")))).toHaveLength(1);
        expect(intro({ noLabelParagraphs: ["bold"] }, html("<p>You can reduce costs by:</p>"))).toEqual([]);
        expect(labelParagraph(["<p><b>a</b> <b>b</b></p>"])).toBe("a b");
    });
    it("noNestedLists and noOrderedLists", () => {
        expect(msgs(intro({ noNestedLists: true }, "<ul><li>a<ul><li>b</li></ul></li></ul>"))).toEqual(["This box has a list inside a list. Use one plain bullet list."]);
        expect(intro({ noNestedLists: true }, "<ul><li>a</li></ul><ul><li>b</li></ul>")).toEqual([]);
        expect(msgs(intro({ noOrderedLists: true }, "<ol><li>a</li></ol>"))).toEqual(["This box has a numbered list. Use one plain bullet list."]);
    });
    it("noLinks: inside list items only, or anywhere", () => {
        const html = '<p>See <a href="/a">this page</a>.</p><ul><li>Call <a href="/b">us now</a></li></ul>';
        expect(msgs(intro({ noLinks: "listItem" }, html))[0]).toBe("A bullet point has a link in it (“us now”). Links inside bullet points do not work on the page: the text shows but the link is removed. Move the link into the paragraph above the list.");
        expect(intro({ noLinks: "listItem" }, '<p><a href="/a">x</a></p><ul><li>plain</li></ul>')).toEqual([]);
        expect(msgs(intro({ noLinks: true }, '<p><a href="/a">x</a></p>'))).toEqual(["This box has a link in it (“x”). Links are not used here. Remove the link."]);
        expect(linksIn(html).map((l) => [l.text, l.inList])).toEqual([["this page", false], ["us now", true]]);
    });
    it("linksRelative flags full addresses, allows paths, anchors, mail and phone", () => {
        expect(msgs(intro({ linksRelative: true }, '<p><a href="https://example.com/">home</a></p>'))[0]).toContain("full web address (“https://example.com/”)");
        expect(intro({ linksRelative: true }, '<p><a href="/resources/x">a</a> <a href="#top">b</a> <a href="mailto:a@b.c">c</a> <a href="tel:+1">d</a></p>')).toEqual([]);
        expect(msgs(intro({ linksRelative: true }, '<p><a href="//evil.example/x">a</a></p>'))).toHaveLength(1);
    });
    it("words, and rich text starts and contains", () => {
        expect(msgs(intro({ minWords: 5 }, "<p>one two</p><p>three</p>"))).toEqual(["This has 3 words. Aim for at least 5."]);
        expect(msgs(intro({ minWords: 3 }, "<ul><li>a</li><li>b</li></ul>"))).toHaveLength(1); // list items count as separate words
        expect(intro({ containsAny: ["Acme Home"] }, "<p>Acme Home helps.</p>")).toEqual([]);
    });
    it("mustBeEmpty on rich text", () => {
        expect(intro({ mustBeEmpty: true }, "<p>&nbsp;</p>")).toEqual([]);
        expect(msgs(intro({ mustBeEmpty: true }, "<p>x</p>"))).toHaveLength(1);
    });
});

describe("block rules", () => {
    const sections = (rules: FieldRules, items: unknown[]) => one({ "servicePageContent.sections": rules }, spc({ sections: items }));
    it("itemRules: first, last, notLast, all and a number, each by its own sub-field", () => {
        const rules: FieldRules = {
            itemRules: [
                { index: 1, rules: { heading: { startsWith: ["A"] } } },
                { index: "last", rules: { heading: { startsWith: ["Z"] } } },
                { index: "notLast", rules: { content: { minLists: 1 } } },
                { index: "all", rules: { heading: { notEmpty: true } } },
            ],
        };
        const out = sections(rules, [{ heading: "B", content: "<p>x</p>" }, { heading: "", content: "<ul><li>a</li></ul>" }, { heading: "Y", content: "" }]);
        expect(out.map((i) => `${i.rule}@${i.path}`)).toEqual([
            "startsWith@servicePageContent.sections[0].heading",
            "startsWith@servicePageContent.sections[2].heading",
            "minLists@servicePageContent.sections[0].content",
            "notEmpty@servicePageContent.sections[1].heading",
        ]);
        expect(out[0].location).toBe("Article sections #1 › Heading");
        expect(sections({ itemRules: [{ index: "first", rules: { heading: { startsWith: ["B"] } } }] }, [{ heading: "B" }])).toEqual([]);
        // An item that does not exist is simply not checked.
        expect(sections({ itemRules: [{ index: 5, rules: { heading: { startsWith: ["B"] } } }] }, [{ heading: "A" }])).toEqual([]);
    });
    it("itemRules levels are per rule", () => {
        const out = sections({ itemRules: [{ index: 1, rules: { heading: { startsWith: { value: ["A"], level: "warn" } } } }] }, [{ heading: "B" }]);
        expect(out[0].level).toBe("warn");
    });
    it("onlyKeys flags extra and upper case keys, not internal ones", () => {
        const r = { "faqSection.faqs": { onlyKeys: ["question", "answer"] } };
        const faqs = (rows: unknown[]) => one(r, { faqSection: { faqs: rows } });
        expect(faqs([{ question: "Q?", answer: "<p>A</p>", __uid: "x" }])).toEqual([]);
        const [i] = faqs([{ question: "Q?", answer: "<p>A</p>", Question: "Q2?", Answer: "<p>A2</p>" }]);
        expect(i).toMatchObject({ path: "faqSection.faqs[0]", location: "FAQ #1" });
        expect(i.message).toBe("This row also holds hidden fields (“Question”, “Answer”) that the editor does not show, and the page would show them as an extra entry. Delete this row with the bin icon and add it again.");
    });
    it("lastItemIs with ifPresent only checks when the item exists", () => {
        const r = { lastItemIs: ["heading", "How can we help?", "ifPresent"] };
        expect(sections(r, [{ heading: "A" }, { heading: "B" }])).toEqual([]);
        expect(sections(r, [{ heading: "How can we help?" }, { heading: "B" }])).toHaveLength(2);
    });
    it("notEmpty on a block, and uniqueItems against another heading", () => {
        expect(msgs(one({ servicePageContent: { notEmpty: true } }, {}))).toEqual(["This block is empty. Fill it in."]);
        expect(one({ servicePageContent: { notEmpty: true } }, spc({ heading: "x" }))).toEqual([]);
        const out = one({ "servicePageContent.sections": { uniqueItems: { value: ["heading"], also: ["servicePageContent.heading"] } } }, spc({ heading: "Overview", sections: [{ heading: "overview" }] }));
        expect(out).toHaveLength(1);
    });
    it("soft: a second set of rules at warn, beside a hard one", () => {
        const r = { "servicePageContent.sections": { minItems: 1, soft: { minItems: 3 } } };
        const out = one(r, spc({ sections: [{ heading: "a" }] }));
        expect(out.map((i) => [i.rule, i.level])).toEqual([["minItems", "warn"]]);
        const none = one(r, spc({ sections: [] }));
        expect(none.map((i) => i.level).sort()).toEqual(["block", "warn"]);
    });
});
