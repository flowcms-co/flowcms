/**
 * Flow CMS — SEO finding codebook (Phase 2 of the SEO Automation Engine).
 *
 * The shared vocabulary for every SEO finding. BOTH the deterministic L1 detectors
 * and the AI L2 outputs speak only these short codes (e.g. `META_LONG`), never prose.
 * Our presentation layer (`renderFinding`, see audit-engine.ts) expands a code into
 * the user-friendly label / explanation / fix hint / chart, so the compact, cheap
 * output the AI returns becomes a full readable audit the customer sees.
 *
 * Pure data — no Nest/Prisma deps. See docs/AI-AUTOMATION-PLAN.md (Token economics).
 */

import type { SeoTask } from "../../ai/model-tiers";

/** 1 = minor / info, 2 = should fix, 3 = critical. */
export type Severity = 1 | 2 | 3;

/** What AI can do about a finding (drives escalation): generate a fix, explain it, or nothing. */
export type AiAction = "fix" | "explain" | "none";

export interface SeoCode {
    code: string;
    task: SeoTask;
    severity: Severity;
    /** Short UI label. */
    label: string;
    /** Human "why" — rendered locally, NEVER produced by the AI. */
    explanation: string;
    /** What to do about it. */
    fixHint: string;
    /** Routes the finding to its chart / metric bucket in the UI. */
    graphKey: string;
    /** Whether AI adds value here (escalation hint). */
    ai: AiAction;
}

/** The codebook. Add codes here; detectors + AI prompts reference them by key. */
export const SEO_CODES: Record<string, SeoCode> = {
    // ---- meta_title_description ----
    META_TITLE_MISSING: { code: "META_TITLE_MISSING", task: "meta_title_description", severity: 3, label: "Missing title tag", explanation: "The page has no title tag, so search engines have nothing to show as the headline.", fixHint: "Add a 30-60 character title with the focus keyword.", graphKey: "meta.title", ai: "fix" },
    META_TITLE_LONG: { code: "META_TITLE_LONG", task: "meta_title_description", severity: 2, label: "Title too long", explanation: "Titles over ~60 characters get truncated in search results.", fixHint: "Trim the title to under 60 characters.", graphKey: "meta.title", ai: "fix" },
    META_TITLE_SHORT: { code: "META_TITLE_SHORT", task: "meta_title_description", severity: 1, label: "Title too short", explanation: "Very short titles waste the chance to describe the page.", fixHint: "Expand the title toward 50-60 characters.", graphKey: "meta.title", ai: "fix" },
    META_DESC_MISSING: { code: "META_DESC_MISSING", task: "meta_title_description", severity: 2, label: "Missing meta description", explanation: "No meta description, so search engines auto-generate the snippet.", fixHint: "Add a 120-160 character description with the keyword.", graphKey: "meta.desc", ai: "fix" },
    META_DESC_LONG: { code: "META_DESC_LONG", task: "meta_title_description", severity: 1, label: "Description too long", explanation: "Descriptions over ~160 characters get cut off.", fixHint: "Trim to under 160 characters.", graphKey: "meta.desc", ai: "fix" },
    META_TITLE_NO_KEYWORD: { code: "META_TITLE_NO_KEYWORD", task: "meta_title_description", severity: 1, label: "Keyword not in title", explanation: "The focus keyword isn't in the title tag.", fixHint: "Work the focus keyword into the title naturally.", graphKey: "meta.title", ai: "fix" },

    // ---- image_alt_tag ----
    IMG_ALT_MISSING: { code: "IMG_ALT_MISSING", task: "image_alt_tag", severity: 2, label: "Images missing alt text", explanation: "Images without alt text hurt accessibility and image search.", fixHint: "Generate descriptive alt text for each image.", graphKey: "images.alt", ai: "fix" },

    // ---- schema_audit ----
    SCHEMA_MISSING: { code: "SCHEMA_MISSING", task: "schema_audit", severity: 2, label: "No structured data", explanation: "The page has no JSON-LD schema, so it can't earn rich results.", fixHint: "Add appropriate schema (Article, Product, FAQ, etc.).", graphKey: "schema", ai: "fix" },
    SCHEMA_INVALID: { code: "SCHEMA_INVALID", task: "schema_audit", severity: 2, label: "Invalid schema field", explanation: "A required schema field is missing or malformed.", fixHint: "Repair the flagged field to pass validation.", graphKey: "schema", ai: "fix" },

    // ---- core_web_vitals ----
    CWV_LCP_POOR: { code: "CWV_LCP_POOR", task: "core_web_vitals", severity: 3, label: "Slow loading (LCP)", explanation: "Largest Contentful Paint is over 4s — the page feels slow to load.", fixHint: "Optimize the hero image / server response.", graphKey: "cwv.lcp", ai: "explain" },
    CWV_LCP_WARN: { code: "CWV_LCP_WARN", task: "core_web_vitals", severity: 2, label: "LCP needs work", explanation: "LCP is between 2.5s and 4s.", fixHint: "Compress above-the-fold media; preconnect.", graphKey: "cwv.lcp", ai: "explain" },
    CWV_CLS_POOR: { code: "CWV_CLS_POOR", task: "core_web_vitals", severity: 2, label: "Layout shifts (CLS)", explanation: "Cumulative Layout Shift is high — content jumps as it loads.", fixHint: "Set width/height on images and reserve ad/embed space.", graphKey: "cwv.cls", ai: "explain" },
    CWV_INP_POOR: { code: "CWV_INP_POOR", task: "core_web_vitals", severity: 2, label: "Sluggish interaction (INP)", explanation: "Interaction to Next Paint is high — the page feels laggy to tap.", fixHint: "Reduce long main-thread JavaScript tasks.", graphKey: "cwv.inp", ai: "explain" },

    // ---- onpage_seo_audit ----
    H1_MISSING: { code: "H1_MISSING", task: "onpage_seo_audit", severity: 2, label: "No H1 heading", explanation: "The page has no H1, weakening its topical signal.", fixHint: "Add a single descriptive H1.", graphKey: "headings", ai: "none" },
    H1_MULTIPLE: { code: "H1_MULTIPLE", task: "onpage_seo_audit", severity: 1, label: "Multiple H1s", explanation: "More than one H1 dilutes the page's main topic.", fixHint: "Keep one H1; demote the rest to H2.", graphKey: "headings", ai: "none" },
    HEADING_SKIP: { code: "HEADING_SKIP", task: "onpage_seo_audit", severity: 1, label: "Heading levels skip", explanation: "Heading levels jump (e.g. H2 to H4), hurting structure.", fixHint: "Use sequential heading levels.", graphKey: "headings", ai: "none" },
    THIN_CONTENT: { code: "THIN_CONTENT", task: "onpage_seo_audit", severity: 2, label: "Thin content", explanation: "Very low word count rarely ranks for competitive terms.", fixHint: "Expand with useful, original detail.", graphKey: "content.length", ai: "fix" },
    INTERNAL_LINKS_FEW: { code: "INTERNAL_LINKS_FEW", task: "onpage_seo_audit", severity: 1, label: "Few internal links", explanation: "Few internal links limit crawl flow and topical clustering.", fixHint: "Add relevant internal links to related pages.", graphKey: "links.internal", ai: "none" },

    // ---- content (readability / originality) — onpage-adjacent, AI-fixable ----
    READABILITY_HARD: { code: "READABILITY_HARD", task: "onpage_seo_audit", severity: 1, label: "Hard to read", explanation: "Flesch reading ease is low — sentences are long/complex.", fixHint: "Shorten sentences; use simpler words.", graphKey: "content.readability", ai: "fix" },
    DUPLICATE_CONTENT: { code: "DUPLICATE_CONTENT", task: "onpage_seo_audit", severity: 2, label: "Duplicate passage", explanation: "A passage closely matches another page on this site.", fixHint: "Rewrite the duplicated passage or canonicalize.", graphKey: "content.duplicate", ai: "fix" },

    // ---- gsc_ga_analysis ----
    GSC_CTR_DROP: { code: "GSC_CTR_DROP", task: "gsc_ga_analysis", severity: 2, label: "CTR dropping", explanation: "Click-through rate fell vs the prior period.", fixHint: "Refresh the title/description to be more compelling.", graphKey: "gsc.ctr", ai: "explain" },
    GSC_POSITION_DROP: { code: "GSC_POSITION_DROP", task: "gsc_ga_analysis", severity: 2, label: "Ranking dropped", explanation: "Average position worsened for this page/query.", fixHint: "Review competitors and refresh the content.", graphKey: "gsc.position", ai: "explain" },
    GSC_STRIKING_DISTANCE: { code: "GSC_STRIKING_DISTANCE", task: "gsc_ga_analysis", severity: 1, label: "Striking distance", explanation: "Ranking on page 2 (positions 11-20) — a small push could reach page 1.", fixHint: "Strengthen the page for this query.", graphKey: "gsc.position", ai: "explain" },

    // ---- technical_diagnosis ----
    TECH_REDIRECT_CHAIN: { code: "TECH_REDIRECT_CHAIN", task: "technical_diagnosis", severity: 2, label: "Redirect chain", explanation: "The URL redirects more than once before resolving, wasting crawl budget.", fixHint: "Point the first redirect straight to the final URL.", graphKey: "tech.redirects", ai: "explain" },
    TECH_CANONICAL_MISSING: { code: "TECH_CANONICAL_MISSING", task: "technical_diagnosis", severity: 1, label: "No canonical", explanation: "No canonical tag, risking duplicate-content ambiguity.", fixHint: "Add a self-referencing canonical.", graphKey: "tech.canonical", ai: "none" },
    TECH_NOINDEX: { code: "TECH_NOINDEX", task: "technical_diagnosis", severity: 3, label: "Page is noindex", explanation: "A noindex directive keeps this page out of search entirely.", fixHint: "Remove noindex if the page should rank.", graphKey: "tech.index", ai: "none" },

    // ---- AI readiness (site-scope; deterministic file generation) ----
    AIREADY_LLMS_MISSING: { code: "AIREADY_LLMS_MISSING", task: "technical_diagnosis", severity: 2, label: "Missing llms.txt", explanation: "There is no llms.txt, so AI answer engines have no curated guide to your best pages.", fixHint: "Generate an llms.txt from your key pages.", graphKey: "aiready.llms", ai: "none" },
    AIREADY_ROBOTS_MISSING: { code: "AIREADY_ROBOTS_MISSING", task: "technical_diagnosis", severity: 2, label: "Missing robots.txt", explanation: "No robots.txt was found, so crawlers have no instructions and AI bots may be blocked by default.", fixHint: "Generate a robots.txt that allows AI bots and points to your sitemap.", graphKey: "aiready.robots", ai: "none" },
    AIREADY_ROBOTS_BLOCKS_AI: { code: "AIREADY_ROBOTS_BLOCKS_AI", task: "technical_diagnosis", severity: 2, label: "robots.txt blocks AI bots", explanation: "Your robots.txt disallows AI crawlers (GPTBot, PerplexityBot, Google-Extended), so you can't appear in AI answers.", fixHint: "Allow the AI bots in robots.txt.", graphKey: "aiready.robots", ai: "none" },
    AIREADY_SITEMAP_MISSING: { code: "AIREADY_SITEMAP_MISSING", task: "technical_diagnosis", severity: 2, label: "Missing sitemap.xml", explanation: "No sitemap.xml was found, so search and AI crawlers may miss pages.", fixHint: "Generate a sitemap.xml from your published pages.", graphKey: "aiready.sitemap", ai: "none" },
    AIREADY_SITEMAP_NOT_IN_ROBOTS: { code: "AIREADY_SITEMAP_NOT_IN_ROBOTS", task: "technical_diagnosis", severity: 1, label: "Sitemap not referenced in robots.txt", explanation: "Your robots.txt does not reference the sitemap, so crawlers may not discover it.", fixHint: "Add a Sitemap: line to robots.txt.", graphKey: "aiready.robots", ai: "none" },

    // ---- schema (site-scope) ----
    SCHEMA_FAQ_MISSING: { code: "SCHEMA_FAQ_MISSING", task: "schema_audit", severity: 1, label: "No FAQ schema", explanation: "No FAQPage structured data was found, so you can't earn FAQ rich results or be quoted by AI engines.", fixHint: "Generate FAQPage JSON-LD from a page's questions.", graphKey: "schema.faq", ai: "fix" },
    SCHEMA_ORG_MISSING: { code: "SCHEMA_ORG_MISSING", task: "schema_audit", severity: 1, label: "No Organization schema", explanation: "No global Organization structured data is set, weakening your brand entity in search and AI.", fixHint: "Add Organization JSON-LD in the Schema Builder.", graphKey: "schema.org", ai: "none" },
    SCHEMA_SERVICE_MISSING: { code: "SCHEMA_SERVICE_MISSING", task: "schema_audit", severity: 1, label: "No Service schema", explanation: "Service pages have no Service structured data, so they can't earn service rich results.", fixHint: "Add Service JSON-LD describing the offering.", graphKey: "schema.service", ai: "fix" },

    // ---- cannibalization (site-scope; advisory) ----
    CANNIBALIZATION: { code: "CANNIBALIZATION", task: "gsc_ga_analysis", severity: 2, label: "Keyword cannibalization", explanation: "Multiple pages compete for the same query ({kw}), splitting your ranking signals.", fixHint: "Consolidate or differentiate the competing pages.", graphKey: "gsc.cannibalization", ai: "none" },

    // ---- internal linking (site-scope; one-click apply) ----
    INTERNAL_LINK_OPP: { code: "INTERNAL_LINK_OPP", task: "onpage_seo_audit", severity: 1, label: "Internal linking opportunity", explanation: "A page mentions another page's topic without linking to it.", fixHint: "Add a relevant internal link in one click.", graphKey: "links.opportunity", ai: "none" },

    // ---- page speed opportunities (parsed from Lighthouse audits; advisory) ----
    PERF_RENDER_BLOCKING: { code: "PERF_RENDER_BLOCKING", task: "core_web_vitals", severity: 2, label: "Render-blocking resources", explanation: "Scripts or stylesheets block the first paint, delaying when the page becomes visible.", fixHint: "Defer non-critical JS/CSS, inline critical CSS, and load scripts async.", graphKey: "cwv.render", ai: "explain" },
    PERF_IMAGE_OPT: { code: "PERF_IMAGE_OPT", task: "core_web_vitals", severity: 2, label: "Unoptimized images", explanation: "Images are larger than needed or not in a modern format, slowing the load.", fixHint: "Serve WebP/AVIF, compress, size correctly, and lazy-load offscreen images.", graphKey: "cwv.images", ai: "explain" },
    PERF_UNMINIFIED: { code: "PERF_UNMINIFIED", task: "core_web_vitals", severity: 1, label: "Unminified or unused CSS/JS", explanation: "Minify and tree-shake CSS/JS to cut bytes the browser must download and parse.", fixHint: "Enable minification + remove unused CSS/JS in your build.", graphKey: "cwv.assets", ai: "explain" },
    PERF_TEXT_COMPRESSION: { code: "PERF_TEXT_COMPRESSION", task: "core_web_vitals", severity: 1, label: "Text compression off", explanation: "Text resources are served without gzip/brotli compression.", fixHint: "Enable gzip or brotli on your server/CDN.", graphKey: "cwv.assets", ai: "explain" },
    PERF_TOTAL_WEIGHT: { code: "PERF_TOTAL_WEIGHT", task: "core_web_vitals", severity: 1, label: "Heavy page payload", explanation: "The total page weight is high, which hurts load time on slower connections.", fixHint: "Trim large assets, lazy-load, and split bundles.", graphKey: "cwv.weight", ai: "explain" },

    // ---- analytics & Search Console health (site-scope; connect/instructions) ----
    GA4_NOT_CONNECTED: { code: "GA4_NOT_CONNECTED", task: "gsc_ga_analysis", severity: 2, label: "GA4 not connected", explanation: "Google Analytics 4 isn't connected, so you have no audience or behaviour data.", fixHint: "Connect GA4 in Settings, Integrations.", graphKey: "track.ga4", ai: "none" },
    GA4_NO_DATA: { code: "GA4_NO_DATA", task: "gsc_ga_analysis", severity: 1, label: "GA4 returning no data", explanation: "GA4 is connected but no sessions have synced yet, so reports are empty.", fixHint: "Confirm the GA4 property and that the tag is firing on your site.", graphKey: "track.ga4", ai: "none" },
    GSC_NOT_CONNECTED: { code: "GSC_NOT_CONNECTED", task: "gsc_ga_analysis", severity: 2, label: "Search Console not connected", explanation: "Google Search Console isn't connected, so keyword, ranking and coverage data is missing.", fixHint: "Connect Search Console in Settings, Integrations.", graphKey: "track.gsc", ai: "none" },
    GSC_NO_DATA: { code: "GSC_NO_DATA", task: "gsc_ga_analysis", severity: 1, label: "Search Console returning no data", explanation: "Search Console is connected but no impressions have synced yet.", fixHint: "Verify the property and that the site is indexed; data can take a few days.", graphKey: "track.gsc", ai: "none" },
};

/** Look up a code (returns null for unknown codes from a misbehaving model). */
export function lookupCode(code: string): SeoCode | null {
    return SEO_CODES[code] ?? null;
}

/** All codes a given task can emit (used to constrain AI output + validate). */
export function codesForTask(task: SeoTask): string[] {
    return Object.values(SEO_CODES)
        .filter((c) => c.task === task)
        .map((c) => c.code);
}
