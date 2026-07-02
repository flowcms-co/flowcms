"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Disclosure, Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import CountUp from "@/components/motion/CountUp";
import Switch from "@/components/ui/Switch";
import Select from "@/components/ui/Select";
import UpgradeLock from "@/components/ui/UpgradeLock";
import { api } from "@/lib/api";
import { useSeoFixMode } from "@/lib/seoPrefs";
import { usePlan } from "@/components/providers/LicenseProvider";
import { useJobs } from "@/components/providers/JobsProvider";
import { useRevealBatch } from "@/lib/useReveal";
import FileGenModal from "@/templates/seo/FileGenModal";
import InternalLinksModal from "@/templates/seo/InternalLinksModal";
import IssueFixModal, { type FixIssue } from "@/templates/seo/IssueFixModal";
import CannibalizationFixModal, { type CannGroup } from "@/templates/seo/CannibalizationFixModal";
import BatchFixModal, { type BatchGroup } from "@/templates/seo/BatchFixModal";
import AutoApplyModal, { isSafeGroup } from "@/templates/seo/AutoApplyModal";
import { perfAdvice } from "@/lib/perfAdvice";
import { CATEGORY_PANEL } from "@/templates/seo/optimizerPanels";

// ─── types (mirror the backend /seo/scan/issues shape) ───────────────────────
type Band = "high" | "med" | "low";
type Effort = "easy" | "med" | "hard";
type FixKind = "meta" | "schema" | "faq" | "org" | "file" | "links" | "alt" | "editor" | "connect" | "cannibalization" | "instructions";
type IssuePage = {
    id: string | null; url: string | null; title: string | null; detail?: string; group?: string;
    priority?: Band; overlap?: number; matchTitle?: string;
    current?: string; currentLen?: number; recommended?: string; recommendedLen?: number;
    schemaType?: string; suggested?: number; sources?: string[]; reason?: string;
};
type IssueGroup = {
    key: string;
    title: string;
    category: string;
    scope: "page" | "site";
    severity: Band;
    effort: Effort;
    fix: FixKind;
    fixArg?: string;
    ai: "fix" | "explain" | "none";
    count: number;
    explanation: string;
    fixHint: string;
    pages: IssuePage[];
};
type CategoryMeta = { key: string; label: string; count: number };
type IssuesResult = {
    score: number | null;
    counts: { total: number; pages: number; aiFixable: number; clean: number };
    categories: CategoryMeta[];
    groups: IssueGroup[];
    quickWins: IssueGroup[];
};
type AutoConfig = {
    enabled: boolean;
    editable: boolean;
    config: { incrementalHours: number; fullHours: number; perRunCap: number };
    lastIncrementalScanAt: string | null;
    lastFullScanAt: string | null;
};

// ─── display helpers ─────────────────────────────────────────────────────────
const CAT_ICON: Record<string, string> = {
    metadata: "edit", schema: "hash", structure: "overview", content: "document", performance: "chart",
    readiness: "sparkles", links: "external", cannibalization: "copy", search: "search",
    tracking: "chart", images: "image", technical: "settings", other: "settings",
};
// Category-level badges (mockup): "High impact" / "Easy fix" pills.
const IMPACT_META: Record<Band, { label: string; cls: string }> = {
    high: { label: "High impact", cls: "bg-error/12 text-error" },
    med: { label: "Medium impact", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    low: { label: "Low impact", cls: "bg-grey/12 text-grey" },
};
const FIX_META: Record<Effort, { label: string; cls: string }> = {
    easy: { label: "Easy fix", cls: "bg-success/12 text-[#0a7a5f] dark:text-success" },
    med: { label: "Medium fix", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    hard: { label: "Hard fix", cls: "bg-primary/12 text-primary dark:text-lilac" },
};
// Per-category icon colour (mockup colours each category's icon by identity, not severity).
const CAT_TINT: Record<string, { bg: string; fill: string }> = {
    metadata: { bg: "bg-primary/12", fill: "fill-primary" },
    schema: { bg: "bg-violet-500/12", fill: "fill-violet-500" },
    structure: { bg: "bg-indigo-500/12", fill: "fill-indigo-500" },
    content: { bg: "bg-secondary/12", fill: "fill-secondary" },
    performance: { bg: "bg-success/12", fill: "fill-success" },
    readiness: { bg: "bg-fuchsia-500/12", fill: "fill-fuchsia-500" },
    links: { bg: "bg-teal-500/12", fill: "fill-teal-500" },
    cannibalization: { bg: "bg-amber-500/12", fill: "fill-amber-500" },
    search: { bg: "bg-sky-500/12", fill: "fill-sky-500" },
    tracking: { bg: "bg-cyan-500/12", fill: "fill-cyan-500" },
    images: { bg: "bg-rose-500/12", fill: "fill-rose-500" },
    technical: { bg: "bg-slate-500/12", fill: "fill-slate-500" },
    other: { bg: "bg-grey/12", fill: "fill-grey" },
};
const catTint = (key: string) => CAT_TINT[key] ?? { bg: "bg-grey/12", fill: "fill-grey" };
// Quick-win tiles cycle a small accent palette (mockup shows a colourful icon per card).
const QUICK_TINT: { bg: string; fill: string }[] = [
    { bg: "bg-error/10", fill: "fill-error" },
    { bg: "bg-amber-500/12", fill: "fill-amber-500" },
    { bg: "bg-success/12", fill: "fill-success" },
    { bg: "bg-primary/12", fill: "fill-primary" },
];
const SEV_RANK: Record<Band, number> = { high: 3, med: 2, low: 1 };
const EFFORT_RANK: Record<Effort, number> = { easy: 3, med: 2, hard: 1 };

type Counts = { pages: number; total: number; aiFixable: number; clean: number };
const SNAP_KEY = "flow:seoOptimizerSnapshot";
function readSnap(): { counts: Counts; at: string } | null {
    try { const s = localStorage.getItem(SNAP_KEY); return s ? (JSON.parse(s) as { counts: Counts; at: string }) : null; } catch { return null; }
}
function writeSnap(counts: Counts, at: string) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify({ counts, at })); } catch { /* ignore */ }
}
function everyLabel(h: number) {
    if (h <= 1) return "hourly";
    if (h === 24) return "daily";
    if (h === 168) return "weekly";
    if (h % 24 === 0) return `every ${h / 24} days`;
    return `every ${h}h`;
}
/** Friendly "x ago" for the last-run stamp. */
function relTime(iso: string | null): string | null {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return null;
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    const d = Math.round(h / 24);
    return `${d} day${d === 1 ? "" : "s"} ago`;
}
type SortKey = "priority" | "effort" | "pages";

const Optimizer = () => {
    const router = useRouter();
    const { has } = usePlan();
    const { enqueue } = useJobs();
    const [fixMode, setFixMode] = useSeoFixMode();
    const autoUnlocked = has("seo_automation");

    const [data, setData] = useState<IssuesResult | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const [sort, setSort] = useState<SortKey>("priority");
    const [cat, setCat] = useState<string>("all");

    // Fix surfaces
    const [fixIssue, setFixIssue] = useState<FixIssue | null>(null);
    const [fileKind, setFileKind] = useState<"llms" | "robots" | "sitemap" | null>(null);
    const [linksOpen, setLinksOpen] = useState(false);
    const [cann, setCann] = useState<CannGroup | null>(null);
    const [batch, setBatch] = useState<BatchGroup | null>(null);
    const [autoOpen, setAutoOpen] = useState(false);
    const [instr, setInstr] = useState<IssueGroup | null>(null);
    const [ignoreTarget, setIgnoreTarget] = useState<{ g: IssueGroup; p?: IssuePage } | null>(null);

    // Scheduled AI auditing (Pro+)
    const [auto, setAuto] = useState<AutoConfig | null>(null);
    const [autoSaving, setAutoSaving] = useState(false);
    const [lastRunAt, setLastRunAt] = useState<string | null>(null);
    const [deltas, setDeltas] = useState<Counts | null>(null);

    const scope = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const load = async (): Promise<IssuesResult | null> => {
        try {
            const d = await api<IssuesResult>("/seo/scan/issues");
            setData(d);
            const snap = readSnap();
            if (snap) {
                setDeltas({
                    pages: d.counts.pages - snap.counts.pages,
                    total: d.counts.total - snap.counts.total,
                    aiFixable: d.counts.aiFixable - snap.counts.aiFixable,
                    clean: d.counts.clean - snap.counts.clean,
                });
                setLastRunAt(snap.at);
            } else {
                // First visit: seed the baseline so future deltas are real "since last audit".
                const now = new Date().toISOString();
                writeSnap(d.counts, now);
                setDeltas({ pages: 0, total: 0, aiFixable: 0, clean: 0 });
                setLastRunAt(now);
            }
            return d;
        } catch {
            setError("Couldn't load the audit.");
            return null;
        } finally {
            setLoaded(true);
        }
    };
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount
        void load();
    }, []);

    useEffect(() => {
        if (!autoUnlocked) return;
        void api<AutoConfig>("/ee/seo-automation").then(setAuto).catch(() => {});
    }, [autoUnlocked]);

    const runAudit = async () => {
        setRunning(true);
        setError("");
        try {
            await api("/seo/scan/run", { method: "POST" });
            const d = await load(); // computes deltas vs the previous audit's baseline
            if (d) { const now = new Date().toISOString(); writeSnap(d.counts, now); setLastRunAt(now); }
        } catch {
            setError("Couldn't run the audit.");
        } finally {
            setRunning(false);
        }
    };

    const toggleAuto = async (next: boolean) => {
        if (!auto) return;
        setAuto({ ...auto, enabled: next });
        setAutoSaving(true);
        try {
            setAuto(await api<AutoConfig>("/ee/seo-automation", { method: "PUT", body: JSON.stringify({ enabled: next }) }));
        } catch {
            setAuto((a) => (a ? { ...a, enabled: !next } : a));
        } finally {
            setAutoSaving(false);
        }
    };

    const pagesAudited = data?.counts.pages ?? 0;
    const issuesTotal = data?.counts.total ?? 0;
    const aiFixableCount = data?.counts.aiFixable ?? 0;
    const cleanPages = data?.counts.clean ?? 0;
    const lastRunLabel = relTime(lastRunAt ?? auto?.lastFullScanAt ?? auto?.lastIncrementalScanAt ?? null);

    // Count of deterministic "safe" fixes pending (drives the auto-apply button label).
    const safeCount = useMemo(() => {
        if (!data) return 0;
        let n = 0;
        for (const g of data.groups.filter(isSafeGroup)) {
            n += g.key === "INTERNAL_LINK_OPP" || g.fix === "links" ? 1 : g.pages.filter((p) => p.id).length;
        }
        return n;
    }, [data]);

    const sortedGroups = useMemo(() => {
        if (!data) return [];
        const gs = data.groups.filter((g) => cat === "all" || g.category === cat).slice();
        gs.sort((a, b) => {
            if (sort === "pages") return b.count - a.count;
            if (sort === "effort") return EFFORT_RANK[b.effort] - EFFORT_RANK[a.effort] || SEV_RANK[b.severity] - SEV_RANK[a.severity];
            return SEV_RANK[b.severity] - SEV_RANK[a.severity] || EFFORT_RANK[b.effort] - EFFORT_RANK[a.effort] || b.count - a.count;
        });
        return gs;
    }, [data, cat, sort]);

    // Group the sorted issues by category for the accordions (respects current sort within each).
    const byCategory = useMemo(() => {
        const map = new Map<string, { meta: CategoryMeta; groups: IssueGroup[] }>();
        if (!data) return [];
        const catMeta = new Map(data.categories.map((c) => [c.key, c]));
        for (const g of sortedGroups) {
            const m = map.get(g.category) ?? { meta: catMeta.get(g.category) ?? { key: g.category, label: g.category, count: 0 }, groups: [] };
            m.groups.push(g);
            map.set(g.category, m);
        }
        return [...map.values()];
    }, [data, sortedGroups]);

    // Quick wins: top 4 fixable, high-impact + low-effort first (mockup shows 4 cards).
    const quickWins = useMemo(() => {
        // Draw from every fixable, non-empty group (skip count-0 connector "instructions" cards)
        // so the row fills up to 4 meaningful cards even when the backend pre-picks fewer.
        const wins = (data?.groups ?? []).filter((g) => g.count > 0 && g.fix !== "instructions");
        return [...wins]
            .sort((a, b) =>
                (a.effort === "easy" ? 0 : 1) - (b.effort === "easy" ? 0 : 1) ||
                SEV_RANK[b.severity] - SEV_RANK[a.severity] ||
                b.count - a.count,
            )
            .slice(0, 4);
    }, [data]);

    // Per-category aggregates for the accordion header (impact, effort, total instances).
    const catTotal = (groups: IssueGroup[]) => groups.reduce((s, g) => s + g.count, 0);
    const catImpact = (groups: IssueGroup[]): Band => (groups.some((g) => g.severity === "high") ? "high" : groups.some((g) => g.severity === "med") ? "med" : "low");
    const catEffort = (groups: IssueGroup[]): Effort => (groups.some((g) => g.effort === "easy") ? "easy" : groups.some((g) => g.effort === "med") ? "med" : "hard");

    useRevealBatch(scope, ".reveal-up", [loaded, cat, sort, data?.groups.length]);

    /** Issues that open the in-place IssueFixModal (a managed page + an editable field). */
    const inPlace = (g: IssueGroup) => g.fix === "meta" || g.fix === "schema" || g.fix === "faq" || g.fix === "alt" || g.fix === "editor";
    /** Issues with an optional AI assist (a direct generator/rewrite exists). */
    const aiSecondary = (g: IssueGroup) =>
        g.fix === "meta" || g.fix === "schema" || g.fix === "faq" || g.fix === "alt" || g.fix === "cannibalization" ||
        g.key === "THIN_CONTENT" || g.key === "READABILITY_HARD" || g.key === "DUPLICATE_CONTENT";

    // A group affecting MORE THAN ONE managed page, fixable per page → the AI fix
    // batches across every page (one click fixes all, not just the first). For these
    // we hide the single row-level manual "Fix" (manual fixing stays per page in Review).
    const managedPages = (g: IssueGroup) => g.pages.filter((p) => p.id);
    const isBatchable = (g: IssueGroup) => inPlace(g) && managedPages(g).length > 1;

    // Open a fix. `ai` = the optional AI-assist path (auto-runs inside the modal).
    const openFix = (g: IssueGroup, page: IssuePage | undefined, ai: boolean) => {
        const p = page ?? g.pages[0];
        // Internal links: in-place apply modal.
        if (g.fix === "links" || g.key === "INTERNAL_LINKS_FEW") { setLinksOpen(true); return; }
        if (g.fix === "cannibalization") { setCann({ title: g.title, explanation: g.explanation, fixHint: g.fixHint, pages: g.pages }); return; }
        if (g.fix === "file") { setFileKind((g.fixArg as "llms" | "robots" | "sitemap") ?? "llms"); return; }
        if (g.fix === "org") { router.push("/content/schema"); return; }
        if (g.fix === "connect" || g.fix === "instructions") { setInstr(g); return; }
        // In-place per-page fix.
        if (inPlace(g) && p?.id) {
            setFixIssue({ id: p.id, path: p.url ?? "", title: p.title ?? g.title, key: g.key, fix: g.fix, autoAi: ai });
            return;
        }
        setInstr(g);
    };
    const manualFix = (g: IssueGroup, page?: IssuePage) => openFix(g, page, false);
    const onIgnore = (g: IssueGroup, page?: IssuePage) => setIgnoreTarget({ g, p: page });
    // Row-level "Fix with AI": batch across all pages when the group has many; else single.
    const aiFix = (g: IssueGroup, page?: IssuePage) => {
        if (!page && isBatchable(g)) { setBatch({ key: g.key, title: g.title, fix: g.fix, pages: g.pages }); return; }
        openFix(g, page, true);
    };

    // Primary (manual) action label.
    const manualLabel = (g: IssueGroup) => {
        switch (g.fix) {
            case "file": return "Generate";
            case "links": return "Review & add";
            case "org": return "Open builder";
            case "connect": return "How to connect";
            case "cannibalization": return "Resolve";
            case "instructions": return "How to fix";
            default: return "Fix";
        }
    };

    // Category-level "Fix all with AI": enqueue a background batch-fix job for every
    // in-place-fixable group in the category (reuses the existing job pipeline; each
    // shows in the bottom toast). No new behaviour, just composed across sub-issues.
    const categoryCanFix = (groups: IssueGroup[]) => groups.some((g) => inPlace(g) && g.pages.some((p) => p.id));
    const categoryFixAll = async (groups: IssueGroup[]) => {
        for (const g of groups) {
            const pages = g.pages.filter((p) => p.id);
            if (!inPlace(g) || pages.length === 0) continue;
            await enqueue(
                "/seo/scan/jobs/batch-fix",
                { fix: g.fix, key: g.key, title: g.title, pages: pages.map((p) => ({ id: p.id, url: p.url })) },
                `Fix ${pages.length} page${pages.length === 1 ? "" : "s"} · ${g.title}`,
            );
        }
    };

    return (
        <div ref={scope} className="flex flex-col gap-6">
            {/* ---------- overview: 4 KPI cards + run audit ---------- */}
            <div>
                <div className="mb-3 flex items-center justify-between gap-4">
                    <h2 className="font-poppins text-h5 font-semibold text-black dark:text-white">Audit overview</h2>
                    <div className="flex shrink-0 items-center gap-3">
                        {lastRunLabel && <span className="hidden text-caption-2 text-grey sm:block">Last run: {lastRunLabel}</span>}
                        <button type="button" onClick={() => void runAudit()} disabled={running} data-tour="opt-run" className="btn-primary btn-md gap-2 disabled:opacity-60">
                            <Icon name="search" className="h-4 w-4 fill-white" />
                            {running ? "Scanning…" : "Run audit"}
                        </button>
                    </div>
                </div>
                <div data-tour="opt-stats" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                    <Card reveal={false} className="!p-5">
                        <StatCol icon="document" tint="bg-primary/12" fill="fill-primary" value={pagesAudited} label="Pages audited" delta={deltas?.pages} deltaCls="text-success" />
                    </Card>
                    <Card reveal={false} className="!p-5">
                        <StatCol icon="info" tint="bg-amber-500/15" fill="fill-amber-500" value={issuesTotal} label="Issues found" delta={deltas?.total} deltaCls="text-amber-600 dark:text-amber-400" />
                    </Card>
                    <Card reveal={false} className="!p-5">
                        <StatCol icon="sparkles" tint="bg-primary/12" fill="fill-primary" value={aiFixableCount} label="AI-fixable" delta={deltas?.aiFixable} deltaCls="text-primary dark:text-lilac" />
                    </Card>
                    <Card reveal={false} className="!p-5">
                        <StatCol icon="check" tint="bg-success/15" fill="fill-success" value={cleanPages} label="Clean pages" delta={deltas?.clean} deltaCls="text-success" />
                    </Card>
                </div>
            </div>

            {/* ---------- fix application + automatic AI auditing (mockup) ---------- */}
            <div className="grid gap-4 lg:grid-cols-2">
                <Card id="tour-opt-fixmode" reveal={false} className="flex flex-col !p-6">
                    <div className="mb-1 flex items-center gap-2">
                        <Icon name="lock" className="h-5 w-5 fill-primary" />
                        <h3 className="font-poppins text-title font-semibold text-black dark:text-white">Fix application</h3>
                    </div>
                    <p className="mb-4 text-body-sm text-grey">Review AI suggestions before applying them to your site.</p>
                    <div className="flex flex-col gap-2.5">
                        <OptionRow icon="eye" title="Review first" desc="See all suggested fixes and their impact." active={fixMode === "review"} onClick={() => setFixMode("review")} right={<Icon name="arrow-right" className="h-4 w-4 shrink-0 fill-grey" />} />
                        <OptionRow icon="sparkles" title="Auto-apply safe" desc="Automatically apply safe, low-risk fixes." active={fixMode === "auto"} onClick={() => setFixMode("auto")} right={<Icon name="arrow-right" className="h-4 w-4 shrink-0 fill-grey" />} />
                        <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/[0.06] p-3.5 dark:bg-primary/10">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15"><Icon name="check" className="h-5 w-5 fill-primary" /></span>
                            <div className="min-w-0 flex-1">
                                <p className="text-body-sm font-semibold text-primary">{safeCount > 0 ? `Apply ${safeCount} safe fix${safeCount === 1 ? "" : "es"} now` : "No safe fixes pending"}</p>
                                <p className="text-caption-2 text-grey">Test the flow with a single safe fix.</p>
                            </div>
                            <button type="button" onClick={() => setAutoOpen(true)} disabled={safeCount === 0} className="btn-primary btn-sm shrink-0 disabled:opacity-50">Apply now</button>
                        </div>
                    </div>
                    <div className="mt-auto flex items-start gap-2 pt-4">
                        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 fill-grey" />
                        <p className="text-caption-2 text-grey">Deterministic checks are free. AI fixes still route free &rarr; paid by plan.</p>
                    </div>
                </Card>

                <UpgradeLock
                    feature="seo_automation"
                    icon="sparkles"
                    title="Automatic AI auditing"
                    description="Run AI audits automatically on a schedule and get notified the moment new issues appear."
                    includes={["Scheduled full and incremental audits", "Automatic issue detection", "Alerts when new issues appear"]}
                >
                    <Card reveal={false} className="flex flex-col !p-6">
                        <div className="mb-1 flex items-center gap-2">
                            <Icon name="sparkles" className="h-5 w-5 fill-primary" />
                            <h3 className="font-poppins text-title font-semibold text-black dark:text-white">Automatic AI auditing</h3>
                        </div>
                        <p className="mb-4 text-body-sm text-grey">Run AI audits automatically on a schedule and stay ahead of new issues.</p>
                        <div className="flex flex-col gap-2.5">
                            <OptionRow icon="calendar" title="Scheduled audits" desc="How often we run a full site audit."
                                right={<span className="shrink-0 text-caption-1 font-semibold text-primary dark:text-lilac">{auto ? everyLabel(auto.config.fullHours).replace(/^\w/, (c) => c.toUpperCase()) : "Weekly"}</span>} />
                            <OptionRow icon="clock" title="Incremental checks" desc="Lighter checks between full audits."
                                right={<span className="shrink-0 text-caption-1 font-semibold text-primary dark:text-lilac">{auto ? everyLabel(auto.config.incrementalHours).replace(/^\w/, (c) => c.toUpperCase()) : "Daily"}</span>} />
                            <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/[0.06] p-3.5 dark:bg-primary/10">
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15"><Icon name="sparkles" className="h-5 w-5 fill-primary" /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-body-sm font-semibold text-primary">Enable automatic audits</p>
                                    <p className="text-caption-2 text-grey">Audit on your schedule, no manual runs.</p>
                                </div>
                                <Switch checked={!!auto?.enabled} onChange={toggleAuto} aria-label="Enable automatic audits" />
                            </div>
                        </div>
                        <div className="mt-auto pt-4">
                            <p className="text-caption-2 text-grey">
                                {auto
                                    ? auto.enabled
                                        ? `On. ${everyLabel(auto.config.incrementalHours)} incremental, ${everyLabel(auto.config.fullHours)} full${autoSaving ? " · saving…" : ""}.`
                                        : "Off. Toggle on to schedule the AI pass."
                                    : "Loading…"}
                            </p>
                        </div>
                    </Card>
                </UpgradeLock>
            </div>

            {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-caption-1 text-error">{error}</p>}

            {/* ---------- quick wins ---------- */}
            {data && quickWins.length > 0 && (
                <div>
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="font-poppins text-h5 font-semibold text-black dark:text-white">Quick wins</h2>
                        <button type="button" onClick={() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex items-center gap-1 text-caption-1 font-semibold text-primary hover:text-primary/80">
                            View all quick wins <Icon name="arrow-right" className="h-3.5 w-3.5 fill-current" />
                        </button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {quickWins.map((g, i) => {
                            const ai = aiSecondary(g);
                            const n = g.pages.filter((p) => p.id).length || g.count;
                            const tint = QUICK_TINT[i % QUICK_TINT.length];
                            return (
                                <Card key={g.key} className="flex flex-col !p-5">
                                    <div className="flex items-start gap-3">
                                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tint.bg}`}>
                                            <Icon name={CAT_ICON[g.category] ?? "settings"} className={`h-5 w-5 ${tint.fill}`} />
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="font-poppins text-body font-semibold leading-snug text-black dark:text-white">{g.count} {g.title}</h3>
                                            <p className="mt-0.5 text-caption-2 text-grey">{n} {g.scope === "site" ? (n === 1 ? "item" : "items") : `page${n === 1 ? "" : "s"}`}</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => (ai ? aiFix(g) : manualFix(g))}
                                        className="btn-secondary btn-sm mt-4 w-full justify-center gap-1.5"
                                    >
                                        {ai ? <><Icon name="sparkles" className="h-4 w-4 fill-primary" /> Fix all with AI</> : manualLabel(g)}
                                    </button>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ---------- filters ---------- */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                    <CatChip active={cat === "all"} onClick={() => setCat("all")} label="All issues" count={data?.groups.length ?? 0} />
                    {data?.categories.map((c) => (
                        <CatChip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)} label={c.label} count={c.count} />
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-caption-2 text-grey">Sort by</span>
                    <Select
                        variant="filter"
                        ariaLabel="Sort issues"
                        value={sort}
                        onChange={(v) => setSort(v as SortKey)}
                        options={[{ value: "priority", label: "Priority" }, { value: "effort", label: "Effort" }, { value: "pages", label: "Pages affected" }]}
                    />
                </div>
            </div>

            {/* ---------- grouped issues ---------- */}
            {!loaded ? (
                <Card className="text-body-sm text-grey">Loading audit…</Card>
            ) : !data || data.groups.length === 0 ? (
                <Card className="flex flex-col items-center gap-2 py-10 text-center">
                    <Icon name="check" className="h-8 w-8 fill-success" />
                    <p className="text-body-sm text-black dark:text-white">No issues found.</p>
                    <p className="text-caption-2 text-grey">Run the audit to scan your published pages.</p>
                </Card>
            ) : byCategory.length === 0 ? (
                <Card className="py-8 text-center text-body-sm text-grey">Nothing in this category.</Card>
            ) : (
                <div ref={listRef} data-tour="opt-issues" className="flex flex-col gap-3 scroll-mt-4">
                    {byCategory.map(({ meta, groups }) => (
                        <CategoryRow
                            key={meta.key}
                            meta={meta}
                            groups={groups}
                            defaultOpen={cat !== "all" || SEV_RANK[groups[0]?.severity] === 3}
                            total={catTotal(groups)}
                            impact={catImpact(groups)}
                            effort={catEffort(groups)}
                            canFix={categoryCanFix(groups)}
                            onFixAll={() => void categoryFixAll(groups)}
                            onViewAll={() => { setCat(meta.key); listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                            onLinks={() => setLinksOpen(true)}
                            enqueue={enqueue}
                            onManual={manualFix}
                            onAi={aiFix}
                            onIgnore={onIgnore}
                            onCluster={(g) => setCann({ title: g.title, explanation: g.explanation, fixHint: g.fixHint, pages: g.pages })}
                            manualLabel={manualLabel}
                            aiSecondary={aiSecondary}
                            isBatchable={isBatchable}
                        />
                    ))}
                </div>
            )}

            <p className="text-caption-1 text-grey">
                Deterministic checks run automatically and cost nothing. AI fixes route to the cheapest capable model your plan allows and are shown to review before they are applied.
            </p>

            {/* ---------- fix surfaces ---------- */}
            <IssueFixModal issue={fixIssue} onClose={() => setFixIssue(null)} onSaved={() => void load()} />
            <FileGenModal open={!!fileKind} onClose={() => setFileKind(null)} kind={fileKind} />
            <InternalLinksModal open={linksOpen} onClose={() => setLinksOpen(false)} onApplied={() => void load()} />
            <CannibalizationFixModal group={cann} onClose={() => setCann(null)} onApplied={() => void load()} />
            <BatchFixModal group={batch} onClose={() => setBatch(null)} onApplied={() => void load()} />
            <AutoApplyModal open={autoOpen} groups={data?.groups ?? []} onClose={() => setAutoOpen(false)} onApplied={() => void load()} />
            <InstructionsModal group={instr} onClose={() => setInstr(null)} />
            <IgnoreScopeModal target={ignoreTarget} onClose={() => setIgnoreTarget(null)} onSaved={() => void load()} />
        </div>
    );
};

// ─── category accordion (mockup top-level row) ───────────────────────────────
type RowHelpers = {
    onManual: (g: IssueGroup, p?: IssuePage) => void;
    onAi: (g: IssueGroup, p?: IssuePage) => void;
    onIgnore: (g: IssueGroup, p?: IssuePage) => void;
    onCluster: (g: IssueGroup) => void;
    manualLabel: (g: IssueGroup) => string;
    aiSecondary: (g: IssueGroup) => boolean;
    isBatchable: (g: IssueGroup) => boolean;
};

const CategoryRow = ({ meta, groups, defaultOpen, total, impact, effort, canFix, onFixAll, onViewAll, onLinks, enqueue, ...h }: {
    meta: CategoryMeta; groups: IssueGroup[]; defaultOpen: boolean; total: number; impact: Band; effort: Effort; canFix: boolean; onFixAll: () => void; onViewAll?: () => void;
    onLinks: () => void; enqueue: (url: string, payload: unknown, label: string) => void;
} & RowHelpers) => {
    const im = IMPACT_META[impact];
    const Panel = CATEGORY_PANEL[meta.key];
    return (
        <Card reveal={false} className="reveal-up !p-0">
            <Disclosure defaultOpen={defaultOpen}>
                {({ open }) => (
                    <>
                        <div className="flex flex-wrap items-center gap-3 p-5">
                            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${catTint(meta.key).bg}`}>
                                <Icon name={CAT_ICON[meta.key] ?? "settings"} className={`h-5 w-5 ${catTint(meta.key).fill}`} />
                            </span>
                            <span className="font-poppins text-title font-semibold text-black dark:text-white">{meta.label}</span>
                            <span className="grid h-6 min-w-6 place-items-center rounded-md bg-lavender-mist px-1.5 text-caption-2 font-semibold text-grey dark:bg-dark-3">{total}</span>
                            <span className={`hidden rounded-md px-2 py-0.5 text-caption-2 font-semibold sm:inline ${im.cls}`}>{im.label}</span>
                            <span className={`hidden rounded-md px-2 py-0.5 text-caption-2 font-semibold sm:inline ${FIX_META[effort].cls}`}>{FIX_META[effort].label}</span>
                            <span className="ml-auto flex items-center gap-2">
                                <Disclosure.Button className="btn-secondary btn-sm">Review issues</Disclosure.Button>
                                {canFix && (
                                    <button type="button" onClick={onFixAll} className="btn-primary btn-sm gap-1.5">
                                        <Icon name="sparkles" className="h-4 w-4 fill-white" /> Fix all with AI
                                    </button>
                                )}
                                <Disclosure.Button className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-lavender-mist dark:hover:bg-dark-3" aria-label="Toggle">
                                    <Icon name="arrow-down" className={`h-4 w-4 fill-current transition-transform ${open ? "rotate-180" : ""}`} />
                                </Disclosure.Button>
                            </span>
                        </div>
                        <Disclosure.Panel className="border-t border-grey-light/60 p-3 dark:border-grey-light/10 sm:p-4">
                            {Panel ? (
                                <Panel groups={groups} onManual={h.onManual} onAi={h.onAi} onIgnore={h.onIgnore} onCluster={h.onCluster} onLinks={onLinks} enqueue={enqueue} />
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {groups.map((g) => <SubIssueRow key={g.key} g={g} {...h} />)}
                                </div>
                            )}
                            {!Panel && onViewAll && total > 1 && groups.length > 1 && (
                                <div className="mt-3 flex justify-center">
                                    <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 text-caption-1 font-semibold text-primary hover:text-primary/80">
                                        View all {meta.label.toLowerCase()} issues ({total})
                                        <Icon name="arrow-down" className="h-3.5 w-3.5 fill-current" />
                                    </button>
                                </div>
                            )}
                        </Disclosure.Panel>
                    </>
                )}
            </Disclosure>
        </Card>
    );
};

// ─── sub-issue row (one codebook group inside a category) ─────────────────────
const SubIssueRow = ({ g, onManual, onAi, onIgnore, onCluster, manualLabel, aiSecondary, isBatchable }: { g: IssueGroup } & RowHelpers) => {
    const [open, setOpen] = useState(false);
    const perPageFix = g.fix === "meta" || g.fix === "schema" || g.fix === "faq" || g.fix === "alt" || g.fix === "editor";
    const batch = isBatchable(g);
    const managed = g.pages.filter((p) => p.id).length;
    const batchDeterministic = g.key === "TECH_CANONICAL_MISSING" || g.key === "TECH_NOINDEX";
    const isCannibal = g.key === "CANNIBALIZATION";
    const expandable = g.pages.length > 0;
    const ai = aiSecondary(g);
    const countLabel = `${g.count} ${g.scope === "site" ? (g.count === 1 ? "issue" : "issues") : `page${g.count === 1 ? "" : "s"}`}`;

    // Cannibalization: fold pages into clusters keyed by the competing keyword.
    const clusters = useMemo(() => {
        if (!isCannibal) return [];
        const by = new Map<string, IssuePage[]>();
        for (const p of g.pages) { const k = p.group ?? "—"; by.set(k, [...(by.get(k) ?? []), p]); }
        return [...by.entries()].map(([keyword, pages]) => ({ keyword, pages }));
    }, [g, isCannibal]);

    // Header right-hand action: the single primary "Fix" (batch when many pages).
    const primaryFix = () => (batch ? onAi(g) : onManual(g));
    const primaryLabel = batch ? (batchDeterministic ? `Fix all ${managed}` : `Fix all ${managed} with AI`) : manualLabel(g);

    return (
        <div className="rounded-2xl bg-white ring-1 ring-grey-light/70 dark:bg-dark-1 dark:ring-grey-light/10">
            <div className="flex flex-wrap items-center gap-3 p-4">
                {expandable ? (
                    <button type="button" onClick={() => setOpen((o) => !o)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-grey hover:bg-lavender-mist dark:hover:bg-dark-3" aria-label={open ? "Collapse" : "Expand"}>
                        <Icon name="arrow-down" className={`h-4 w-4 fill-current transition-transform ${open ? "" : "-rotate-90"}`} />
                    </button>
                ) : <span className="w-7 shrink-0" aria-hidden />}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-body-sm font-semibold text-black dark:text-white">{g.title}</span>
                        <span className="grid h-5 min-w-5 place-items-center rounded-md bg-lavender-mist px-1.5 text-caption-2 font-semibold text-grey dark:bg-dark-3">{g.count}</span>
                    </div>
                    <p className="mt-0.5 truncate text-caption-2 text-grey">{g.explanation}</p>
                </div>
                <span className="hidden shrink-0 text-caption-2 text-grey sm:block">{countLabel}</span>
                {!isCannibal && (
                    <div className="flex shrink-0 items-center gap-2">
                        {expandable && (
                            <button type="button" onClick={() => setOpen((o) => !o)} className="btn-secondary btn-sm">Review</button>
                        )}
                        <IgnoreButton onClick={() => onIgnore(g)} />
                        <button type="button" onClick={primaryFix} className="btn-primary btn-sm gap-1.5">
                            {batch && !batchDeterministic && <Icon name="sparkles" className="h-4 w-4 fill-white" />}
                            {primaryLabel}
                        </button>
                    </div>
                )}
                {isCannibal && (
                    <div className="flex shrink-0 items-center gap-2">
                        <IgnoreButton onClick={() => onIgnore(g)} />
                        {expandable && <button type="button" onClick={() => setOpen((o) => !o)} className="btn-secondary btn-sm">Review</button>}
                    </div>
                )}
            </div>

            {open && isCannibal && (
                <div className="flex flex-col gap-2 px-4 pb-4">
                    {clusters.map((c) => <ClusterRow key={c.keyword} keyword={c.keyword} pages={c.pages} onOpen={() => onCluster(g)} />)}
                </div>
            )}
            {open && !isCannibal && g.pages.length > 0 && (
                <div className="flex flex-col gap-2 px-4 pb-4">
                    {g.pages.slice(0, 20).map((p, i) => (
                        <div key={`${p.id ?? p.url ?? i}`} className="rounded-xl bg-grey-light/15 p-3 ring-1 ring-grey-light/50 dark:bg-dark-3/30 dark:ring-grey-light/10">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10">
                                    <Icon name="document" className="h-5 w-5 fill-primary" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <span className="block truncate text-body-sm font-semibold text-black dark:text-white">{p.title ?? p.url ?? "Untitled"}</span>
                                    {p.url && (
                                        <span className="mt-0.5 flex items-center gap-1 text-caption-2 text-grey">
                                            <Icon name="compass" className="h-3 w-3 fill-grey" /> <span className="truncate">{p.url}</span>
                                        </span>
                                    )}
                                </div>
                                {p.url && (
                                    <a href={p.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm shrink-0 gap-1 text-primary">
                                        Open <Icon name="external" className="h-3.5 w-3.5 fill-primary" />
                                    </a>
                                )}
                            </div>
                            {(g.fixHint || g.explanation) && (
                                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-lavender-mist/70 p-3 dark:bg-dark-3/50">
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500/15">
                                        <Icon name="info" className="h-4 w-4 fill-amber-500" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <span className="block text-caption-1 font-semibold text-black dark:text-white">Recommendation</span>
                                        <p className="text-caption-2 text-grey">{p.detail ?? g.fixHint ?? g.explanation}</p>
                                    </div>
                                    {perPageFix && p.id && (
                                        <div className="flex shrink-0 items-center gap-2">
                                            <button type="button" onClick={() => onManual(g, p)} className="btn-secondary btn-sm">Preview</button>
                                            <IgnoreButton onClick={() => onIgnore(g, p)} />
                                            <button type="button" onClick={() => (ai ? onAi(g, p) : onManual(g, p))} className="btn-primary btn-sm">Fix</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {g.pages.length > 20 && <p className="px-1 text-caption-2 text-grey">+ {g.pages.length - 20} more pages</p>}
                </div>
            )}
        </div>
    );
};

// ─── cluster row (competing-page group inside cannibalization) ────────────────
const ClusterRow = ({ keyword, pages, onOpen }: { keyword: string; pages: IssuePage[]; onOpen: () => void }) => {
    const [open, setOpen] = useState(false);
    const n = pages.length;
    const band: Band = n >= 5 ? "high" : n >= 3 ? "med" : "low";
    const im = IMPACT_META[band];
    // Surface a similarity % only if a page detail carries one (e.g. duplicate overlap).
    const pct = pages.map((p) => p.detail?.match(/(\d+)%/)?.[1]).find(Boolean);
    return (
        <div className="rounded-xl bg-lavender-mist/40 p-3 dark:bg-dark-3/40">
            <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10">
                    <Icon name="copy" className="h-4 w-4 fill-primary" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-body-sm font-semibold text-black dark:text-white">{keyword}</span>
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-caption-2 font-semibold ${im.cls}`}>{im.label}</span>
                    </div>
                    <p className="mt-0.5 text-caption-2 text-grey">{n} page{n === 1 ? "" : "s"} competing{pct ? ` • ${pct}% similarity` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost btn-sm gap-1">
                        Review cluster
                        <Icon name="arrow-down" className={`h-3.5 w-3.5 fill-current transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    <button type="button" onClick={onOpen} className="btn-primary btn-sm gap-1.5">
                        <Icon name="sparkles" className="h-4 w-4 fill-white" /> Generate merge plan
                    </button>
                </div>
            </div>
            {open && (
                <ul className="mt-2.5 flex flex-col gap-1 rounded-lg bg-white p-2.5 dark:bg-dark-1">
                    {pages.map((p, i) => (
                        <li key={`${p.id ?? p.url ?? i}`} className="flex items-center gap-2 text-caption-1 text-black dark:text-white">
                            <Icon name={i === 0 ? "check" : "document"} className={`h-3.5 w-3.5 shrink-0 ${i === 0 ? "fill-success" : "fill-grey/60"}`} />
                            <span className="truncate">{p.title ?? p.url ?? "Untitled"}</span>
                            {i === 0 && <span className="shrink-0 rounded bg-success/12 px-1.5 text-[0.625rem] font-bold uppercase tracking-wide text-[#0a7a5f] dark:text-success">Primary</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// Small in-table "Ignore" affordance (opens the scope modal: this page vs all of this type).
const IgnoreButton = ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick} title="Ignore this issue" aria-label="Ignore this issue" className="btn-ghost btn-sm gap-1 text-grey hover:text-error">
        <Icon name="close" className="h-3.5 w-3.5 fill-current" /> Ignore
    </button>
);

// One stat column in a KPI card (icon tile + value + label + delta line).
const StatCol = ({ icon, tint, fill, value, label, delta, deltaCls }: {
    icon: string; tint: string; fill: string; value: number; label: string;
    delta?: number; deltaCls: string;
}) => (
    <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tint}`}><Icon name={icon} className={`h-6 w-6 ${fill}`} /></span>
            <div className="min-w-0">
                <CountUp value={value} className="block font-poppins text-h2 font-bold leading-none text-black dark:text-white" />
                <div className="mt-1.5 text-caption-1 text-grey">{label}</div>
            </div>
        </div>
        {delta != null && (
            <div className={`flex items-center gap-1 text-caption-2 ${delta === 0 ? "text-grey" : deltaCls}`}>
                {delta !== 0 && <Icon name="arrow-right" className={`h-3.5 w-3.5 fill-current ${delta > 0 ? "-rotate-45" : "rotate-45"}`} />}
                <span className="font-semibold">{delta === 0 ? "No change" : Math.abs(delta)}</span>
                <span className="font-normal text-grey">from last audit</span>
            </div>
        )}
    </div>
);

// One settings list-row (icon tile + title + desc + right accessory) for the
// Fix-application and Automatic-AI-auditing cards. Highlights when `active`.
const OptionRow = ({ icon, title, desc, active, onClick, right }: {
    icon: string; title: string; desc: string; active?: boolean; onClick?: () => void; right?: React.ReactNode;
}) => {
    const inner = (
        <>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? "bg-primary/15" : "bg-lavender-mist dark:bg-dark-3"}`}>
                <Icon name={icon} className={`h-5 w-5 ${active ? "fill-primary" : "fill-grey"}`} />
            </span>
            <div className="min-w-0 flex-1 text-left">
                <p className={`text-body-sm font-semibold ${active ? "text-primary dark:text-lilac" : "text-black dark:text-white"}`}>{title}</p>
                <p className="text-caption-2 text-grey">{desc}</p>
            </div>
            {right}
        </>
    );
    const cls = `flex w-full items-center gap-3 rounded-2xl border p-3.5 transition-colors ${active ? "border-primary/40 bg-primary/[0.06] dark:bg-primary/10" : "border-grey-light/70 hover:bg-lavender-mist/40 dark:border-grey-light/12 dark:hover:bg-dark-3/30"}`;
    return onClick ? <button type="button" onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>;
};

const CatChip = ({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) => (
    <button type="button" onClick={onClick}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption-1 transition-colors ${active ? "bg-primary text-white shadow-glow" : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3"}`}>
        {label}
        <span className={active ? "text-white/80" : "text-grey/70"}>{count}</span>
    </button>
);

// ─── instructions modal (for issues we can't auto-fix) ───────────────────────
const InstructionsModal = ({ group, onClose }: { group: IssueGroup | null; onClose: () => void }) => (
    <Transition appear show={!!group} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                        <Dialog.Panel className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                            <Dialog.Title className="mb-1 text-h5 text-black dark:text-white">{group?.title}</Dialog.Title>
                            <p className="mb-4 text-caption-1 text-grey">{group?.explanation}</p>
                            {(() => {
                                const advice = group ? perfAdvice(group.key) : null;
                                if (advice) {
                                    return (
                                        <div className="rounded-2xl bg-lavender-mist/60 p-4 dark:bg-dark-3/50">
                                            <div className="mb-1 text-caption-1 font-semibold text-black dark:text-white">Recommended fixes</div>
                                            <p className="mb-2 text-caption-2 text-grey">{advice.headline}</p>
                                            <ol className="flex flex-col gap-1.5">
                                                {advice.steps.map((s, i) => (
                                                    <li key={i} className="flex gap-2 text-caption-1 text-grey">
                                                        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15 text-[0.625rem] font-bold text-primary">{i + 1}</span>
                                                        <span>{s}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="rounded-2xl bg-lavender-mist/60 p-4 dark:bg-dark-3/50">
                                        <div className="mb-1 text-caption-1 font-semibold text-black dark:text-white">How to fix</div>
                                        <p className="text-caption-1 text-grey">{group?.fixHint}</p>
                                    </div>
                                );
                            })()}
                            {group && group.pages.length > 0 && (
                                <ul className="mt-3 flex flex-col gap-1">
                                    {group.pages.slice(0, 12).map((p, i) => (
                                        <li key={i} className="truncate text-caption-2 text-grey">• {p.title ?? p.url}{p.detail ? ` — ${p.detail}` : ""}</li>
                                    ))}
                                </ul>
                            )}
                            <div className="mt-6 flex items-center justify-end gap-2">
                                {group?.fix === "connect" && (
                                    <Link href="/settings/integrations" className="btn-primary h-9 px-4 text-caption-1">
                                        <Icon name="settings" className="h-4 w-4 fill-white" /> Connect in Settings
                                    </Link>
                                )}
                                <button type="button" onClick={onClose} className="btn-secondary h-9 px-4 text-caption-1">Done</button>
                            </div>
                        </Dialog.Panel>
                    </Transition.Child>
                </div>
            </div>
        </Dialog>
    </Transition>
);

// ─── ignore scope modal (in-table "Ignore" → this page vs all of this type) ───
const IgnoreScopeModal = ({ target, onClose, onSaved }: { target: { g: IssueGroup; p?: IssuePage } | null; onClose: () => void; onSaved: () => void }) => {
    const [busy, setBusy] = useState<"one" | "type" | null>(null);
    const [err, setErr] = useState("");
    const g = target?.g;
    const p = target?.p;
    const canOne = !!p?.id;
    const run = async (mode: "one" | "type") => {
        if (!g) return;
        setBusy(mode);
        setErr("");
        try {
            await api("/seo/scan/ignore", {
                method: "POST",
                body: JSON.stringify(mode === "one" ? { code: g.key, entryId: p?.id } : { code: g.key }),
            });
            onSaved();
            onClose();
        } catch {
            setErr("Couldn't ignore this. Try again.");
        } finally {
            setBusy(null);
        }
    };
    return (
        <Transition appear show={!!target} as={Fragment} afterLeave={() => setErr("")}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <div className="mb-1 flex items-center gap-2">
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-grey/12"><Icon name="eye" className="h-4 w-4 fill-grey" /></span>
                                    <Dialog.Title className="text-h6 text-black dark:text-white">Ignore this issue</Dialog.Title>
                                </div>
                                <p className="mb-4 text-caption-1 text-grey">
                                    Ignored issues are hidden from the audit and never re-surface until you restore them. Choose how widely this applies.
                                </p>
                                <div className="flex flex-col gap-2.5">
                                    {canOne && (
                                        <button type="button" onClick={() => void run("one")} disabled={!!busy}
                                            className="flex items-start gap-3 rounded-2xl border border-grey-light p-4 text-left transition-colors hover:border-primary/50 hover:bg-lavender-mist/40 disabled:opacity-60 dark:border-grey-light/15 dark:hover:bg-dark-3/40">
                                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/12"><Icon name="document" className="h-4 w-4 fill-primary" /></span>
                                            <span className="min-w-0">
                                                <span className="block text-body-sm font-semibold text-black dark:text-white">{busy === "one" ? "Ignoring…" : "Ignore just this page"}</span>
                                                <span className="mt-0.5 block truncate text-caption-2 text-grey">{p?.title ?? p?.url ?? "This page"} only. Other pages with the same issue stay flagged.</span>
                                            </span>
                                        </button>
                                    )}
                                    <button type="button" onClick={() => void run("type")} disabled={!!busy}
                                        className="flex items-start gap-3 rounded-2xl border border-grey-light p-4 text-left transition-colors hover:border-primary/50 hover:bg-lavender-mist/40 disabled:opacity-60 dark:border-grey-light/15 dark:hover:bg-dark-3/40">
                                        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-error/12"><Icon name="close" className="h-4 w-4 fill-error" /></span>
                                        <span className="min-w-0">
                                            <span className="block text-body-sm font-semibold text-black dark:text-white">{busy === "type" ? "Ignoring…" : "Ignore all of this type, forever"}</span>
                                            <span className="mt-0.5 block text-caption-2 text-grey">Permanently stop reminding me about &ldquo;{g?.title}&rdquo; on every page.</span>
                                        </span>
                                    </button>
                                </div>
                                {err && <p className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-caption-2 text-error">{err}</p>}
                                <div className="mt-6 flex justify-end">
                                    <button type="button" onClick={onClose} disabled={!!busy} className="btn-secondary h-9 px-4 text-caption-1 disabled:opacity-60">Cancel</button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default Optimizer;
