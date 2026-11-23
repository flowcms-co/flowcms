import type { RuleField } from "@flowcms/shared";

// A copy of packages/shared/src/seed-schemas.ts (the API resolves the shared package without subpath exports).

const text = (name: string, label?: string): RuleField => ({ name, label, type: "Text" });
const rich = (name: string, label?: string): RuleField => ({ name, label, type: "Rich text" });
const media = (name: string, label?: string): RuleField => ({ name, label, type: "Component", fields: [text("Image"), text("Caption"), text("Alt text", "Alt text")] });
const list = (name: string, label: string, fields: RuleField[]): RuleField => ({ name, label, type: "Component", repeatable: true, fields });
const group = (name: string, label: string, fields: RuleField[]): RuleField => ({ name, label, type: "Component", fields });
const ref = (name: string, label: string, multiple = true): RuleField => ({ name, label, type: "Reference", multiple } as RuleField);

/** A Resources type as the live data is keyed. */
export const RESOURCES_SCHEMA: RuleField[] = [
    text("title", "Title"),
    text("metaTitle", "Meta title"),
    text("metaDescription", "Meta description"),
    text("focusKeyword", "Focus keyword"),
    ref("tags", "Tags"),
    ref("relatedPost", "Related posts"),
    ref("trackdriveCategory", "Trackdrive category", false),
    group("seo", "SEO", [text("shareImage", "Share image"), text("shareImageAlt", "Share image alt")]),
    group("resourceHeroSection", "Hero", [text("headline", "Headline"), rich("subheadline", "Subheadline"), media("backgroundImage", "Background image")]),
    group("servicePageContent", "Page content", [
        text("heading", "Overview heading"),
        rich("introText", "Intro"),
        media("desktopImage", "Desktop image"),
        media("mobileImage", "Mobile image"),
        list("sections", "Article sections", [text("heading", "Heading"), rich("content", "Content"), text("ctaLabel", "CTA label")]),
        list("keyBenefits", "Key benefits", [text("heading", "Heading"), rich("content", "Content")]),
        list("howItWorksSteps", "How it works steps", [text("heading", "Heading"), rich("content", "Content")]),
    ]),
    group("faqSection", "FAQ", [list("faqs", "FAQ", [text("question", "Question"), rich("answer", "Answer")])]),
];

/** A Service type, from the renderer's field map and the appliance-repair backup. */
export const SERVICE_SCHEMA: RuleField[] = [
    text("title", "Title"),
    text("metaTitle", "Meta title"),
    text("metaDescription", "Meta description"),
    text("focusKeyword", "Focus keyword"),
    ref("trackdriveCategory", "Trackdrive category", false),
    ref("guides", "Guides"),
    group("seo", "SEO", [text("shareImage", "Share image"), text("shareImageAlt", "Share image alt")]),
    group("heroSection", "Hero", [text("headline", "Headline"), text("subheadline", "Subheadline"), rich("ctaLabel", "CTA label"), text("backgroundImage", "Background image"), text("backgroundImageAlt", "Background image alt")]),
    group("servicePageContent", "Page content", [
        text("heading", "Heading"),
        rich("introText", "Intro"),
        media("desktopImage", "Desktop image"),
        media("mobileImage", "Mobile image"),
        list("keyBenefits", "Key benefits", [text("heading", "Heading"), rich("content", "Content")]),
        list("sections", "Sections", [text("heading", "Heading"), rich("content", "Content"), text("ctaLabel", "CTA label")]),
        list("howItWorksSteps", "How it works steps", [text("heading", "Heading"), rich("content", "Content")]),
        text("bottomCtaText", "Bottom CTA text"),
    ]),
    group("servicesOffered", "Services offered", [text("heading", "Heading"), text("text", "Intro line"), list("serviceList", "Services", [text("name", "Name"), text("icon", "Icon"), text("description", "Description"), text("link", "Link")])]),
    group("faqSection", "FAQ", [list("faqs", "FAQ", [text("question", "Question"), rich("answer", "Answer")]), list("images", "FAQ images", [text("Image"), text("Caption"), text("Alt text")])]),
];
