import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blocking, checkContentRules, configProblems, type ContentRules } from "./content-rules";
import { RESOURCES_SCHEMA, SERVICE_SCHEMA } from "./seed-schemas";

/** The shipped example rule sets, run over sample articles. */
const seed = (name: string): ContentRules => ({ ...JSON.parse(readFileSync(join(__dirname, `fixtures/example-${name}-rules.json`), "utf8")), guide: { label: "Guide", url: "https://example.com/guide" } });
const article = (slug: string) => JSON.parse(readFileSync(join(__dirname, `fixtures/${slug}.json`), "utf8"));
const RES = seed("resources");
const SVC = seed("service");
const resIssues = (slug: string) => checkContentRules(RES, RESOURCES_SCHEMA, {}, article(slug));
const tags = (list: { rule: string; path: string }[]) => list.map((i) => `${i.rule}@${i.path.replace("servicePageContent.", "")}`);

describe("the shipped seeds", () => {
    it("match their content types' field names", () => {
        expect(configProblems(RES, RESOURCES_SCHEMA, {})).toEqual([]);
        expect(configProblems(SVC, SERVICE_SCHEMA, {})).toEqual([]);
    });

    it("do not stop a heading ending with a question mark", () => {
        expect(JSON.stringify(RES)).not.toContain("noQuestionMark");
        expect(JSON.stringify(SVC)).not.toContain("noQuestionMark");
        const a = article("sample-gold-1");
        a.servicePageContent.heading = "Repair Or Replace?";
        a.servicePageContent.keyBenefits[0].heading = "Describe The Problem?";
        a.servicePageContent.sections[0].heading = "What Does It Cost?";
        expect(checkContentRules(RES, RESOURCES_SCHEMA, {}, a).map((i) => i.path)).not.toContain("servicePageContent.heading");
        expect(blocking(checkContentRules(RES, RESOURCES_SCHEMA, {}, a))).toEqual([]);
    });
});

describe("sample resources under the final Resources seed", () => {
    it("sample-hard-breaks is REFUSED, with the audit's hard breaks", () => {
        const hard = blocking(resIssues("sample-hard-breaks"));
        expect(hard.length).toBeGreaterThanOrEqual(10);
        const got = tags(hard);
        for (const expected of [
            "allow@introText", // H1: a list in the intro
            "noLabelParagraphs@introText", // H1: bold label line
            "allow@sections[0].content", // H2: h3 sub-questions
            "listMustBeLast@sections[1].content", // H3
            "listMustBeLast@sections[2].content", // H3
            "lastItemIs@sections[2]", // H9: no help section last
            "maxParagraphs@keyBenefits[0].content", // H7: one paragraph per step
            "startsWith@keyBenefits[1].heading", // H7: step 2 starts with Schedule
            "startsWith@keyBenefits[2].heading", // H7: step 3 starts with Get
            "noLinks@resourceHeroSection.subheadline", // H13
        ]) expect(got).toContain(expected);
        // Every sentence says where, what and what to do, in plain words.
        for (const i of hard) {
            expect(i.location.length).toBeGreaterThan(0);
            expect(i.message).not.toMatch(/\b(node|schema|regex|json)\b/i);
        }
    });

    it("sample-double-faq: only the double FAQ row is a hard break", () => {
        const found = resIssues("sample-double-faq");
        expect(tags(blocking(found))).toEqual(["onlyKeys@faqSection.faqs[0]"]);
        expect(blocking(found)[0].message).toContain("hidden fields");
        expect(tags(found.filter((i) => i.level === "warn"))).toEqual(
            expect.arrayContaining(["noTrailingColon@sections[1].heading", "titleCase@sections[1].heading", "minParagraphs@sections[1].content", "minItems@faqSection.faqs"]),
        );
    });

    it.each(["sample-gold-1", "sample-gold-2", "sample-gold-3", "sample-gold-4", "sample-gold-5", "sample-gold-6"])(
        "gold-style %s passes every hard rule, with only the audit's warnings",
        (slug) => {
            const found = resIssues(slug);
            expect(blocking(found)).toEqual([]);
            for (const i of found) expect(["noTrailingColon", "titleCase"]).toContain(i.rule);
        },
    );

    it("a clean gold-style article passes everything", () => {
        const a = article("sample-gold-1");
        a.servicePageContent.keyBenefits[2].heading = "Get Professional Appliance Repair Service";
        expect(resIssues("sample-gold-1").length).toBe(1);
        expect(checkContentRules(RES, RESOURCES_SCHEMA, {}, a)).toEqual([]);
    });

    it("breaking a gold article one rule at a time is caught", () => {
        const fault = (edit: (a: ReturnType<typeof article>) => void) => {
            const a = article("sample-gold-1");
            a.servicePageContent.keyBenefits[2].heading = "Get Professional Appliance Repair Service";
            edit(a);
            return tags(blocking(checkContentRules(RES, RESOURCES_SCHEMA, {}, a)));
        };
        expect(fault((a) => (a.servicePageContent.introText += "<ul><li>x</li></ul>"))).toContain("allow@introText");
        expect(fault((a) => (a.servicePageContent.sections[0].content += "<p>After the list</p>"))).toContain("listMustBeLast@sections[0].content");
        expect(fault((a) => a.servicePageContent.keyBenefits.pop())).toContain("exactItems@keyBenefits");
        expect(fault((a) => (a.servicePageContent.keyBenefits[1].heading = "Book A Visit"))).toContain("startsWith@keyBenefits[1].heading");
        expect(fault((a) => (a.servicePageContent.howItWorksSteps = [{ heading: "x", content: "<p>y</p>" }]))).toContain("maxItems@howItWorksSteps");
        expect(fault((a) => (a.servicePageContent.sections.at(-1)!.heading = "Contact Us"))).toContain("lastItemIs@sections[3]");
        expect(fault((a) => (a.servicePageContent.sections.at(-1)!.content = "<p>Call a pro today for fast help with this problem.</p>"))).toContain("containsAny@sections[3].content");
        expect(fault((a) => (a.servicePageContent.sections[1].heading = a.servicePageContent.sections[0].heading))).toContain("uniqueItems@sections[1]");
        expect(fault((a) => (a.servicePageContent.heading = a.servicePageContent.sections[0].heading))).toContain("uniqueItems@sections[0]");
        expect(fault((a) => (a.faqSection.faqs[0].Question = "Second pair?"))).toContain("onlyKeys@faqSection.faqs[0]");
        expect(fault((a) => (a.servicePageContent.sections[0].content = a.servicePageContent.sections[0].content.replace("<li>", '<li><a href="/x">').replace("</li>", "</a></li>")))).toContain("noLinks@sections[0].content");
        expect(fault((a) => (a.resourceHeroSection.subheadline = '<p>See <a href="/x">this</a>.</p>'))).toContain("noLinks@resourceHeroSection.subheadline");
        expect(fault((a) => (a.title = ""))).toContain("notEmpty@title");
        expect(fault((a) => (a.resourceHeroSection.headline = ""))).toContain("notEmpty@resourceHeroSection.headline");
        expect(fault((a) => (a.servicePageContent.heading = ""))).toContain("notEmpty@heading");
    });
});

describe("the Service seed", () => {
    const svc = () => article("sample-service");
    const run = (edit?: (a: ReturnType<typeof svc>) => void) => {
        const a = svc();
        edit?.(a);
        return checkContentRules(SVC, SERVICE_SCHEMA, {}, a);
    };
    const hard = (edit?: (a: ReturnType<typeof svc>) => void) => tags(blocking(run(edit)));

    it("passes the sample service page", () => {
        expect(run()).toEqual([]);
    });

    it.each([
        ["no headline", (a: ReturnType<typeof svc>) => (a.heroSection.headline = ""), "notEmpty@heroSection.headline"],
        ["a fourth step", (a: ReturnType<typeof svc>) => a.servicePageContent.howItWorksSteps.push({ heading: "x", content: "<p>y</p>" }), "exactItems@howItWorksSteps"],
        ["a step with no text", (a: ReturnType<typeof svc>) => (a.servicePageContent.howItWorksSteps[1].content = ""), "notEmpty@howItWorksSteps[1].content"],
        ["an empty benefit", (a: ReturnType<typeof svc>) => (a.servicePageContent.keyBenefits[0] = { heading: "", content: "" }), "noEmptyItems@keyBenefits[0]"],
        ["a duplicate section heading", (a: ReturnType<typeof svc>) => (a.servicePageContent.sections[1].heading = a.servicePageContent.sections[0].heading), "uniqueItems@sections[1]"],
        ["text after a list", (a: ReturnType<typeof svc>) => (a.servicePageContent.sections[0].content += "<p>After</p>"), "listMustBeLast@sections[0].content"],
        ["a numbered list", (a: ReturnType<typeof svc>) => (a.servicePageContent.introText += "<ol><li>a</li></ol>"), "noOrderedLists@introText"],
        ["a list inside a list", (a: ReturnType<typeof svc>) => (a.servicePageContent.introText += "<ul><li>a<ul><li>b</li></ul></li></ul>"), "noNestedLists@introText"],
        ["a link in a list item", (a: ReturnType<typeof svc>) => (a.servicePageContent.introText += '<ul><li><a href="/x">a</a></li></ul>'), "noLinks@introText"],
        ["code in a plain text box", (a: ReturnType<typeof svc>) => (a.heroSection.headline = "<b>Appliance Repair</b> {City:Near You}"), "plainText@heroSection.headline"],
        ["an unknown city word", (a: ReturnType<typeof svc>) => (a.title = "Appliance Repair {Town:Near You}"), "cityTokens@title"],
        ["a city token without fallback", (a: ReturnType<typeof svc>) => (a.servicePageContent.heading = "Repair {City}"), "cityTokens@heading"],
        ["a comma in a fallback", (a: ReturnType<typeof svc>) => (a.title = "Repair {City:Dallas, TX}"), "cityTokens@title"],
        ["CityCount outside the subheadline", (a: ReturnType<typeof svc>) => (a.heroSection.headline = "Repair {CityCount} {City:Near You}"), "cityTokens@heroSection.headline"],
        ["an unclosed brace", (a: ReturnType<typeof svc>) => (a.servicePageContent.heading = "Repair {City:Near You"), "cityTokens@heading"],
        ["a token in the hero image alt text", (a: ReturnType<typeof svc>) => (a.heroSection.backgroundImageAlt = "A tech in {City:Dallas}"), "noBraces@heroSection.backgroundImageAlt"],
        ["no FAQs", (a: ReturnType<typeof svc>) => (a.faqSection.faqs = []), "minItems@faqSection.faqs"],
        ["a FAQ row with uppercase keys", (a: ReturnType<typeof svc>) => (a.faqSection.faqs[0].Question = "Q?"), "onlyKeys@faqSection.faqs[0]"],
        ["an FAQ with no answer", (a: ReturnType<typeof svc>) => (a.faqSection.faqs[2].answer = ""), "notEmpty@faqSection.faqs[2].answer"],
        ["no services cards", (a: ReturnType<typeof svc>) => (a.servicesOffered.serviceList = []), "minItems@servicesOffered.serviceList"],
        ["a card with no name", (a: ReturnType<typeof svc>) => (a.servicesOffered.serviceList[0].name = ""), "notEmpty@servicesOffered.serviceList[0].name"],
        ["no hero image", (a: ReturnType<typeof svc>) => (a.heroSection.backgroundImage = ""), "notEmpty@heroSection.backgroundImage"],
        ["a hero image from another host", (a: ReturnType<typeof svc>) => (a.heroSection.backgroundImage = "https://example.com/a.webp"), "startsWith@heroSection.backgroundImage"],
        ["a FAQ image from another host", (a: ReturnType<typeof svc>) => (a.faqSection.images[0].Image = "https://example.com/a.webp"), "startsWith@faqSection.images[0].Image"],
        ["no desktop image", (a: ReturnType<typeof svc>) => (a.servicePageContent.desktopImage.Image = ""), "notEmpty@desktopImage.Image"],
    ])("refuses %s", (_name, edit, expected) => {
        expect(hard(edit)).toContain(expected);
    });

    it("warns, but does not block, on drift from the pattern", () => {
        const found = run((a) => {
            a.heroSection.subheadline = "Serving many cities.";
            a.metaTitle = "Appliance Repair Acme Home {City:Near You}";
            a.servicePageContent.sections.pop();
            a.servicePageContent.sections.pop();
        });
        expect(blocking(found)).toEqual([]);
        expect(tags(found)).toEqual(expect.arrayContaining(["pattern@heroSection.subheadline", "notContains@metaTitle", "minItems@sections"]));
    });
});
