import type { ContentRules, RuleField } from "@flowcms/shared";

// A copy of packages/shared/src/content-rules.fixtures.ts (the API resolves the shared package without subpath exports).

/** The shape of a Resources type, as far as the rules care. */
export const RESOURCES_FIELDS: RuleField[] = [
    { name: "title", type: "Text" },
    {
        name: "servicePageContent",
        label: "Page content",
        type: "Component",
        fields: [
            { name: "heading", label: "Overview heading", type: "Text" },
            { name: "introText", label: "Intro", type: "Rich text", description: "One short paragraph. No lists or headings." },
            {
                name: "sections",
                label: "Article sections",
                type: "Component",
                repeatable: true,
                fields: [
                    { name: "heading", label: "Heading", type: "Text" },
                    { name: "content", label: "Content", type: "Rich text", description: "[H2 heading + P content] The article body." },
                ],
            },
            { name: "howItWorksSteps", label: "How it works steps", type: "Component", repeatable: true, fields: [{ name: "heading", type: "Text" }] },
            {
                name: "keyBenefits",
                label: "Key benefits",
                type: "Component",
                repeatable: true,
                fields: [
                    { name: "heading", label: "Heading", type: "Text" },
                    { name: "content", label: "Content", type: "Rich text" },
                ],
            },
        ],
    },
];

// The seed file is read in the spec; this is the same rule set with the guide filled in.
export const RESOURCES_RULES = (guideUrl = "https://example.com/guide"): ContentRules => ({
    version: 1,
    guide: { label: "Guide", url: guideUrl },
    fields: {
        "servicePageContent.heading": { notEmpty: true, noTrailingColon: true, titleCase: { level: "warn" } },
        "servicePageContent.introText": { allow: ["paragraph", "bold", "italic", "link"], maxParagraphs: 2, notEmpty: true, guideAnchor: "#intro" },
        "servicePageContent.sections": { minItems: 1, noEmptyItems: ["heading", "content"], lastItemIs: ["heading", "How Can We Help?"], uniqueItems: ["heading"] },
        "servicePageContent.sections[].heading": { notEmpty: true, noTrailingColon: true, titleCase: { level: "warn" } },
        "servicePageContent.sections[].content": { allow: ["paragraph", "bulletList", "bold", "italic", "link"], maxLists: 1, listMustBeLast: true, notEmpty: true },
        "servicePageContent.keyBenefits": { exactItems: 3, noEmptyItems: ["heading", "content"] },
        "servicePageContent.keyBenefits[].heading": { noTrailingColon: true, noQuestionMark: true, startsWithVerb: { level: "warn" } },
        "servicePageContent.keyBenefits[].content": { allow: ["paragraph", "bold", "italic", "link"], maxParagraphs: 1 },
        "servicePageContent.howItWorksSteps": { maxItems: { value: 0, message: "Resources must not use How it works steps. Delete all of the items in this block." } },
    },
});

const P = (s: string) => `<p>${s}</p>`;

/** The reference article (cost-to-repair-water-damaged-ceilings): zero findings. */
export const CLEAN_ARTICLE = {
    title: "Cost To Repair Water Damaged Ceilings",
    servicePageContent: {
        heading: "Understanding Ceiling Repair Costs",
        introText: P("Water damage to a ceiling can cost from a few hundred to several thousand dollars, depending on how far it spread."),
        sections: [
            { heading: "What Affects The Cost?", content: P("Size, water type and materials matter most.") + "<ul><li>Size of the area</li><li>Type of water</li><li>Materials</li></ul>" },
            { heading: "How Can We Help?", content: P("Acme Home connects homeowners with trusted local restoration professionals.") },
        ],
        keyBenefits: [
            { heading: "Describe The Damage", content: P("Tell us what happened.") },
            { heading: "Schedule A Visit", content: P("Pick a time that suits you.") },
            { heading: "Get Professional Restoration Service", content: P("A local pro takes it from there.") },
        ],
    },
};

/** Shaped on `water-damage-repair-costs` in the audit: wrong content in the wrong fields. */
export const BAD_WATER_DAMAGE = {
    title: "What Factors affect Water Damage Repair Costs?",
    servicePageContent: {
        heading: "Why Does the Severity of Water Damage affect Repair Costs?",
        introText:
            P("Severity changes the price.") + P("<strong>Professionals typically inspect:</strong>") + "<ul><li>Water source</li><li>Affected materials</li></ul>",
        sections: [
            {
                heading: "Does Emergency Service Cost More?",
                content: P("Often, yes.") + "<h3>Does the Size of the Damaged area Matter?</h3>" + P("Absolutely. Bigger areas cost more.") + "<h3>Do Labor Costs Vary by Location?</h3>" + P("Yes."),
            },
            {
                heading: "How Can You Reduce Water Damage Repair Costs?",
                content: P("You can often reduce repair costs by:") + "<ul><li>Acting fast</li><li>Documenting damage</li></ul>" + P("Quick action often prevents minor damage from becoming a major project."),
            },
            { heading: "Popular Cities:", content: "<ul><li>Austin</li></ul><ul><li>Dallas</li></ul>" },
            { heading: "", content: "" },
        ],
        keyBenefits: [
            { heading: "Does the Type of Water Change the Cost?", content: P("Clean, gray and black water differ.") },
            { heading: "Which Building Materials Cost More to Repair?", content: P("Drywall and wood.") },
            { heading: "How Does Mold affect Water Damage Costs?", content: P("Mold adds cost.") },
            { heading: "A fourth topic", content: "<ul><li>x</li></ul>" },
        ],
    },
};
