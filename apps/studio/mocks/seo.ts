/**
 * SEO suite mock data — stands in for Google Search Console + GA4 + crawler +
 * AI-visibility integrations. Backend wires the real APIs later.
 */

/* ---------------- Dashboard / performance (GSC + GA4) ---------------- */
export type SeoKpi = {
    key: string;
    label: string;
    value: string;
    delta: string;
    dir: "up" | "down";
    goodWhenUp: boolean;
    icon: string;
    color: string;
    /** progress-bar fill % for the vibrant metric tile. */
    bar: number;
    /** 6-point series for the sparkline on the KPI tile. */
    spark: number[];
};

export const seoKpis: SeoKpi[] = [
    { key: "clicks", label: "Organic clicks", value: "48.2K", delta: "12.4%", dir: "up", goodWhenUp: true, icon: "compass", color: "#6C5CE7", bar: 78, spark: [31, 35, 38, 41, 46, 52] },
    { key: "impr", label: "Impressions", value: "1.24M", delta: "8.1%", dir: "up", goodWhenUp: true, icon: "eye", color: "#3B82F6", bar: 64, spark: [0.92, 1.0, 1.06, 1.11, 1.18, 1.24] },
    { key: "ctr", label: "Avg. CTR", value: "3.9%", delta: "0.4%", dir: "up", goodWhenUp: true, icon: "chart", color: "#00B894", bar: 52, spark: [3.2, 3.4, 3.5, 3.6, 3.8, 3.9] },
    { key: "pos", label: "Avg. position", value: "14.3", delta: "2.1", dir: "down", goodWhenUp: false, icon: "overview", color: "#F5A623", bar: 60, spark: [16.4, 15.9, 15.1, 14.9, 14.6, 14.3] },
    { key: "bounce", label: "Bounce rate", value: "42%", delta: "3%", dir: "down", goodWhenUp: false, icon: "logout", color: "#E24B4A", bar: 42, spark: [48, 46, 45, 44, 43, 42] },
];

/** Traffic-source breakdown for the donut. */
export const trafficSources = [
    { label: "Organic search", value: 48200, color: "#6C5CE7" },
    { label: "Direct", value: 18400, color: "#3B82F6" },
    { label: "AI assistants", value: 13700, color: "#00B894" },
    { label: "Referral", value: 9200, color: "#F5A623" },
    { label: "Social", value: 6100, color: "#FFA2C0" },
];

/** Clicks vs impressions trend (for the area/line chart). */
export const seoTrend = [
    { x: "Dec", cur: 31, prev: 24 },
    { x: "Jan", cur: 35, prev: 27 },
    { x: "Feb", cur: 38, prev: 33 },
    { x: "Mar", cur: 41, prev: 36 },
    { x: "Apr", cur: 46, prev: 39 },
    { x: "May", cur: 52, prev: 42 },
];

export const seoHealth = 82;

/** Sample for the unified FlowCMS SEO Score (Visibility 40% + Technical 35% + Speed 25%). */
export const seoScoreSample = {
    score: 82,
    pillars: [
        { key: "visibility", label: "Visibility", source: "Search Console", weight: 40, score: 86, live: false },
        { key: "technical", label: "Technical", source: "Site crawl", weight: 35, score: 80, live: false },
        { key: "speed", label: "Speed", source: "Core Web Vitals", weight: 25, score: 78, live: false },
    ],
};

/** Sample 30-day movement of the FlowCMS SEO Score (no live history endpoint yet). */
export const seoScorePointsDelta = 12;

/** Sample for the dashboard's Issues Snapshot card — mirrors the grouped issue
 *  counts the AI Optimizer surfaces; keys map to the live audit categories. */
export const seoIssuesSnapshotSample = {
    total: 136,
    aiFixable: 36,
    categories: [
        { key: "metadata", label: "Meta issues", count: 18 },
        { key: "schema", label: "Schema opportunities", count: 14 },
        { key: "links", label: "Internal linking issues", count: 9 },
        { key: "performance", label: "Performance issues", count: 4 },
        { key: "cannibalization", label: "Cannibalization issues", count: 2 },
    ],
};

/** Sample AI Search & Answer Engines summary. Live values come from GA4 AI-referral
 *  (sessions) and the AEO probe (share of voice + queries cited across engines). */
export const aiSearchSample = {
    sessions: 1842,
    sessionsDelta: 34,
    visibility: 31, // share of voice %
    visibilityDelta: 6,
    queriesCited: 24,
    queriesCitedDelta: 4,
    queriesTracked: 32,
};

/** Per-platform AI-referral traffic for the "Traffic by platform" list. */
export const aiPlatformTraffic = [
    { name: "ChatGPT", sessions: 1142, change: 62, color: "#6C5CE7" },
    { name: "Perplexity", sessions: 386, change: 21, color: "#3B82F6" },
    { name: "Gemini", sessions: 203, change: 11, color: "#00B894" },
    { name: "Claude", sessions: 111, change: 6, color: "#E91E63" },
    { name: "Copilot", sessions: 10, change: null, color: "#F5A623" },
];

/** Sample Backlinks Overview (no backlink-provider integration ships yet). */
export const backlinksSample = {
    referringDomains: { value: 512, delta: 11.2 },
    newDomains: { value: 42, delta: 3 },
    totalBacklinks: { value: 2400, delta: 15.3 },
    topReferring: [
        { domain: "behance.net", backlinks: 1240, color: "#1769FF" },
        { domain: "dribbble.com", backlinks: 890, color: "#EA4C89" },
        { domain: "medium.com", backlinks: 456, color: "#64748B" },
        { domain: "linkedin.com", backlinks: 320, color: "#0A66C2" },
        { domain: "wordpress.org", backlinks: 210, color: "#3858E9" },
    ],
};

/** Site-health checks shown as colored progress rings (Unity "Icon Progress"). */
export const siteChecks = [
    { id: "idx", label: "Indexing", sub: "1,184 of 1,242 pages", value: 92, color: "#00B894", icon: "search" },
    { id: "cwv", label: "Core Web Vitals", sub: "2 of 3 passing", value: 71, color: "#F5A623", icon: "chart" },
    { id: "mob", label: "Mobile usability", sub: "No issues found", value: 96, color: "#3B82F6", icon: "overview" },
    { id: "sd", label: "Structured data", sub: "5 types deployed", value: 84, color: "#6C5CE7", icon: "document" },
];

/* ---------------- Keywords ---------------- */
export type KeywordIntent = "Informational" | "Commercial" | "Transactional" | "Navigational";

export type Keyword = {
    id: string;
    term: string;
    clicks: number;
    impressions: number;
    position: number;
    ctr: number;
    delta: number; // position change (+ improved, - dropped)
    intent: KeywordIntent;
    page: string;
};

export const keywords: Keyword[] = [
    { id: "k1", term: "brand strategy agency", clicks: 4120, impressions: 98400, position: 3.2, ctr: 4.2, delta: 1.4, intent: "Commercial", page: "/services" },
    { id: "k2", term: "web design studio", clicks: 2880, impressions: 74200, position: 5.1, ctr: 3.9, delta: -0.8, intent: "Commercial", page: "/work" },
    { id: "k3", term: "how to rebrand a company", clicks: 2210, impressions: 51000, position: 2.4, ctr: 4.3, delta: 0.6, intent: "Informational", page: "/blog/rebrand-starts-with-positioning" },
    { id: "k4", term: "landing page best practices", clicks: 1760, impressions: 42300, position: 7.8, ctr: 4.2, delta: 2.1, intent: "Informational", page: "/blog/landing-page-that-converts" },
    { id: "k5", term: "design agency pricing", clicks: 1340, impressions: 38800, position: 9.6, ctr: 3.5, delta: -1.2, intent: "Transactional", page: "/services" },
    { id: "k6", term: "what is a design system", clicks: 980, impressions: 27600, position: 6.3, ctr: 3.6, delta: 0.9, intent: "Informational", page: "/blog/design-systems-when-you-need-one" },
    { id: "k7", term: "b2b seo agency", clicks: 870, impressions: 31200, position: 12.4, ctr: 2.8, delta: 3.4, intent: "Commercial", page: "/services" },
    { id: "k8", term: "brand identity for startups", clicks: 640, impressions: 22900, position: 11.1, ctr: 2.8, delta: -0.4, intent: "Informational", page: "/blog/brand-identity-early-stage-startups" },
    { id: "k9", term: "how to find your brand voice", clicks: 520, impressions: 19400, position: 8.9, ctr: 2.7, delta: 1.7, intent: "Informational", page: "/blog/finding-your-brand-voice" },
    { id: "k10", term: "free brand audit", clicks: 410, impressions: 16800, position: 14.2, ctr: 2.4, delta: 0.3, intent: "Transactional", page: "/free-brand-audit" },
];

/** Ranking distribution buckets. */
export const positionBuckets = [
    { label: "1–3", count: 38, color: "#00B894" },
    { label: "4–10", count: 64, color: "#6C5CE7" },
    { label: "11–20", count: 52, color: "#3B82F6" },
    { label: "21–50", count: 47, color: "#F5A623" },
    { label: "50+", count: 29, color: "#E24B4A" },
];

export const topPages = [
    { path: "/services", clicks: 9240, impressions: 218000, position: 3.4 },
    { path: "/work", clicks: 4180, impressions: 96000, position: 7.2 },
    { path: "/blog/rebrand-starts-with-positioning", clicks: 3110, impressions: 88400, position: 9.1 },
    { path: "/blog/landing-page-that-converts", clicks: 2670, impressions: 61200, position: 6.0 },
    { path: "/free-brand-audit", clicks: 1990, impressions: 54300, position: 11.3 },
];

export type PageType = "Services" | "Blog" | "Resources" | "Landing Page";

export type TopPageRich = {
    id: string;
    path: string;
    pageType: PageType;
    sessions: number;
    sessionsDelta: number;
    clicks: number;
    clicksDelta: number;
    impressions: number;
    impressionsDelta: number;
    ctr: number;
    ctrDelta: number;
    /** Positive = rank improved (position number decreased). */
    position: number;
    positionDelta: number;
    spark: number[];
    healthScore: number;
};

export const topPagesRich: TopPageRich[] = [
    { id: "tp1", path: "/services", pageType: "Services", sessions: 12460, sessionsDelta: 18, clicks: 9240, clicksDelta: 16, impressions: 124000, impressionsDelta: 14, ctr: 7.4, ctrDelta: 2.1, position: 3.4, positionDelta: 0.6, spark: [9200, 9800, 10400, 11200, 11800, 12000, 12200, 12460], healthScore: 92 },
    { id: "tp2", path: "/work", pageType: "Services", sessions: 5620, sessionsDelta: 12, clicks: 4180, clicksDelta: 11, impressions: 82400, impressionsDelta: 9, ctr: 5.1, ctrDelta: 0.8, position: 7.2, positionDelta: 1.1, spark: [4800, 5000, 5100, 5200, 5400, 5500, 5580, 5620], healthScore: 84 },
    { id: "tp3", path: "/blog/rebrand-starts-with-positioning", pageType: "Blog", sessions: 4210, sessionsDelta: -5, clicks: 3110, clicksDelta: -3, impressions: 61200, impressionsDelta: -2, ctr: 5.0, ctrDelta: -0.2, position: 9.1, positionDelta: -0.4, spark: [4600, 4500, 4400, 4350, 4300, 4280, 4220, 4210], healthScore: 78 },
    { id: "tp4", path: "/pricing", pageType: "Landing Page", sessions: 3120, sessionsDelta: 22, clicks: 2460, clicksDelta: 19, impressions: 45800, impressionsDelta: 17, ctr: 6.8, ctrDelta: 0.9, position: 6.3, positionDelta: 0.7, spark: [2400, 2520, 2620, 2720, 2820, 2920, 3020, 3120], healthScore: 76 },
    { id: "tp5", path: "/blog/headless-cms-guide", pageType: "Blog", sessions: 2840, sessionsDelta: 8, clicks: 2140, clicksDelta: 6, impressions: 38900, impressionsDelta: 5, ctr: 7.3, ctrDelta: 0.6, position: 8.7, positionDelta: 0.3, spark: [2560, 2620, 2680, 2720, 2760, 2800, 2820, 2840], healthScore: 72 },
    { id: "tp6", path: "/about", pageType: "Services", sessions: 1640, sessionsDelta: -2, clicks: 1280, clicksDelta: -4, impressions: 21300, impressionsDelta: -3, ctr: 7.7, ctrDelta: -0.1, position: 11.2, positionDelta: -0.6, spark: [1700, 1680, 1670, 1660, 1650, 1645, 1642, 1640], healthScore: 58 },
    { id: "tp7", path: "/resources", pageType: "Resources", sessions: 1250, sessionsDelta: 16, clicks: 960, clicksDelta: 14, impressions: 17800, impressionsDelta: 10, ctr: 7.0, ctrDelta: 0.4, position: 10.4, positionDelta: 0.9, spark: [960, 1000, 1040, 1080, 1120, 1180, 1220, 1250], healthScore: 82 },
    { id: "tp8", path: "/contact", pageType: "Landing Page", sessions: 820, sessionsDelta: 5, clicks: 640, clicksDelta: 3, impressions: 12400, impressionsDelta: -1, ctr: 6.6, ctrDelta: 0.2, position: 13.7, positionDelta: 0.2, spark: [760, 770, 780, 790, 800, 808, 814, 820], healthScore: 60 },
    { id: "tp9", path: "/blog/seo-checklist", pageType: "Blog", sessions: 770, sessionsDelta: 7, clicks: 570, clicksDelta: 5, impressions: 11600, impressionsDelta: 6, ctr: 6.6, ctrDelta: -0.1, position: 12.6, positionDelta: 0.1, spark: [700, 718, 728, 738, 748, 756, 762, 770], healthScore: 68 },
    { id: "tp10", path: "/free-brand-audit", pageType: "Landing Page", sessions: 610, sessionsDelta: 28, clicks: 480, clicksDelta: 25, impressions: 9400, impressionsDelta: 20, ctr: 6.5, ctrDelta: 0.3, position: 8.9, positionDelta: 0.5, spark: [420, 450, 480, 510, 540, 562, 584, 610], healthScore: 85 },
];

export const topPageKpis = {
    pagesWithTraffic: { value: 142, delta: 18, spark: [110, 118, 122, 126, 130, 134, 138, 142] },
    organicSessions: { value: 124800, delta: 24, spark: [90000, 96000, 102000, 108000, 112000, 116000, 120000, 124800] },
    impressions: { value: 1240000, delta: 15, spark: [920000, 980000, 1040000, 1100000, 1160000, 1200000, 1220000, 1240000] },
    avgCtr: { value: 3.9, delta: 0.6, spark: [3.1, 3.3, 3.5, 3.6, 3.7, 3.8, 3.85, 3.9] },
};

/* ---------------- Technical Auditor + Search Console ---------------- */
export type AuditSeverity = "critical" | "warning" | "notice";

export type AuditIssue = {
    id: string;
    title: string;
    severity: AuditSeverity;
    pages: number;
    fixable: boolean;
};

export type AuditCategory = {
    id: string;
    name: string;
    icon: string;
    score: number;
    issues: AuditIssue[];
};

export const auditScore = 78;
export const auditCrawled = 1242;

export const auditCategories: AuditCategory[] = [
    {
        id: "crawl",
        name: "Crawlability & Indexing",
        icon: "search",
        score: 86,
        issues: [
            { id: "a1", title: "Pages blocked by robots.txt", severity: "warning", pages: 4, fixable: true },
            { id: "a2", title: "Missing canonical tag", severity: "warning", pages: 12, fixable: true },
            { id: "a3", title: "Redirect chains (3+ hops)", severity: "notice", pages: 6, fixable: true },
        ],
    },
    {
        id: "performance",
        name: "Performance & Core Web Vitals",
        icon: "chart",
        score: 71,
        issues: [
            { id: "a4", title: "LCP above 2.5s on key templates", severity: "critical", pages: 9, fixable: false },
            { id: "a5", title: "Render-blocking resources", severity: "warning", pages: 23, fixable: true },
            { id: "a6", title: "Images without explicit dimensions", severity: "notice", pages: 41, fixable: true },
        ],
    },
    {
        id: "onpage",
        name: "On-page & Content",
        icon: "document",
        score: 74,
        issues: [
            { id: "a7", title: "Missing meta descriptions", severity: "warning", pages: 8, fixable: true },
            { id: "a8", title: "Thin content (< 300 words)", severity: "warning", pages: 5, fixable: false },
            { id: "a9", title: "Duplicate title tags", severity: "critical", pages: 3, fixable: true },
            { id: "a10", title: "Missing H1", severity: "notice", pages: 7, fixable: true },
        ],
    },
    {
        id: "links",
        name: "Links & Structure",
        icon: "compass",
        score: 80,
        issues: [
            { id: "a11", title: "Broken internal links (404)", severity: "critical", pages: 6, fixable: true },
            { id: "a12", title: "Orphan pages (no internal links)", severity: "warning", pages: 14, fixable: false },
            { id: "a13", title: "Images missing alt text", severity: "notice", pages: 23, fixable: true },
        ],
    },
];

/** Core Web Vitals (field data). */
export const coreWebVitals = [
    { metric: "LCP", value: "2.8s", target: "< 2.5s", status: "warning" as const },
    { metric: "INP", value: "180ms", target: "< 200ms", status: "good" as const },
    { metric: "CLS", value: "0.06", target: "< 0.1", status: "good" as const },
];

/** Google Search Console coverage / errors. */
export const gscErrors = [
    { id: "g1", type: "Server error (5xx)", count: 2, status: "error" as const },
    { id: "g2", type: "Submitted URL not found (404)", count: 6, status: "error" as const },
    { id: "g3", type: "Crawled — currently not indexed", count: 31, status: "warning" as const },
    { id: "g4", type: "Discovered — currently not indexed", count: 18, status: "warning" as const },
    { id: "g5", type: "Valid (indexed)", count: 1184, status: "good" as const },
];

/* ---------------- AEO / GEO — AI & LLM visibility ---------------- */
export type AiEngine = {
    id: string;
    name: string;
    color: string;
    /** number of prompts where we're cited. */
    citations: number;
    /** share of voice % vs competitors. */
    share: number;
    /** monthly referral sessions. */
    traffic: number;
    delta: number;
};

export const aiEngines: AiEngine[] = [
    { id: "chatgpt", name: "ChatGPT", color: "#00A67E", citations: 142, share: 31, traffic: 4820, delta: 18 },
    { id: "perplexity", name: "Perplexity", color: "#20808D", citations: 98, share: 24, traffic: 2960, delta: 26 },
    { id: "gemini", name: "Google Gemini", color: "#4285F4", citations: 76, share: 19, traffic: 1740, delta: 9 },
    { id: "aio", name: "Google AI Overviews", color: "#6C5CE7", citations: 61, share: 15, traffic: 3310, delta: 12 },
    { id: "copilot", name: "Copilot", color: "#E24B4A", citations: 33, share: 11, traffic: 880, delta: -4 },
];

export const aiTrafficTrend = [
    { x: "Dec", cur: 6.2, prev: 3.1 },
    { x: "Jan", cur: 7.8, prev: 4.0 },
    { x: "Feb", cur: 9.1, prev: 5.2 },
    { x: "Mar", cur: 10.4, prev: 6.1 },
    { x: "Apr", cur: 12.0, prev: 7.4 },
    { x: "May", cur: 13.7, prev: 8.9 },
];

export type AeoCheck = { id: string; label: string; ok: boolean; hint: string };

export const aeoChecks: AeoCheck[] = [
    { id: "c1", label: "FAQ / Q&A schema present", ok: true, hint: "42 pages with FAQPage" },
    { id: "c2", label: "Concise answer in first 100 words", ok: true, hint: "On 78% of articles" },
    { id: "c3", label: "Entity & author markup (E-E-A-T)", ok: false, hint: "Author schema missing on 19 pages" },
    { id: "c4", label: "llms.txt published", ok: false, hint: "Not found at /llms.txt" },
    { id: "c5", label: "Structured comparison tables", ok: true, hint: "Detected on 14 pages" },
    { id: "c6", label: "Citable statistics & sources", ok: true, hint: "Strong on cornerstone content" },
    { id: "c7", label: "Crawlable by AI bots (GPTBot, PerplexityBot)", ok: true, hint: "Allowed in robots.txt" },
];

/** Prompts we're tracking for AI citation. */
export const aiPrompts = [
    { id: "p1", prompt: "best brand strategy agency for startups", cited: true, engines: ["chatgpt", "perplexity", "aio"], position: 1 },
    { id: "p2", prompt: "how to rebrand a company", cited: true, engines: ["chatgpt", "gemini"], position: 2 },
    { id: "p3", prompt: "design agency pricing comparison", cited: false, engines: [], position: null },
    { id: "p4", prompt: "what makes a landing page convert", cited: true, engines: ["perplexity", "aio", "copilot"], position: 1 },
    { id: "p5", prompt: "best web design studios", cited: false, engines: [], position: null },
];

/* ---------------- Meta + Schema ---------------- */
export type MetaRow = {
    id: string;
    path: string;
    title: string;
    titleLen: number;
    descLen: number;
    schema: string;
    issues: string[];
};

export const metaRows: MetaRow[] = [
    { id: "m1", path: "/blog/rebrand-starts-with-positioning", title: "Your rebrand should start with positioning, not a logo", titleLen: 53, descLen: 148, schema: "BlogPosting", issues: [] },
    { id: "m2", path: "/blog/landing-page-that-converts", title: "The anatomy of a landing page that converts", titleLen: 43, descLen: 0, schema: "BlogPosting", issues: ["No meta description"] },
    { id: "m3", path: "/services", title: "Services", titleLen: 8, descLen: 92, schema: "—", issues: ["Title too short", "No schema"] },
    { id: "m4", path: "/work", title: "Our work — brand, web & growth case studies from Northbound", titleLen: 64, descLen: 173, schema: "WebPage", issues: ["Title too long", "Description too long"] },
    { id: "m5", path: "/free-brand-audit", title: "Free brand audit", titleLen: 16, descLen: 151, schema: "WebPage", issues: [] },
    { id: "m6", path: "/work/orbit", title: "Orbit — a design system that scaled with the team", titleLen: 49, descLen: 0, schema: "—", issues: ["No meta description", "No schema"] },
];

/* ---------------- JSON-LD ---------------- */
export type JsonLdRow = {
    id: string;
    path: string;
    type: string;
    valid: boolean;
    richResult: boolean;
};

export const jsonLdRows: JsonLdRow[] = [
    { id: "j1", path: "/blog/rebrand-starts-with-positioning", type: "BlogPosting + FAQPage", valid: true, richResult: true },
    { id: "j2", path: "/blog/landing-page-that-converts", type: "BlogPosting", valid: true, richResult: false },
    { id: "j3", path: "/services", type: "Service + Offer", valid: false, richResult: false },
    { id: "j4", path: "/work", type: "WebPage", valid: true, richResult: false },
    { id: "j5", path: "/", type: "Organization + WebSite", valid: true, richResult: true },
];

export const jsonLdSample = `{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "Your rebrand should start with positioning, not a logo",
  "author": { "@type": "Person", "name": "Sarah Whitfield" },
  "datePublished": "2026-05-27",
  "publisher": {
    "@type": "Organization",
    "name": "Northbound",
    "logo": "https://wearenorthbound.com/logo.png"
  }
}`;

/* ---------------- Topical Clusters ---------------- */
export type Cluster = {
    id: string;
    pillar: string;
    pages: number;
    coverage: number;
    clicks: number;
    supporting: { title: string; status: "live" | "gap" | "draft" }[];
};

export const seoClusters: Cluster[] = [
    {
        id: "cl1",
        pillar: "Branding",
        pages: 12,
        coverage: 84,
        clicks: 11200,
        supporting: [
            { title: "Your rebrand should start with positioning", status: "live" },
            { title: "Brand identity for early-stage startups", status: "live" },
            { title: "A practical guide to finding your brand voice", status: "live" },
            { title: "Naming a company: a field guide", status: "draft" },
        ],
    },
    {
        id: "cl2",
        pillar: "Web design",
        pages: 9,
        coverage: 66,
        clicks: 5400,
        supporting: [
            { title: "The anatomy of a landing page that converts", status: "live" },
            { title: "The case for fewer, better web pages", status: "draft" },
            { title: "Motion that adds meaning", status: "gap" },
        ],
    },
    {
        id: "cl3",
        pillar: "Design systems",
        pages: 7,
        coverage: 52,
        clicks: 3100,
        supporting: [
            { title: "Design systems: when you actually need one", status: "live" },
            { title: "Tokens, components & docs", status: "gap" },
            { title: "Scaling a system across teams", status: "gap" },
        ],
    },
    {
        id: "cl4",
        pillar: "Growth & SEO",
        pages: 5,
        coverage: 72,
        clicks: 2200,
        supporting: [
            { title: "B2B SEO: content that earns its rankings", status: "live" },
            { title: "Content refreshes: the highest-ROI SEO work", status: "draft" },
        ],
    },
];

/* ---------------- Cannibalization ---------------- */
export type CannibalGroup = {
    id: string;
    keyword: string;
    severity: "high" | "medium";
    pages: { path: string; position: number; clicks: number }[];
    recommendation: string;
};

export const cannibalGroups: CannibalGroup[] = [
    {
        id: "cb1",
        keyword: "brand strategy agency",
        severity: "high",
        pages: [
            { path: "/services", position: 5.1, clicks: 2880 },
            { path: "/blog/rebrand-starts-with-positioning", position: 8.4, clicks: 610 },
            { path: "/about", position: 14.2, clicks: 180 },
        ],
        recommendation: "Consolidate into /services; 301 the weaker URLs and add internal links.",
    },
    {
        id: "cb2",
        keyword: "web design studio",
        severity: "medium",
        pages: [
            { path: "/work", position: 9.6, clicks: 1340 },
            { path: "/services", position: 12.1, clicks: 220 },
        ],
        recommendation: "Differentiate intent — keep /work portfolio-led, make /services the commercial page.",
    },
];

/* ---------------- Backlinks Report ---------------- */
export type BacklinkLinkType = "Dofollow" | "Nofollow" | "UGC" | "Sponsored";

export type BacklinkRow = {
    id: string;
    color: string;
    pageTitle: string;
    domainName: string;
    domainRating: number;
    linkType: BacklinkLinkType;
    backlinkUrl: string;
    targetPath: string;
    targetLabel: string;
    anchorText: string;
    firstSeen: string;
    lastSeen: string;
    firstSeenTs: number;
    lastSeenTs: number;
    positionDelta: number | null;
};

export const backlinkRows: BacklinkRow[] = [
    { id: "bl1", color: "#6C5CE7", pageTitle: "FlowCMS: The Headless CMS for Modern Websites", domainName: "flowcms.com/blog/headless-cms", domainRating: 78, linkType: "Dofollow", backlinkUrl: "https://flowcms.com/blog/headless-cms", targetPath: "/", targetLabel: "Homepage", anchorText: "FlowCMS", firstSeen: "Apr 12, 2024", lastSeen: "May 1, 2024", firstSeenTs: 20240412, lastSeenTs: 20240501, positionDelta: 2 },
    { id: "bl2", color: "#F5A623", pageTitle: "10 Best Headless CMS Platforms to Consider in 2024", domainName: "searchenginejournal.com/best-headless-cms", domainRating: 72, linkType: "Dofollow", backlinkUrl: "https://searchenginejournal.com/best-headless-cms", targetPath: "/pricing", targetLabel: "Pricing", anchorText: "FlowCMS pricing", firstSeen: "Apr 18, 2024", lastSeen: "May 2, 2024", firstSeenTs: 20240418, lastSeenTs: 20240502, positionDelta: 1 },
    { id: "bl3", color: "#00B894", pageTitle: "What is a Headless CMS? Benefits and Use Cases", domainName: "webflow.com/blog/headless-cms", domainRating: 71, linkType: "Nofollow", backlinkUrl: "https://webflow.com/blog/headless-cms", targetPath: "/blog/headless-cms", targetLabel: "Blog post", anchorText: "Learn more", firstSeen: "Apr 22, 2024", lastSeen: "May 2, 2024", firstSeenTs: 20240422, lastSeenTs: 20240502, positionDelta: null },
    { id: "bl4", color: "#3B82F6", pageTitle: "Headless CMS vs Traditional CMS: Which is Right for You?", domainName: "devcommunity.com/headless-vs-traditional", domainRating: 65, linkType: "Dofollow", backlinkUrl: "https://devcommunity.com/headless-vs-traditional", targetPath: "/blog/headless-vs-traditional", targetLabel: "Blog post", anchorText: "FlowCMS", firstSeen: "Apr 14, 2024", lastSeen: "Apr 30, 2024", firstSeenTs: 20240414, lastSeenTs: 20240430, positionDelta: -1 },
    { id: "bl5", color: "#00B894", pageTitle: "FlowCMS Review: Features, Pricing and Alternatives", domainName: "techreviewer.co/flowcms-review", domainRating: 61, linkType: "Nofollow", backlinkUrl: "https://techreviewer.co/flowcms-review", targetPath: "/", targetLabel: "Homepage", anchorText: "Visit website", firstSeen: "Apr 28, 2024", lastSeen: "May 2, 2024", firstSeenTs: 20240428, lastSeenTs: 20240502, positionDelta: null },
    { id: "bl6", color: "#EA4C89", pageTitle: "20 Best CMS for Developers in 2024", domainName: "buildingwithstack.com/best-cms", domainRating: 59, linkType: "Dofollow", backlinkUrl: "https://buildingwithstack.com/best-cms", targetPath: "/features", targetLabel: "Features", anchorText: "Headless CMS", firstSeen: "Apr 15, 2024", lastSeen: "May 1, 2024", firstSeenTs: 20240415, lastSeenTs: 20240501, positionDelta: 3 },
    { id: "bl7", color: "#E91E63", pageTitle: "How to Build a Scalable Website with Headless CMS", domainName: "medium.com/@devs/headless-cms-guide", domainRating: 58, linkType: "Nofollow", backlinkUrl: "https://medium.com/@devs/headless-cms-guide", targetPath: "/blog/scalable-website", targetLabel: "Blog post", anchorText: "FlowCMS", firstSeen: "Apr 20, 2024", lastSeen: "Apr 29, 2024", firstSeenTs: 20240420, lastSeenTs: 20240429, positionDelta: -2 },
    { id: "bl8", color: "#00B894", pageTitle: "Headless CMS Explained: A Beginner's Guide", domainName: "getbeam.com/blog/headless-cms-guide", domainRating: 55, linkType: "Dofollow", backlinkUrl: "https://getbeam.com/blog/headless-cms-guide", targetPath: "/blog/headless-cms-guide", targetLabel: "Blog post", anchorText: "FlowCMS", firstSeen: "Apr 26, 2024", lastSeen: "May 2, 2024", firstSeenTs: 20240426, lastSeenTs: 20240502, positionDelta: 1 },
    { id: "bl9", color: "#6C5CE7", pageTitle: "Why Developers Love Headless CMS", domainName: "codestack.dev/articles/headless-cms", domainRating: 53, linkType: "Dofollow", backlinkUrl: "https://codestack.dev/articles/headless-cms", targetPath: "/", targetLabel: "Homepage", anchorText: "FlowCMS", firstSeen: "Apr 17, 2024", lastSeen: "Apr 17, 2024", firstSeenTs: 20240417, lastSeenTs: 20240417, positionDelta: 2 },
    { id: "bl10", color: "#64748B", pageTitle: "The Future of Content Management Systems", domainName: "agencyanalytics.com/blog/future-of-cms", domainRating: 51, linkType: "Nofollow", backlinkUrl: "https://agencyanalytics.com/blog/future-of-cms", targetPath: "/blog/future-of-cms", targetLabel: "Blog post", anchorText: "Read more", firstSeen: "Apr 23, 2024", lastSeen: "Apr 28, 2024", firstSeenTs: 20240423, lastSeenTs: 20240428, positionDelta: -1 },
    { id: "bl11", color: "#E24B4A", pageTitle: "Top Headless CMS Solutions for Enterprise Teams", domainName: "dev.to/headless-enterprise-cms", domainRating: 91, linkType: "UGC", backlinkUrl: "https://dev.to/headless-enterprise-cms", targetPath: "/enterprise", targetLabel: "Enterprise", anchorText: "FlowCMS", firstSeen: "Apr 10, 2024", lastSeen: "May 3, 2024", firstSeenTs: 20240410, lastSeenTs: 20240503, positionDelta: 5 },
    { id: "bl12", color: "#0A66C2", pageTitle: "The Developer's Guide to Content APIs", domainName: "prismic.io/blog/content-apis", domainRating: 68, linkType: "Sponsored", backlinkUrl: "https://prismic.io/blog/content-apis", targetPath: "/api", targetLabel: "API docs", anchorText: "FlowCMS API", firstSeen: "Apr 25, 2024", lastSeen: "May 2, 2024", firstSeenTs: 20240425, lastSeenTs: 20240502, positionDelta: null },
    { id: "bl13", color: "#00B894", pageTitle: "Headless Architecture in 2024: Trends and Tools", domainName: "netlify.com/blog/headless-2024", domainRating: 82, linkType: "Dofollow", backlinkUrl: "https://netlify.com/blog/headless-2024", targetPath: "/", targetLabel: "Homepage", anchorText: "Get started", firstSeen: "Apr 8, 2024", lastSeen: "May 3, 2024", firstSeenTs: 20240408, lastSeenTs: 20240503, positionDelta: 4 },
    { id: "bl14", color: "#8B5CF6", pageTitle: "CMS Comparison: Strapi vs FlowCMS vs Contentful", domainName: "vueschool.io/cms-comparison", domainRating: 64, linkType: "Dofollow", backlinkUrl: "https://vueschool.io/cms-comparison", targetPath: "/pricing", targetLabel: "Pricing", anchorText: "FlowCMS", firstSeen: "Apr 5, 2024", lastSeen: "Apr 30, 2024", firstSeenTs: 20240405, lastSeenTs: 20240430, positionDelta: -1 },
    { id: "bl15", color: "#F5A623", pageTitle: "Building JAMstack Sites with Headless CMS", domainName: "smashingmagazine.com/jamstack-cms", domainRating: 47, linkType: "Dofollow", backlinkUrl: "https://smashingmagazine.com/jamstack-cms", targetPath: "/blog/jamstack", targetLabel: "Blog post", anchorText: "Try FlowCMS", firstSeen: "Apr 30, 2024", lastSeen: "May 2, 2024", firstSeenTs: 20240430, lastSeenTs: 20240502, positionDelta: 1 },
];

export const backlinkKpis = {
    referringDomains: { value: 842, delta: 18, spark: [680, 700, 720, 750, 780, 810, 830, 842] },
    totalBacklinks: { value: 12600, delta: 15, spark: [9800, 10200, 10800, 11200, 11600, 12000, 12300, 12600] },
    referralSessions: { value: 3218, delta: 24, spark: [2100, 2300, 2500, 2700, 2900, 3000, 3100, 3218] },
    dofollowLinks: { value: 9200, delta: 14, spark: [7200, 7600, 8000, 8400, 8600, 8800, 9000, 9200] },
    domainRating: { value: 48, delta: 6, spark: [40, 42, 43, 44, 45, 46, 47, 48] },
};

export const backlinkLinkTypeBreakdown = [
    { label: "Dofollow", count: 9192, pct: 72.9, color: "#00B894" },
    { label: "Nofollow", count: 2708, pct: 21.5, color: "#3B82F6" },
    { label: "UGC", count: 403, pct: 3.2, color: "#6C5CE7" },
    { label: "Sponsored", count: 301, pct: 2.4, color: "#F5A623" },
];

/* ---------------- Topical Clusters (Enriched) ---------------- */

export type ClusterGap = {
    title: string;
    impact: "High" | "Medium" | "Low";
    estClicks: string;
};

export type ClusterLinkPage = {
    path: string;
    links: number;
};

export type ClusterRich = {
    id: string;
    pillar: string;
    icon: string;
    color: string;
    pages: number;
    subtopics: number;
    authorityScore: number;
    authorityLabel: "Strong" | "Good" | "Needs work" | "Weak";
    coveragePercent: number;
    coveredTopics: number;
    totalTopics: number;
    internalLinks: number;
    internalLinksLabel: "Strong" | "Good" | "Weak";
    contentGaps: number;
    estTrafficGain: number;
    coveredTopicsList: string[];
    mapTopics: string[];
    gaps: ClusterGap[];
    suggestions: string[];
    topLinkedPages: ClusterLinkPage[];
};

export const topicalOverviewSample = {
    authorityScore: 82,
    authorityScoreDelta: 12,
    clustersTracked: 18,
    clustersTrackedDelta: 2,
    contentGaps: 14,
    contentGapsDelta: 3,
    estTrafficGain: 12300,
    estTrafficGainDelta: 18,
};

export const seoClustersRich: ClusterRich[] = [
    {
        id: "cl1",
        pillar: "Branding",
        icon: "grid",
        color: "#6C5CE7",
        pages: 12,
        subtopics: 8,
        authorityScore: 84,
        authorityLabel: "Strong",
        coveragePercent: 92,
        coveredTopics: 22,
        totalTopics: 24,
        internalLinks: 18,
        internalLinksLabel: "Strong",
        contentGaps: 2,
        estTrafficGain: 2300,
        coveredTopicsList: [
            "Your brand should start with positioning",
            "Brand identity for early-stage startups",
            "A practical guide to finding your brand voice",
            "Naming a company: a field guide",
        ],
        mapTopics: ["Positioning", "Messaging", "Brand Voice", "Identity", "Rebrand Strategy"],
        gaps: [
            { title: "Brand positioning framework", impact: "High", estClicks: "2.1K" },
            { title: "Brand messaging examples", impact: "Medium", estClicks: "1.6K" },
        ],
        suggestions: ["Brand positioning framework", "Brand messaging examples", "Rebranding case study"],
        topLinkedPages: [
            { path: "/brand-strategy-guide", links: 12 },
            { path: "/brand-voice", links: 8 },
            { path: "/rebrand-checklist", links: 6 },
        ],
    },
    {
        id: "cl2",
        pillar: "Web Design",
        icon: "overview",
        color: "#3B82F6",
        pages: 9,
        subtopics: 6,
        authorityScore: 66,
        authorityLabel: "Good",
        coveragePercent: 75,
        coveredTopics: 18,
        totalTopics: 24,
        internalLinks: 12,
        internalLinksLabel: "Good",
        contentGaps: 1,
        estTrafficGain: 1800,
        coveredTopicsList: [
            "The anatomy of a landing page that converts",
            "UX principles for non-designers",
            "Conversion design patterns",
        ],
        mapTopics: ["Landing Pages", "UX Principles", "Conversion Design", "Design Trends"],
        gaps: [
            { title: "Motion design principles", impact: "High", estClicks: "1.4K" },
        ],
        suggestions: ["Motion design principles", "Web accessibility guide"],
        topLinkedPages: [
            { path: "/web-design-guide", links: 9 },
            { path: "/ux-principles", links: 6 },
            { path: "/conversion-design", links: 4 },
        ],
    },
    {
        id: "cl3",
        pillar: "Design Systems",
        icon: "document",
        color: "#F5A623",
        pages: 7,
        subtopics: 5,
        authorityScore: 52,
        authorityLabel: "Needs work",
        coveragePercent: 46,
        coveredTopics: 11,
        totalTopics: 24,
        internalLinks: 4,
        internalLinksLabel: "Weak",
        contentGaps: 2,
        estTrafficGain: 1100,
        coveredTopicsList: [
            "Design systems: when you actually need one",
            "Component libraries explained",
        ],
        mapTopics: ["Component Libraries", "Design Tokens", "Documentation", "Accessibility"],
        gaps: [
            { title: "Token architecture deep-dive", impact: "High", estClicks: "1.2K" },
            { title: "Design system documentation guide", impact: "Medium", estClicks: "900" },
        ],
        suggestions: ["Token architecture guide", "Documentation patterns", "Scaling design systems"],
        topLinkedPages: [
            { path: "/design-systems", links: 4 },
            { path: "/component-libraries", links: 2 },
        ],
    },
    {
        id: "cl4",
        pillar: "Growth & SEO",
        icon: "chart",
        color: "#00B894",
        pages: 5,
        subtopics: 4,
        authorityScore: 72,
        authorityLabel: "Good",
        coveragePercent: 80,
        coveredTopics: 16,
        totalTopics: 20,
        internalLinks: 15,
        internalLinksLabel: "Good",
        contentGaps: 1,
        estTrafficGain: 2000,
        coveredTopicsList: [
            "B2B SEO: content that earns its rankings",
            "Content refreshes: the highest-ROI SEO work",
            "Growth loops for SaaS companies",
        ],
        mapTopics: ["SEO Strategy", "Content Strategy", "Link Building", "Analytics"],
        gaps: [
            { title: "Content refresh strategy", impact: "Medium", estClicks: "1.1K" },
        ],
        suggestions: ["Content refresh strategy", "Link building playbook"],
        topLinkedPages: [
            { path: "/seo-guide", links: 8 },
            { path: "/content-strategy", links: 5 },
            { path: "/growth-loops", links: 3 },
        ],
    },
];

export const topicalOpportunities = [
    { clusterId: "cl1", clusterPillar: "Branding", title: "Brand positioning framework", estClicks: 2100 },
    { clusterId: "cl1", clusterPillar: "Branding", title: "Brand messaging examples", estClicks: 1600 },
    { clusterId: "cl3", clusterPillar: "Design Systems", title: "Design tokens guide", estClicks: 1200 },
    { clusterId: "cl4", clusterPillar: "Growth & SEO", title: "Content refresh strategy", estClicks: 1100 },
];
