/**
 * Flow CMS — SEO issue grouping (pure).
 *
 * The AI Optimizer shows issues GROUPED by type across pages (e.g. "Missing meta
 * descriptions · 8 pages"), not page-by-page. This module is the single taxonomy:
 * it maps each codebook code to a display category, an effort estimate and a fix
 * kind, then folds rendered findings (page-scope + site-scope) into issue groups
 * with affected pages + quick wins. Pure: no Nest/Prisma/network, so it's unit-testable.
 */
import type { RenderedFinding } from "./audit-engine";

export type IssueCategory =
    | "metadata"
    | "schema"
    | "structure"
    | "content"
    | "performance"
    | "technical"
    | "readiness"
    | "links"
    | "cannibalization"
    | "search"
    | "tracking"
    | "images"
    | "other";

export type Band = "high" | "med" | "low";
export type Effort = "easy" | "med" | "hard";
/** How the Optimizer offers to fix an issue (drives which modal / route opens). */
export type FixKind = "meta" | "schema" | "faq" | "org" | "file" | "links" | "alt" | "editor" | "connect" | "cannibalization" | "instructions";

export interface IssuePage {
    id: string | null;
    url: string | null;
    title: string | null;
    detail?: string;
    /** Optional grouping key (e.g. the cannibalized keyword the page competes for). */
    group?: string;
    /** Per-page priority tier (internal links, schema). */
    priority?: Band;
    /** Duplicate content: overlap % + the page it overlaps. */
    overlap?: number;
    matchTitle?: string;
    /** Metadata: current value + length, and the deterministic recommendation. */
    current?: string;
    currentLen?: number;
    recommended?: string;
    recommendedLen?: number;
    /** Schema: which schema type this page should get. */
    schemaType?: string;
    /** Internal links: how many inbound links are suggested + the source pages. */
    suggested?: number;
    sources?: string[];
    /** A short "why it matters" line. */
    reason?: string;
}

export interface IssueGroup {
    key: string; // code
    title: string; // label
    category: IssueCategory;
    scope: "page" | "site";
    severity: Band;
    effort: Effort;
    fix: FixKind;
    /** Extra arg for the fix (e.g. the file kind for `fix: "file"`). */
    fixArg?: string;
    ai: "fix" | "explain" | "none";
    count: number; // affected pages / instances
    explanation: string;
    fixHint: string;
    pages: IssuePage[];
}

export interface CategoryMeta {
    key: IssueCategory;
    label: string;
    count: number; // number of issue groups (rows) in this category
}

export interface IssuesResult {
    score: number | null;
    counts: { total: number; pages: number; aiFixable: number; clean: number };
    categories: CategoryMeta[];
    groups: IssueGroup[];
    quickWins: IssueGroup[];
}

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
    metadata: "Metadata",
    schema: "Schema",
    structure: "Structure",
    content: "Content quality",
    performance: "Performance",
    technical: "Technical",
    readiness: "AI readiness",
    links: "Internal linking",
    cannibalization: "Cannibalization",
    search: "Search Console",
    tracking: "Analytics & tracking",
    images: "Images",
    other: "Other",
};

const CATEGORY_ORDER: IssueCategory[] = [
    "metadata", "schema", "structure", "content", "performance", "readiness", "links", "cannibalization", "search", "tracking", "technical", "images", "other",
];

/** Per-code overrides; otherwise we fall back to the task default. */
const CODE_CATEGORY: Record<string, IssueCategory> = {
    AIREADY_LLMS_MISSING: "readiness",
    AIREADY_ROBOTS_MISSING: "readiness",
    AIREADY_ROBOTS_BLOCKS_AI: "readiness",
    AIREADY_SITEMAP_MISSING: "readiness",
    AIREADY_SITEMAP_NOT_IN_ROBOTS: "readiness",
    CANNIBALIZATION: "cannibalization",
    INTERNAL_LINK_OPP: "links",
    INTERNAL_LINKS_FEW: "links",
    DUPLICATE_CONTENT: "content",
    THIN_CONTENT: "content",
    READABILITY_HARD: "content",
    GA4_NOT_CONNECTED: "tracking",
    GA4_NO_DATA: "tracking",
    GSC_NOT_CONNECTED: "tracking",
    GSC_NO_DATA: "tracking",
};

const TASK_CATEGORY: Record<string, IssueCategory> = {
    meta_title_description: "metadata",
    image_alt_tag: "images",
    schema_audit: "schema",
    core_web_vitals: "performance",
    onpage_seo_audit: "structure",
    gsc_ga_analysis: "search",
    technical_diagnosis: "technical",
};

export function categoryOf(code: string, task: string): IssueCategory {
    return CODE_CATEGORY[code] ?? TASK_CATEGORY[task] ?? "other";
}

const CODE_EFFORT: Record<string, Effort> = {
    META_TITLE_MISSING: "easy", META_TITLE_LONG: "easy", META_TITLE_SHORT: "easy", META_DESC_MISSING: "easy", META_DESC_LONG: "easy", META_TITLE_NO_KEYWORD: "easy",
    IMG_ALT_MISSING: "easy",
    SCHEMA_MISSING: "med", SCHEMA_INVALID: "med", SCHEMA_FAQ_MISSING: "med", SCHEMA_ORG_MISSING: "easy", SCHEMA_SERVICE_MISSING: "med",
    CWV_LCP_POOR: "hard", CWV_LCP_WARN: "hard", CWV_CLS_POOR: "hard", CWV_INP_POOR: "hard",
    H1_MISSING: "easy", H1_MULTIPLE: "easy", HEADING_SKIP: "easy", THIN_CONTENT: "hard", INTERNAL_LINKS_FEW: "easy", READABILITY_HARD: "med", DUPLICATE_CONTENT: "med",
    GSC_CTR_DROP: "med", GSC_POSITION_DROP: "med", GSC_STRIKING_DISTANCE: "med",
    TECH_REDIRECT_CHAIN: "med", TECH_CANONICAL_MISSING: "easy", TECH_NOINDEX: "easy",
    AIREADY_LLMS_MISSING: "easy", AIREADY_ROBOTS_MISSING: "easy", AIREADY_ROBOTS_BLOCKS_AI: "easy", AIREADY_SITEMAP_MISSING: "easy", AIREADY_SITEMAP_NOT_IN_ROBOTS: "easy",
    CANNIBALIZATION: "hard", INTERNAL_LINK_OPP: "easy",
    PERF_RENDER_BLOCKING: "hard", PERF_IMAGE_OPT: "med", PERF_UNMINIFIED: "med", PERF_TEXT_COMPRESSION: "easy", PERF_TOTAL_WEIGHT: "hard",
    GA4_NOT_CONNECTED: "easy", GA4_NO_DATA: "med", GSC_NOT_CONNECTED: "easy", GSC_NO_DATA: "med",
};

export function effortOf(code: string): Effort {
    return CODE_EFFORT[code] ?? "med";
}

/** What kind of fix the Optimizer offers (modal vs editor vs instructions). */
export function fixKindOf(code: string, ai: RenderedFinding["ai"]): { kind: FixKind; arg?: string } {
    switch (code) {
        case "META_TITLE_MISSING": case "META_TITLE_LONG": case "META_TITLE_SHORT": case "META_DESC_MISSING": case "META_DESC_LONG": case "META_TITLE_NO_KEYWORD":
            return { kind: "meta" };
        case "IMG_ALT_MISSING":
            return { kind: "alt" };
        case "SCHEMA_MISSING": case "SCHEMA_INVALID": case "SCHEMA_SERVICE_MISSING":
            return { kind: "schema" };
        case "SCHEMA_FAQ_MISSING":
            return { kind: "faq" };
        case "SCHEMA_ORG_MISSING":
            // Per-page Organization JSON-LD opens the in-place schema modal (the global
            // Organization entity still lives in the Schema Builder).
            return { kind: "schema" };
        case "AIREADY_LLMS_MISSING":
            return { kind: "file", arg: "llms" };
        case "AIREADY_ROBOTS_MISSING": case "AIREADY_ROBOTS_BLOCKS_AI": case "AIREADY_SITEMAP_NOT_IN_ROBOTS":
            return { kind: "file", arg: "robots" };
        case "AIREADY_SITEMAP_MISSING":
            return { kind: "file", arg: "sitemap" };
        case "INTERNAL_LINK_OPP": case "INTERNAL_LINKS_FEW":
            // Internal linking is applied (deterministically) through the in-place
            // links modal + the safe-apply pipeline, not the block editor.
            return { kind: "links" };
        case "GA4_NOT_CONNECTED": case "GA4_NO_DATA": case "GSC_NOT_CONNECTED": case "GSC_NO_DATA":
            return { kind: "connect" }; // open Settings → Integrations
        case "CANNIBALIZATION":
            return { kind: "cannibalization" };
        case "THIN_CONTENT": case "READABILITY_HARD": case "DUPLICATE_CONTENT": case "H1_MISSING": case "H1_MULTIPLE": case "HEADING_SKIP": case "TECH_NOINDEX": case "TECH_CANONICAL_MISSING":
            return { kind: "editor" }; // content / on-page edits happen in the block editor
        default:
            // CWV, PageSpeed opportunities, GSC drops, redirect chains, cannibalization: explain + instructions
            return { kind: ai === "fix" ? "editor" : "instructions" };
    }
}

const BAND: Record<number, Band> = { 3: "high", 2: "med", 1: "low" };
const SEV_RANK: Record<Band, number> = { high: 3, med: 2, low: 1 };
const EFFORT_RANK: Record<Effort, number> = { easy: 3, med: 2, hard: 1 };

/** A site-scope finding the engine produced from crawl/GSC/vitals data, with the
 *  pages it affects (may be empty for a whole-site issue like a missing robots.txt). */
export interface SiteFinding {
    finding: RenderedFinding;
    count?: number;
    pages?: IssuePage[];
}

export interface PageRow {
    entryId: string | null;
    url: string | null;
    title: string | null;
    findings: RenderedFinding[];
}

function toGroup(code: string, sample: RenderedFinding, scope: "page" | "site", pages: IssuePage[], count: number): IssueGroup {
    const fix = fixKindOf(code, sample.ai);
    return {
        key: code,
        title: sample.label,
        category: categoryOf(code, sample.task),
        scope,
        severity: BAND[sample.severity] ?? "low",
        effort: effortOf(code),
        fix: fix.kind,
        fixArg: fix.arg,
        ai: sample.ai,
        count,
        explanation: sample.explanation,
        fixHint: sample.fixHint,
        pages,
    };
}

/** Map a finding's compact `values` onto the structured per-page fields the rich
 *  category layouts read (deterministic; no AI). */
function enrichPage(code: string, f: RenderedFinding, url: string | null): Partial<IssuePage> {
    const v = f.values ?? {};
    const out: Partial<IssuePage> = {};
    if (typeof v.cur === "string") {
        out.current = v.cur;
        out.currentLen = typeof v.len === "number" ? v.len : v.cur.length;
    }
    if (typeof v.rec === "string") {
        out.recommended = v.rec;
        out.recommendedLen = typeof v.recLen === "number" ? v.recLen : v.rec.length;
    }
    if (typeof v.reason === "string") out.reason = v.reason;
    if (typeof v.suggested === "number") out.suggested = v.suggested;
    if (typeof v.sources === "string") out.sources = v.sources.split("|").map((s) => s.trim()).filter(Boolean);
    if (code === "INTERNAL_LINKS_FEW") {
        const c = typeof v.count === "number" ? v.count : 1;
        out.priority = c === 0 ? "high" : c === 1 ? "med" : "low";
    }
    if (code === "SCHEMA_MISSING") {
        out.schemaType = "Article";
        // Blog/article pages have the strongest rich-result upside.
        out.priority = url && /\/blog\//.test(url) ? "high" : "med";
    }
    return out;
}

/** Fold page-scope rows + site-scope findings into grouped issues + quick wins. */
export function buildIssues(pageRows: PageRow[], site: SiteFinding[], score: number | null): IssuesResult {
    // Page-scope: group findings by code across pages.
    const byCode = new Map<string, { sample: RenderedFinding; pages: IssuePage[] }>();
    let clean = 0;
    for (const row of pageRows) {
        if (!row.findings.length) clean++;
        for (const f of row.findings) {
            const g = byCode.get(f.code) ?? { sample: f, pages: [] };
            g.pages.push({ id: row.entryId, url: row.url, title: row.title, detail: f.fixHint, ...enrichPage(f.code, f, row.url) });
            byCode.set(f.code, g);
        }
    }

    const groups: IssueGroup[] = [];
    for (const [code, g] of byCode) groups.push(toGroup(code, g.sample, "page", g.pages, g.pages.length));
    for (const s of site) {
        const pages = s.pages ?? [];
        groups.push(toGroup(s.finding.code, s.finding, "site", pages, s.count ?? pages.length ?? 1));
    }

    // Sort: severity desc, then effort easy-first, then more-affected first.
    groups.sort((a, b) =>
        SEV_RANK[b.severity] - SEV_RANK[a.severity] ||
        EFFORT_RANK[b.effort] - EFFORT_RANK[a.effort] ||
        b.count - a.count,
    );

    const catCounts = new Map<IssueCategory, number>();
    for (const g of groups) catCounts.set(g.category, (catCounts.get(g.category) ?? 0) + 1);
    const categories: CategoryMeta[] = CATEGORY_ORDER
        .filter((k) => catCounts.has(k))
        .map((k) => ({ key: k, label: CATEGORY_LABELS[k], count: catCounts.get(k) ?? 0 }));

    const totalInstances = groups.reduce((s, g) => s + g.count, 0);
    const aiFixable = groups.filter((g) => g.fix === "meta" || g.fix === "schema" || g.fix === "faq" || g.fix === "alt").reduce((s, g) => s + g.count, 0);

    // Quick wins: high-impact + low-effort + fixable, the 3 best.
    const quickWins = groups
        .filter((g) => g.fix !== "instructions")
        .slice()
        .sort((a, b) =>
            (a.effort === "easy" ? 0 : 1) - (b.effort === "easy" ? 0 : 1) ||
            SEV_RANK[b.severity] - SEV_RANK[a.severity] ||
            b.count - a.count,
        )
        .slice(0, 3);

    return {
        score,
        counts: { total: totalInstances, pages: pageRows.length, aiFixable, clean },
        categories,
        groups,
        quickWins,
    };
}
