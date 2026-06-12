/**
 * Flow CMS — SEO audit engine (Phase 2, pure core).
 *
 * - L1 deterministic DETECTORS: take a structured page snapshot, return Findings
 *   (codes from the codebook). $0, run on every change + on a throttled drip.
 * - PRESENTATION layer: `renderFinding` expands a code into the readable
 *   label/explanation/fix/chart the customer sees. Same renderer for L1 + L2.
 * - ESCALATION: which findings warrant an AI (L2) pass.
 * - COMPACT bridge: `compactToFindings` turns the AI's tiny coded output into the
 *   same Finding shape, so both layers flow through one pipeline.
 * - CHANGE DETECTION: `contentHash` so unchanged pages never re-run.
 *
 * Pure — no Nest/Prisma/network. See docs/AI-AUTOMATION-PLAN.md.
 */

import type { SeoTask } from "../../ai/model-tiers";
import { SEO_CODES, lookupCode, codesForTask, type Severity } from "./seo-codes";

export interface Finding {
    code: string;
    task: SeoTask;
    severity: Severity;
    /** Compact values that fill the codebook template + feed charts (e.g. {len:71}). */
    values?: Record<string, string | number>;
    /** Which element/field/url the finding is about. */
    ref?: string;
}

/** A structured snapshot of a page (parsed by L1 from managed content or a crawl). */
export interface PageInput {
    url?: string;
    metaTitle?: string;
    metaDescription?: string;
    focusKeyword?: string;
    headings?: { level: number; text: string }[];
    images?: { src: string; alt?: string | null }[];
    internalLinkCount?: number;
    bodyText?: string;
    wordCount?: number;
    /** Parsed JSON-LD blocks (objects), or empty when none. */
    jsonLd?: Record<string, unknown>[];
    /** Pre-fetched Core Web Vitals (free PSI data). */
    vitals?: { lcpMs?: number; cls?: number; inpMs?: number };
    tech?: { redirectChain?: string[]; canonical?: string | null; noindex?: boolean };
}

/** One GSC/GA row (pre-fetched free data) for the analysis task. */
export interface GscRow {
    page: string;
    query?: string;
    ctr: number;
    ctrPrev?: number;
    position: number;
    positionPrev?: number;
}

// --- helpers ---
function mk(code: string, values?: Finding["values"], ref?: string): Finding {
    const c = SEO_CODES[code];
    return { code, task: c.task, severity: c.severity, values, ref };
}
function words(text?: string): number {
    return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

/** Flesch reading ease (higher = easier; < 50 is hard). Pure, no deps. */
export function fleschReadingEase(text: string): number {
    const sentences = (text.match(/[.!?]+/g) || []).length || 1;
    const wordList = text.trim().split(/\s+/).filter(Boolean);
    const wc = wordList.length || 1;
    const syllables = wordList.reduce((sum, w) => sum + countSyllables(w), 0) || 1;
    return Math.round(206.835 - 1.015 * (wc / sentences) - 84.6 * (syllables / wc));
}
function countSyllables(word: string): number {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (w.length <= 3) return 1;
    const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups ? groups.length : 1);
}

// --- L1 detectors (each pure: input -> Findings) ---

/** Deterministic meta trim: collapse whitespace, cut to <=max at a word boundary,
 *  strip dangling punctuation. Used for the inline "recommended" preview (no AI). */
export function trimMeta(s: string, max: number): string {
    const clean = s.replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    let cut = clean.slice(0, max);
    const sp = cut.lastIndexOf(" ");
    if (sp > max * 0.6) cut = cut.slice(0, sp);
    return cut.replace(/[\s,;:.–—-]+$/, "").trim();
}

export function detectMeta(p: PageInput): Finding[] {
    const out: Finding[] = [];
    const t = (p.metaTitle ?? "").trim();
    if (!t) out.push(mk("META_TITLE_MISSING"));
    else {
        if (t.length > 60) out.push(mk("META_TITLE_LONG", { len: t.length, cur: t, rec: trimMeta(t, 60), recLen: trimMeta(t, 60).length }));
        else if (t.length < 30) out.push(mk("META_TITLE_SHORT", { len: t.length, cur: t }));
        if (p.focusKeyword && !t.toLowerCase().includes(p.focusKeyword.toLowerCase()))
            out.push(mk("META_TITLE_NO_KEYWORD", { kw: p.focusKeyword, cur: t }));
    }
    const d = (p.metaDescription ?? "").trim();
    if (!d) out.push(mk("META_DESC_MISSING"));
    else if (d.length > 160) out.push(mk("META_DESC_LONG", { len: d.length, cur: d, rec: trimMeta(d, 160), recLen: trimMeta(d, 160).length }));
    return out;
}

export function detectAltTags(p: PageInput): Finding[] {
    if (!p.images?.length) return [];
    const missing = p.images.filter((i) => !i.alt || !i.alt.trim());
    return missing.length ? [mk("IMG_ALT_MISSING", { count: missing.length, total: p.images.length })] : [];
}

export function detectSchema(p: PageInput): Finding[] {
    if (p.jsonLd === undefined) return []; // not crawled yet
    if (!p.jsonLd.length) return [mk("SCHEMA_MISSING")];
    const out: Finding[] = [];
    for (const block of p.jsonLd) {
        if (!block || typeof block !== "object" || !("@type" in block))
            out.push(mk("SCHEMA_INVALID", { f: "@type" }));
    }
    return out;
}

export function detectCwv(p: PageInput): Finding[] {
    const v = p.vitals;
    if (!v) return [];
    const out: Finding[] = [];
    if (v.lcpMs !== undefined) {
        if (v.lcpMs > 4000) out.push(mk("CWV_LCP_POOR", { lcp: v.lcpMs }));
        else if (v.lcpMs > 2500) out.push(mk("CWV_LCP_WARN", { lcp: v.lcpMs }));
    }
    if (v.cls !== undefined && v.cls > 0.1) out.push(mk("CWV_CLS_POOR", { cls: v.cls }));
    if (v.inpMs !== undefined && v.inpMs > 200) out.push(mk("CWV_INP_POOR", { inp: v.inpMs }));
    return out;
}

export function detectOnPage(p: PageInput): Finding[] {
    const out: Finding[] = [];
    const hs = p.headings ?? [];
    const h1s = hs.filter((h) => h.level === 1);
    if (hs.length) {
        if (h1s.length === 0) out.push(mk("H1_MISSING"));
        else if (h1s.length > 1) out.push(mk("H1_MULTIPLE", { count: h1s.length }));
        for (let i = 1; i < hs.length; i++) if (hs[i].level - hs[i - 1].level > 1) { out.push(mk("HEADING_SKIP")); break; }
    }
    const wc = p.wordCount ?? words(p.bodyText);
    if (wc > 0 && wc < 300) out.push(mk("THIN_CONTENT", { words: wc }));
    if (p.internalLinkCount !== undefined && p.internalLinkCount < 2) out.push(mk("INTERNAL_LINKS_FEW", { count: p.internalLinkCount }));
    if (p.bodyText && wc >= 40) {
        const ease = fleschReadingEase(p.bodyText);
        if (ease < 50) out.push(mk("READABILITY_HARD", { ease }));
    }
    return out;
}

export function detectTech(p: PageInput): Finding[] {
    const t = p.tech;
    if (!t) return [];
    const out: Finding[] = [];
    if (t.noindex) out.push(mk("TECH_NOINDEX"));
    if (t.redirectChain && t.redirectChain.length > 1) out.push(mk("TECH_REDIRECT_CHAIN", { hops: t.redirectChain.length }));
    if (t.canonical === null) out.push(mk("TECH_CANONICAL_MISSING"));
    return out;
}

export function detectGsc(rows: GscRow[]): Finding[] {
    const out: Finding[] = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.ctrPrev !== undefined && r.ctr < r.ctrPrev * 0.8 && r.ctrPrev > 0.01)
            out.push(mk("GSC_CTR_DROP", { page: i, delta: Math.round((r.ctr - r.ctrPrev) * 1000) / 10 }, r.page));
        if (r.positionPrev !== undefined && r.position > r.positionPrev + 3)
            out.push(mk("GSC_POSITION_DROP", { page: i, from: r.positionPrev, to: r.position }, r.page));
        if (r.position >= 11 && r.position <= 20)
            out.push(mk("GSC_STRIKING_DISTANCE", { page: i, pos: r.position }, r.page));
    }
    return out;
}

/** Run every applicable structural detector over a page snapshot (no GSC; that's row-based). */
export function auditPage(p: PageInput): Finding[] {
    return [
        ...detectMeta(p),
        ...detectAltTags(p),
        ...detectSchema(p),
        ...detectCwv(p),
        ...detectOnPage(p),
        ...detectTech(p),
    ];
}

// --- cross-page duplicate / self-plagiarism (site-scope; needs all pages) ---

/** Detect pages whose body substantially overlaps another page on the same site
 *  (self-plagiarism). 6-gram shingles + overlap ratio. Pure, no deps. */
export function detectDuplicatePages(
    pages: { id: string; title: string; url?: string; text: string }[],
    threshold = 0.25,
): { id: string; title: string; url?: string; similarity: number; otherTitle: string }[] {
    const SHINGLE = 6;
    const MIN = 12; // too few shingles to judge
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const shingles = pages.map((p) => {
        const w = norm(p.text);
        const set = new Set<string>();
        for (let i = 0; i + SHINGLE <= w.length; i++) set.add(w.slice(i, i + SHINGLE).join(" "));
        return set;
    });
    const out: { id: string; title: string; url?: string; similarity: number; otherTitle: string }[] = [];
    for (let i = 0; i < pages.length; i++) {
        if (shingles[i].size < MIN) continue;
        let best = 0;
        let bestJ = -1;
        for (let j = 0; j < pages.length; j++) {
            if (i === j || shingles[j].size < MIN) continue;
            let shared = 0;
            for (const s of shingles[i]) if (shingles[j].has(s)) shared++;
            const sim = shared / shingles[i].size; // fraction of i's content seen on j
            if (sim > best) { best = sim; bestJ = j; }
        }
        if (best >= threshold && bestJ >= 0) {
            out.push({ id: pages[i].id, title: pages[i].title, url: pages[i].url, similarity: Math.round(best * 100), otherTitle: pages[bestJ].title });
        }
    }
    return out;
}

/** Cluster pages whose titles target the same topic (content cannibalization) when
 *  there is no focus keyword / GSC data to rely on. Significant-token Jaccard. Pure. */
const TITLE_STOP = new Set("a an the and or for to of in on with your our how what why best top guide tips ways vs 2023 2024 2025 2026 new ultimate complete".split(" "));
export function clusterSimilarTitles(
    pages: { id: string; title: string; url?: string }[],
    threshold = 0.6,
): { keyword: string; pages: { id: string; title: string; url?: string }[] }[] {
    const tokens = pages.map((p) => new Set(p.title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !TITLE_STOP.has(w))));
    const used = new Array(pages.length).fill(false);
    const clusters: { keyword: string; pages: { id: string; title: string; url?: string }[] }[] = [];
    for (let i = 0; i < pages.length; i++) {
        if (used[i] || tokens[i].size < 2) continue;
        const group = [i];
        for (let j = i + 1; j < pages.length; j++) {
            if (used[j] || tokens[j].size < 2) continue;
            let shared = 0;
            for (const t of tokens[i]) if (tokens[j].has(t)) shared++;
            const jac = shared / new Set([...tokens[i], ...tokens[j]]).size;
            if (jac >= threshold) group.push(j);
        }
        if (group.length >= 2) {
            group.forEach((g) => (used[g] = true));
            const shared = [...tokens[i]].filter((t) => group.every((g) => tokens[g].has(t)));
            clusters.push({ keyword: (shared.length ? shared : [...tokens[i]]).slice(0, 3).join(" "), pages: group.map((g) => pages[g]) });
        }
    }
    return clusters;
}

// --- escalation (which findings deserve an AI pass) ---

export function shouldEscalate(f: Finding, minSeverity: Severity = 2): boolean {
    const c = lookupCode(f.code);
    return !!c && c.ai !== "none" && f.severity >= minSeverity;
}

/** Distinct SEO tasks that have at least one escalating finding (what to queue for AI). */
export function escalationTasks(findings: Finding[], minSeverity: Severity = 2): SeoTask[] {
    const set = new Set<SeoTask>();
    for (const f of findings) if (shouldEscalate(f, minSeverity)) set.add(f.task);
    return [...set];
}

// --- presentation layer (codes -> readable UI; the consumer never sees raw codes) ---

export interface RenderedFinding {
    code: string;
    task: SeoTask;
    severity: Severity;
    severityLabel: "Critical" | "Warning" | "Minor";
    label: string;
    explanation: string;
    fixHint: string;
    graphKey: string;
    ai: "fix" | "explain" | "none";
    values?: Finding["values"];
    ref?: string;
}

const SEVERITY_LABELS: Record<Severity, RenderedFinding["severityLabel"]> = { 3: "Critical", 2: "Warning", 1: "Minor" };

function interpolate(tpl: string, values?: Finding["values"]): string {
    if (!values) return tpl;
    return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

/** Expand a compact finding into the full, user-friendly object the UI renders. */
export function renderFinding(f: Finding): RenderedFinding | null {
    const c = lookupCode(f.code);
    if (!c) return null; // unknown code from a misbehaving model -> dropped
    return {
        code: c.code,
        task: c.task,
        severity: f.severity,
        severityLabel: SEVERITY_LABELS[f.severity],
        label: c.label,
        explanation: interpolate(c.explanation, f.values),
        fixHint: interpolate(c.fixHint, f.values),
        graphKey: c.graphKey,
        ai: c.ai,
        values: f.values,
        ref: f.ref,
    };
}

// --- compact AI output -> Findings (the L2 wire format) ---

/** The minimal shape the AI returns for an audit task: an array of coded issues. */
export interface CompactAuditOutput {
    issues: { c: string; s?: Severity; ref?: string; v?: Record<string, string | number> }[];
}

/** Convert the AI's compact coded output into Findings, dropping codes that don't
 *  belong to the task or aren't in the codebook (defends against a bad model). */
export function compactToFindings(task: SeoTask, output: CompactAuditOutput): Finding[] {
    const valid = new Set(codesForTask(task));
    const out: Finding[] = [];
    for (const it of output.issues ?? []) {
        if (!valid.has(it.c)) continue;
        const c = SEO_CODES[it.c];
        out.push({ code: it.c, task: c.task, severity: it.s ?? c.severity, values: it.v, ref: it.ref });
    }
    return out;
}

// --- change detection ---

/** Stable FNV-1a hash of the inputs that matter for an audit, so unchanged pages
 *  are skipped. Excludes volatile fields (e.g. crawl timestamps). */
export function contentHash(p: PageInput): string {
    const norm = JSON.stringify({
        t: p.metaTitle ?? "",
        d: p.metaDescription ?? "",
        k: p.focusKeyword ?? "",
        h: p.headings ?? [],
        i: (p.images ?? []).map((x) => [x.src, x.alt ?? ""]),
        l: p.internalLinkCount ?? 0,
        b: p.bodyText ?? "",
        j: p.jsonLd ?? null,
        c: p.tech?.canonical ?? null,
        n: p.tech?.noindex ?? false,
    });
    let h = 2166136261;
    for (let i = 0; i < norm.length; i++) {
        h ^= norm.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
}
