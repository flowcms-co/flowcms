import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkContentRules, configProblems, blocking, issueErrors, inlineMessages, isRichEmpty, publishBlockedMessage, startsWithAction, titleCaseProblem, tidyEntryData, type ContentRules } from "./content-rules";
import { elementHtml } from "./elements";
import { BAD_WATER_DAMAGE, CLEAN_ARTICLE, RESOURCES_FIELDS, RESOURCES_RULES } from "./content-rules.fixtures";

const run = (rules: ContentRules, data: Record<string, unknown>) => checkContentRules(rules, RESOURCES_FIELDS, {}, data);
const one = (fields: ContentRules["fields"], data: Record<string, unknown>) => run({ fields }, data);
const sc = (partial: Record<string, unknown>) => ({ servicePageContent: partial });
const section = (content: string, heading = "Heading Here") => sc({ sections: [{ heading, content }] });

describe("the reference article", () => {
    it("has no findings at all", () => {
        expect(run(RESOURCES_RULES(), CLEAN_ARTICLE)).toEqual([]);
    });
});

describe("allow", () => {
    const rules = { "servicePageContent.introText": { allow: ["paragraph", "bold", "italic", "link"] } };
    const intro = (html: string) => one(rules, sc({ introText: html }));

    it("passes paragraphs with allowed marks", () => {
        expect(intro('<p>Hello <strong>there</strong> and <em>you</em>, see <a href="/x">this</a>.</p>')).toEqual([]);
    });

    it("blocks a bullet list, with the catalogue text and the editor's label", () => {
        const [i] = intro("<p>Hi</p><ul><li>a</li></ul>");
        expect(i).toMatchObject({ rule: "allow", level: "block", path: "servicePageContent.introText", location: "Intro" });
        expect(i.message).toBe("This box has a bullet list, and lists are not used here. Rewrite the points as one or two normal sentences, or move the list into an article section.");
        expect(i.fieldHelp).toBe("One short paragraph. No lists or headings.");
    });

    it("blocks a heading and quotes it", () => {
        const [i] = intro("<p>Hi</p><h3>Does the Size Matter?</h3><p>Yes.</p>");
        expect(i.message).toBe(
            "This box has a heading inside the text (“Does the Size Matter?”). Headings are not used here. If it is a new topic, add a new article section and put it in that section's Heading box. If it is a question and answer, move it to the FAQ.",
        );
    });

    it("tells a numbered list from a bullet list when bullets are allowed", () => {
        const r = { "servicePageContent.sections[].content": { allow: ["paragraph", "bulletList"] } };
        const [i] = one(r, section("<ol><li>a</li></ol>"));
        expect(i.message).toBe("This box has a numbered list. Use a bullet list here. Numbered steps belong in the action steps block.");
        // Neither list allowed: the plain list message.
        expect(intro("<ol><li>a</li></ol>")[0].message).toContain("bullet list, and lists are not used here");
    });

    it.each([
        ["<table><tr><td>x</td></tr></table>", "table"],
        ['<p><img src="/a.png"></p>', "picture"],
        ["<blockquote><p>q</p></blockquote>", "quote"],
        ["<pre>code</pre>", "code block"],
        ["<hr>", "divider line"],
    ])("blocks %s as a %s", (html, thing) => {
        const [i] = intro(`<p>Text</p>${html}`);
        expect(i.message).toBe(`This box has a ${thing}, which is not used here. Remove it, or say the same thing in a normal sentence.`);
    });

    it("blocks a mark that is not allowed, in plain words", () => {
        const [i] = intro("<p>Some <u>underlined</u> text</p>");
        expect(i.message).toBe("This box has underlined text, which is not used here. Select the text and remove the formatting.");
    });

    it("treats malformed or odd html as a problem, never a crash", () => {
        expect(() => intro("<p>unclosed <strong>bold")).not.toThrow();
        expect(intro("<div><p>x</p></div>")[0].message).toContain("not plain text");
    });
});

describe("maxLists and listMustBeLast", () => {
    const r = { "servicePageContent.sections[].content": { maxLists: 1, listMustBeLast: true } };

    it("passes one list at the end", () => {
        expect(one(r, section("<p>Lead</p><ul><li>a</li></ul>"))).toEqual([]);
    });

    it("blocks two lists", () => {
        const out = one(r, section("<ul><li>a</li></ul><p>Between</p><ul><li>b</li></ul>"));
        const i = out.find((x) => x.rule === "maxLists")!;
        expect(i.message).toBe("This section has 2 bullet lists. Keep one list per section. Join them into one list, or move the second list into a new section with its own heading.");
        expect(i.location).toBe("Article sections #1 › Content");
    });

    it("blocks a paragraph after the list, and counts an ordered list too", () => {
        const [i] = one(r, section("<ul><li>a</li></ul><p>After</p>"));
        expect(i.message).toBe("This paragraph comes after the bullet list. Move it above the list, or into the next section.");
        expect(one(r, section("<ol><li>a</li></ol><p>After</p>")).map((x) => x.rule)).toContain("listMustBeLast");
    });

    it("ignores an empty paragraph after the list", () => {
        expect(one(r, section("<ul><li>a</li></ul><p></p><p>&nbsp;</p>"))).toEqual([]);
    });

    it("reads list items with and without inner paragraphs the same way", () => {
        expect(one(r, section("<ul><li><p>a</p></li><li><p>b</p></li></ul>"))).toEqual([]);
        expect(one(r, section("<ul><li><p>a</p></li></ul><p>x</p>")).map((x) => x.rule)).toEqual(["listMustBeLast"]);
    });
});

describe("notEmpty", () => {
    it("rich text: empty paragraphs and nbsp do not count as text", () => {
        const r = { "servicePageContent.introText": { notEmpty: true } };
        for (const html of ["", "<p></p>", "<p>&nbsp;</p>", "<p><br></p>", "<p> </p>", undefined as never]) {
            const out = one(r, sc({ introText: html }));
            expect(out.map((x) => x.rule)).toEqual(["notEmpty"]);
        }
        expect(out0(one(r, sc({ introText: "<p>&nbsp;</p>" }))).message).toBe("This box is empty. Write the text, or remove this section if it is not needed.");
        expect(one(r, sc({ introText: "<p>Real.</p>" }))).toEqual([]);
        // A picture is content.
        expect(one(r, sc({ introText: '<p><img src="/a.png"></p>' }))).toEqual([]);
    });

    it("a heading box gets the heading message", () => {
        const r = { "servicePageContent.sections[].heading": { notEmpty: true } };
        const [i] = one(r, sc({ sections: [{ heading: "Ok" }, { heading: "   ", content: "<p>x</p>" }] }));
        expect(i.message).toBe("This section has no heading. Add a short heading, or remove the section.");
        expect(i.location).toBe("Article sections #2 › Heading");
        expect(i.path).toBe("servicePageContent.sections[1].heading");
    });
});
const out0 = (l: { message: string }[]) => l[0];

describe("noTrailingColon and titleCase", () => {
    it("blocks a trailing colon and quotes the heading", () => {
        const r = { "servicePageContent.sections[].heading": { noTrailingColon: true } };
        const [i] = one(r, sc({ sections: [{ heading: "Signs It's Time For Professional Inspection:" }] }));
        expect(i.message).toBe("This heading ends with a colon (“Signs It's Time For Professional Inspection:”). Remove the colon. If it introduces a list, make it a bold line inside the text above the list instead of a heading.");
        expect(one(r, sc({ sections: [{ heading: "Fine Heading" }] }))).toEqual([]);
    });

    it("titleCase warns by default and suggests the fix", () => {
        const r = { "servicePageContent.sections[].heading": { titleCase: true } };
        const [i] = one(r, sc({ sections: [{ heading: "When DIY troubleshooting may still help" }] }));
        expect(i.level).toBe("warn");
        expect(i.message).toBe("This heading's capital letters look uneven (“When DIY troubleshooting may still help”). Suggested: “When DIY Troubleshooting May Still Help”. Change it, or leave it if a brand name needs it this way.");
    });

    it.each([
        ["What Affects The Cost?", null],
        ["Signs of Damage in the Basement", null],
        ["How a Homeowner Can Help", null],
        ["Using an iPhone to Document Damage", null],
        ["Cost to repair ceilings", "Cost to Repair Ceilings"],
        ["Why Early remediation helps", "Why Early Remediation Helps"],
    ])("titleCaseProblem(%s)", (text, fix) => {
        expect(titleCaseProblem(text)).toBe(fix);
    });
});

describe("startsWithVerb", () => {
    const r = { "servicePageContent.keyBenefits[].heading": { startsWithVerb: true } };
    it("warns on a topic with the step number", () => {
        const [i] = one(r, sc({ keyBenefits: [{ heading: "Describe The Damage" }, { heading: "Water Types" }] }));
        expect(i).toMatchObject({ level: "warn", location: "Key benefits #2 › Heading" });
        expect(i.message).toBe("Step #2 reads like a topic, not an action (“Water Types”). Start it with an action word, for example “Check...”, “Call...”, “Turn off...”.");
    });
    it("knows action words", () => {
        expect(startsWithAction("Turn off the water")).toBe(true);
        expect(startsWithAction("Water types")).toBe(false);
    });
});

describe("item counts", () => {
    it("exactItems: add or remove, with the number", () => {
        const r = { "servicePageContent.keyBenefits": { exactItems: 3 } };
        expect(one(r, sc({ keyBenefits: [{ heading: "a" }] }))[0].message).toBe("This block needs exactly 3 items and has 1. Add 2 so there are 3.");
        expect(one(r, sc({ keyBenefits: [1, 2, 3, 4, 5].map((n) => ({ heading: String(n) })) }))[0].message).toBe("This block needs exactly 3 items and has 5. Remove 2 so there are 3.");
        expect(one(r, sc({ keyBenefits: [{}, {}, {}] }))).toEqual([]);
        expect(one(r, sc({})).map((x) => x.message)).toEqual(["This block needs exactly 3 items and has 0. Add 3 so there are 3."]);
    });
    it("minItems and maxItems", () => {
        const r = { "servicePageContent.sections": { minItems: 2, maxItems: 3 } };
        expect(one(r, sc({ sections: [{}] }))[0].message).toBe("This block needs at least 2 items and has 1. Add 1 more.");
        expect(one(r, sc({ sections: [{}, {}, {}, {}, {}] }))[0].message).toBe("This block can have at most 3 items and has 5. Remove 2, or merge them.");
        expect(one(r, sc({ sections: [{}, {}] }))).toEqual([]);
    });
    it("noEmptyItems names the section and hides its inner problems", () => {
        const r = {
            "servicePageContent.sections": { noEmptyItems: ["heading", "content"] },
            "servicePageContent.sections[].heading": { notEmpty: true },
        };
        const out = one(r, sc({ sections: [{ heading: "A", content: "<p>x</p>" }, { heading: "", content: "<p>&nbsp;</p>" }] }));
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ rule: "noEmptyItems", path: "servicePageContent.sections[1]", location: "Article sections #2" });
        expect(out[0].message).toBe("Section #2 is empty: it has no heading and no text. Delete it using the bin icon on the section.");
    });
});

describe("levels, messages, guide links", () => {
    const base = { "servicePageContent.introText": { notEmpty: { level: "warn" as const } } };
    it("a warn rule never blocks", () => {
        const out = one(base, sc({ introText: "" }));
        expect(out[0].level).toBe("warn");
        expect(blocking(out)).toEqual([]);
    });
    it("a custom message replaces the default and fills in the numbers", () => {
        const r = { "servicePageContent.keyBenefits": { exactItems: { value: 3, message: "Need {need}, found {n}." } } };
        expect(one(r, sc({ keyBenefits: [{}] }))[0].message).toBe("Need 3, found 1.");
    });
    it("links to the guide, with the rule's anchor", () => {
        const r: ContentRules = { guide: { label: "Guide", url: "https://example.com/guide" }, fields: { "servicePageContent.introText": { notEmpty: { guideAnchor: "#intro" } } } };
        const [i] = run(r, sc({ introText: "" }));
        expect(i.guide).toEqual({ label: "Guide", url: "https://example.com/guide#intro" });
        expect(i.text).toBe("Intro: This box is empty. Write the text, or remove this section if it is not needed. See: Guide.");
    });
    it("unknown rule keys and paths with no field are ignored at check time", () => {
        expect(one({ "servicePageContent.introText": { bogus: true } as never, "nope.nothing": { notEmpty: true } }, CLEAN_ARTICLE)).toEqual([]);
    });
    it("reads data keyed in any earlier convention", () => {
        const [i] = one({ "servicePageContent.introText": { notEmpty: true } }, { "service page content": { "intro text": "" } });
        expect(i.path).toBe("servicePageContent.introText");
        expect(one({ "servicePageContent.introText": { allow: ["paragraph"] } }, { "service page content": { "intro text": "<ul><li>a</li></ul>" } })).toHaveLength(1);
    });
});

describe("errors map and inline messages", () => {
    it("builds the API's errors shape: one sentence per path, with the location", () => {
        const issues = run(RESOURCES_RULES(), BAD_WATER_DAMAGE);
        const errors = issueErrors(blocking(issues));
        expect(errors["servicePageContent.sections[1].content"]).toBe(
            "Article sections #2 › Content: This paragraph comes after the bullet list. Move it above the list, or into the next section. See: Guide.",
        );
        for (const v of Object.values(errors)) expect(typeof v).toBe("string");
        expect(inlineMessages(issues)["servicePageContent.sections[1].content"]).not.toContain("Article sections");
    });
    it("publishBlockedMessage", () => {
        expect(publishBlockedMessage(1)).toBe("This article can't be published yet. 1 thing needs fixing.");
        expect(publishBlockedMessage(2)).toBe("This article can't be published yet. 2 things need fixing.");
    });
});

describe("existing bad article (water-damage-repair-costs shape)", () => {
    const issues = run(RESOURCES_RULES(), BAD_WATER_DAMAGE);
    const at = (path: string) => issues.filter((i) => i.path === path).map((i) => i.rule);

    it("finds every hard break the audit lists", () => {
        expect(at("servicePageContent.introText")).toEqual(["allow"]); // H1: a list in the intro
        expect(at("servicePageContent.sections[0].content")).toEqual(["allow"]); // H2: h3 sub-questions
        expect(at("servicePageContent.sections[1].content")).toEqual(["listMustBeLast"]); // H3
        expect(at("servicePageContent.sections[2].content")).toEqual(["maxLists"]); // H4 (two lists)
        expect(at("servicePageContent.sections[3]")).toEqual(["noEmptyItems"]); // H5
        expect(at("servicePageContent.keyBenefits")).toEqual(["exactItems"]); // H6: 4 items
    });

    it("finds the warnings and the colon", () => {
        expect(at("servicePageContent.sections[2].heading")).toEqual(["noTrailingColon"]);
        expect(issues.filter((i) => i.level === "warn").map((i) => i.rule)).toContain("startsWithVerb");
        expect(at("servicePageContent.heading")).toEqual(["titleCase"]);
    });

    it("an empty section reports once, not once per empty box", () => {
        expect(issues.filter((i) => i.path.startsWith("servicePageContent.sections[3]"))).toHaveLength(1);
    });

    it("every message names where, with no developer words", () => {
        for (const i of issues) {
            expect(i.location.length).toBeGreaterThan(0);
            expect(i.text).not.toMatch(/\b(node|schema|regex|html|json|path)\b/i);
        }
    });
});

describe("config checks", () => {
    it("rejects unknown rules and paths that match no field, in plain words", () => {
        const problems = configProblems({ fields: { "servicePageContent.introText": { allowEverything: true }, "pageContent.introText": { notEmpty: true } } }, RESOURCES_FIELDS, {});
        expect(problems).toHaveLength(2);
        expect(problems[0]).toContain("“allowEverything” (on “servicePageContent.introText”) is not a known rule");
        expect(problems[1]).toContain("“pageContent.introText” does not match any field");
    });
    it("rejects a config that is not an object", () => {
        expect(configProblems("x", RESOURCES_FIELDS, {})).toHaveLength(1);
        expect(configProblems({}, RESOURCES_FIELDS, {})).toHaveLength(1);
    });
});

describe("isRichEmpty", () => {
    it.each([["", true], ["<p></p>", true], ["<p>&nbsp;</p>", true], ["<p><strong> </strong></p>", true], ["<p>a</p>", false], ["<ul><li>a</li></ul>", false]])("%j", (html, empty) => {
        expect(isRichEmpty(html)).toBe(empty);
    });
});

describe("tidyEntryData", () => {
    it("tidies only when rules are set, and strips colons only where the rule says so", () => {
        const rules: ContentRules = { fields: { "servicePageContent.sections[].heading": { noTrailingColon: true } } };
        const data = sc({ heading: " Overview: ", introText: "<p>Hi  there</p><p>&nbsp;</p>", sections: [{ heading: "  Signs:  ", content: "<p>a&nbsp;b</p>" }] });
        const { data: out, counts } = tidyEntryData(rules, RESOURCES_FIELDS, {}, data);
        expect(out).toEqual(sc({ heading: "Overview:", introText: "<p>Hi there</p>", sections: [{ heading: "Signs", content: "<p>a b</p>" }] }));
        expect(counts.colons).toBe(1);
        expect(tidyEntryData(null, RESOURCES_FIELDS, {}, data).data).toBe(data);
        expect(tidyEntryData({ ...rules, tidy: false }, RESOURCES_FIELDS, {}, data).data).toBe(data);
        expect(data.servicePageContent.heading).toBe(" Overview: "); // input untouched
    });
    it("keeps words exactly", () => {
        const text = (d: Record<string, unknown>) => JSON.stringify(d).replace(/<[^>]*>/g, "").replace(/(?:&nbsp;|\\u00a0|\s|:)+/gi, "");
        const { data: out } = tidyEntryData(RESOURCES_RULES(), RESOURCES_FIELDS, {}, BAD_WATER_DAMAGE as never);
        expect(text(out)).toBe(text(BAD_WATER_DAMAGE as never));
    });
});

describe("more of the audit's hard rules", () => {
    it("maxParagraphs counts real paragraphs only", () => {
        const r = { "servicePageContent.introText": { maxParagraphs: 2 } };
        expect(one(r, sc({ introText: "<p>a</p><p>b</p><p></p>" }))).toEqual([]);
        const [i] = one(r, sc({ introText: "<p>a</p><p>b</p><p>c</p>" }));
        expect(i.message).toBe("This box has 3 paragraphs, and at most 2 are used here. Join them into one, or move the extra text into the next section.");
        expect(one({ "servicePageContent.keyBenefits[].content": { maxParagraphs: 1 } }, sc({ keyBenefits: [{ content: "<p>a</p><p>b</p>" }] }))[0].message).toContain("at most 1 is used here");
    });

    it("noQuestionMark is still available for types that want it (the example seeds do not use it)", () => {
        const r = { "servicePageContent.keyBenefits[].heading": { noQuestionMark: true } };
        const [i] = one(r, sc({ keyBenefits: [{ heading: "Does Mold Add Cost?" }] }));
        expect(i.message).toBe("This heading ends with a question mark (“Does Mold Add Cost?”). Write it as a statement or an action instead, and take the question mark off.");
        expect(one(r, sc({ keyBenefits: [{ heading: "Schedule A Visit" }] }))).toEqual([]);
    });

    it("lastItemIs: the help section must be last, and only last", () => {
        const r = { "servicePageContent.sections": { lastItemIs: ["heading", "How Can We Help?"] } };
        const ok = sc({ sections: [{ heading: "A" }, { heading: "How Can We Help?" }] });
        expect(one(r, ok)).toEqual([]);
        const [missing] = one(r, sc({ sections: [{ heading: "A" }, { heading: "Need Water Damage Restoration Near You?" }] }));
        expect(missing.message).toBe("The last one must be headed “How Can We Help?”, and it is “Need Water Damage Restoration Near You?”. Move it to the end, or change the heading.");
        expect(missing).toMatchObject({ location: "Article sections #2", path: "servicePageContent.sections[1]" });
        const early = one(r, sc({ sections: [{ heading: "How Can We Help?" }, { heading: "B" }] }));
        expect(early.map((i) => i.message)).toEqual([
            "The last one must be headed “How Can We Help?”, and it is “B”. Move it to the end, or change the heading.",
            "“How Can We Help?” can only be the last one. Move it to the end, or change its heading.",
        ]);
    });

    it("uniqueItems: same heading twice, ignoring case and punctuation", () => {
        const r = { "servicePageContent.sections": { uniqueItems: ["heading"] } };
        const [i] = one(r, sc({ sections: [{ heading: "What Affects Cost?" }, { heading: "Other" }, { heading: "what affects cost" }] }));
        expect(i.message).toBe("Two article sections have the same heading (“what affects cost”). Give each one its own heading, or merge them.");
        expect(i.location).toBe("Article sections #3");
    });

    it("maxItems 0 keeps a block empty, with the config's own words", () => {
        const [i] = checkContentRules(RESOURCES_RULES(), RESOURCES_FIELDS, {}, sc({ ...CLEAN_ARTICLE.servicePageContent, howItWorksSteps: [{ heading: "x" }] }));
        expect(i.message).toBe("Resources must not use How it works steps. Delete all of the items in this block.");
    });
});

describe("what tidy leaves alone", () => {
    it("keeps joiners that hold emoji and scripts together", () => {
        const family = "👨‍👩‍👧";
        expect(tidyEntryData({ fields: { "servicePageContent.heading": { notEmpty: true } } }, RESOURCES_FIELDS, {}, sc({ heading: `Hi ${family}` })).data).toEqual(sc({ heading: `Hi ${family}` }));
    });

    it("strips pasted styles only where an allow list says no styling, and keeps the editor's own elsewhere", () => {
        const rules: ContentRules = { fields: { "servicePageContent.introText": { allow: ["paragraph"] } } };
        const styled = '<p style="text-align: center">Hi</p>';
        const out = tidyEntryData(rules, RESOURCES_FIELDS, {}, sc({ introText: styled, sections: [{ heading: "H", content: styled }] })).data as { servicePageContent: { introText: string; sections: { content: string }[] } };
        expect(out.servicePageContent.introText).toBe("<p>Hi</p>");
        expect(out.servicePageContent.sections[0].content).toBe(styled);
    });
});

describe("elements in rich text", () => {
    const el = elementHtml("steps", { title: "Many words here in the title https://x.test <a href=1>", layout: "horizontal", steps: [{ label: "word ".repeat(80), time: "", text: "<a href=\"/x\">link</a>" }] });
    const intro = (html: string, rules: Record<string, unknown>) => one({ "servicePageContent.introText": rules } as ContentRules["fields"], sc({ introText: html }));

    it("word counts and link rules ignore the values in data-values", () => {
        expect(intro(`<p>Just five words in here.</p>${el}`, { maxWords: 6, noLinks: true })).toEqual([]);
    });

    it("an element alone is not an empty box", () => {
        expect(isRichEmpty(el)).toBe(false);
    });

    it("is allowed only where the allow list names it", () => {
        const list = intro(`<p>Hi</p>${el}`, { allow: ["paragraph"] });
        expect(list).toHaveLength(1);
        expect(list[0].message).toMatch(/element/);
        expect(intro(`<p>Hi</p>${el}`, { allow: ["paragraph", "element"] })).toEqual([]);
    });
});
