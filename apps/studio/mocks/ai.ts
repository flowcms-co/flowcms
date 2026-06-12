/**
 * AI Tools mock data, themed to the "Northbound" studio. The UIs are wired and
 * interactive; the actual model calls are connected later in the project.
 */

/* ---------- Content Generator ---------- */
export const aiUsage = {
    generations: 128,
    generationsCap: 200,
    words: 84200,
    credits: 64,
    creditsCap: 100,
};

export type GenTemplate = {
    id: string;
    title: string;
    desc: string;
    icon: string;
    color: string;
};

export const genTemplates: GenTemplate[] = [
    { id: "blog", title: "Blog post", desc: "Long-form article from a topic", icon: "document", color: "#6C5CE7" },
    { id: "outline", title: "Outline", desc: "Structured heading outline", icon: "grid", color: "#3B82F6" },
    { id: "meta", title: "Meta description", desc: "SEO snippet under 160 chars", icon: "chart", color: "#00B894" },
    { id: "social", title: "Social post", desc: "Hook + caption for socials", icon: "chat", color: "#F5A623" },
    { id: "landing", title: "Landing copy", desc: "Benefit-led section copy", icon: "bag", color: "#E91E63" },
    { id: "email", title: "Email", desc: "Newsletter or outreach draft", icon: "mail", color: "#A29BFE" },
];

export const genTones = ["Professional", "Friendly", "Confident", "Playful", "Authoritative"];
export const genLengths = ["Short", "Medium", "Long"];

export const recentGenerations = [
    { id: "r1", title: "Pricing creative work: charge for value, not hours", type: "Blog post", time: "2h ago", words: 1840 },
    { id: "r2", title: "Lumen — homepage hero copy", type: "Landing copy", time: "5h ago", words: 120 },
    { id: "r3", title: "Brand identity — meta description", type: "Meta description", time: "Yesterday", words: 28 },
    { id: "r4", title: "Webinar invite email", type: "Email", time: "Yesterday", words: 320 },
];

/* ---------- Plagiarism ---------- */
export const plagiarism = {
    originality: 96,
    checked: "Your rebrand should start with positioning, not a logo",
    matches: [
        { id: "p1", source: "smashingmagazine.com/branding-basics", percent: 2.1, snippet: "A strong brand starts with a clear position in the market…" },
        { id: "p2", source: "medium.com/@studio/rebrand-guide", percent: 1.3, snippet: "before you redesign the logo, define what you stand for…" },
        { id: "p3", source: "nngroup.com/articles/brand-experience", percent: 0.9, snippet: "consistency across touchpoints builds trust over time…" },
    ],
};

/* ---------- Grammar ---------- */
export type GrammarIssue = {
    id: string;
    type: "Spelling" | "Grammar" | "Style" | "Clarity";
    text: string;
    suggestion: string;
};
export const grammarScore = 88;
export const grammarIssues: GrammarIssue[] = [
    { id: "g1", type: "Grammar", text: "the team are working", suggestion: "the team is working" },
    { id: "g2", type: "Spelling", text: "occured", suggestion: "occurred" },
    { id: "g3", type: "Style", text: "in order to convert", suggestion: "to convert" },
    { id: "g4", type: "Clarity", text: "It is important to note that positioning…", suggestion: "Positioning…" },
    { id: "g5", type: "Style", text: "very unique", suggestion: "unique" },
];

/* ---------- Link Suggestions ---------- */
export type LinkSuggestion = {
    id: string;
    anchor: string;
    target: string;
    relevance: number;
};
export const linkSourcePage = "/blog/landing-page-that-converts";
export const linkSuggestions: LinkSuggestion[] = [
    { id: "l1", anchor: "brand positioning", target: "/blog/rebrand-starts-with-positioning", relevance: 94 },
    { id: "l2", anchor: "design systems", target: "/blog/design-systems-when-you-need-one", relevance: 81 },
    { id: "l3", anchor: "brand voice", target: "/blog/finding-your-brand-voice", relevance: 76 },
    { id: "l4", anchor: "free brand audit", target: "/free-brand-audit", relevance: 64 },
    { id: "l5", anchor: "our work", target: "/work", relevance: 58 },
];

/* ---------- Refresh Queue ---------- */
export type RefreshItem = {
    id: string;
    title: string;
    path: string;
    lastUpdated: string;
    trafficDelta: number;
    reason: string;
};
export const refreshItems: RefreshItem[] = [
    { id: "rf1", title: "What we learned shipping 14 websites in 2025", path: "/blog/14-websites-2025", lastUpdated: "8 months ago", trafficDelta: -38, reason: "Traffic down 38% · examples now dated" },
    { id: "rf2", title: "Services", path: "/services", lastUpdated: "5 months ago", trafficDelta: -22, reason: "Rankings slipped to page 2" },
    { id: "rf3", title: "Our work", path: "/work", lastUpdated: "11 months ago", trafficDelta: -15, reason: "Stale — 3 new projects missing" },
    { id: "rf4", title: "A practical guide to finding your brand voice", path: "/blog/finding-your-brand-voice", lastUpdated: "1 year ago", trafficDelta: -9, reason: "Thin sections · low dwell time" },
];
