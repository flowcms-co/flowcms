"use client";

/**
 * Bespoke expanded layouts for the AI Optimizer category accordions.
 * Each panel renders a rich, per-category view (summary band + body + footer CTA)
 * over the enriched /seo/scan/issues data. Pure presentational + existing handlers
 * (onManual / onAi open the same fix modals; onLinks opens the internal-links modal;
 * enqueue runs the existing background batch-fix jobs). No new behaviour.
 */
import { useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import Select from "@/components/ui/Select";

export type Band = "high" | "med" | "low";
export type Effort = "easy" | "med" | "hard";
export type FixKind = "meta" | "schema" | "faq" | "org" | "file" | "links" | "alt" | "editor" | "connect" | "cannibalization" | "instructions";
export type IssuePage = {
    id: string | null; url: string | null; title: string | null; detail?: string; group?: string;
    priority?: Band; overlap?: number; matchTitle?: string;
    current?: string; currentLen?: number; recommended?: string; recommendedLen?: number;
    schemaType?: string; suggested?: number; sources?: string[]; reason?: string;
};
export type IssueGroup = {
    key: string; title: string; category: string; scope: "page" | "site";
    severity: Band; effort: Effort; fix: FixKind; fixArg?: string;
    ai: "fix" | "explain" | "none"; count: number; explanation: string; fixHint: string; pages: IssuePage[];
};
export type RowHelpers = {
    onManual: (g: IssueGroup, p?: IssuePage) => void;
    onAi: (g: IssueGroup, p?: IssuePage) => void;
    onIgnore: (g: IssueGroup, p?: IssuePage) => void;
    onCluster: (g: IssueGroup) => void;
    manualLabel: (g: IssueGroup) => string;
    aiSecondary: (g: IssueGroup) => boolean;
    isBatchable: (g: IssueGroup) => boolean;
};

export type PanelProps = {
    groups: IssueGroup[];
    onManual: (g: IssueGroup, p?: IssuePage) => void;
    onAi: (g: IssueGroup, p?: IssuePage) => void;
    onIgnore: (g: IssueGroup, p?: IssuePage) => void;
    onCluster: (g: IssueGroup) => void;
    onLinks: () => void;
    enqueue: (url: string, payload: unknown, label: string) => void;
};

// Small in-table "Ignore" affordance (the Optimizer opens the scope modal).
const IgnoreBtn = ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick} title="Ignore this issue" aria-label="Ignore this issue" className="btn-ghost btn-sm gap-1 text-grey hover:text-error">
        <Icon name="close" className="h-3.5 w-3.5 fill-current" /> Ignore
    </button>
);

// ─── shared bits ─────────────────────────────────────────────────────────────
const PRIO: Record<Band, { label: string; dot: string; cls: string }> = {
    high: { label: "High priority", dot: "bg-error", cls: "bg-error/12 text-error" },
    med: { label: "Medium priority", dot: "bg-amber-500", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    low: { label: "Low priority", dot: "bg-success", cls: "bg-success/15 text-[#0a7a5f] dark:text-success" },
};
const prioOf = (p: IssuePage): Band => p.priority ?? "med";
const Check = ({ children }: { children: React.ReactNode }) => (
    <li className="flex items-center gap-2 text-caption-1 text-grey">
        <Icon name="check" className="h-4 w-4 shrink-0 fill-success" /> {children}
    </li>
);
const DocTile = () => (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10">
        <Icon name="document" className="h-5 w-5 fill-primary" />
    </span>
);
/** Small purple progress donut with a centred count. */
const Donut = ({ value, label }: { value: number; label: string }) => {
    const pct = 72; // visual fill; the centre shows the real count
    const r = 34, c = 2 * Math.PI * r;
    return (
        <div className="relative grid h-28 w-28 place-items-center">
            <svg viewBox="0 0 80 80" className="h-28 w-28 -rotate-90">
                <circle cx="40" cy="40" r={r} className="fill-none stroke-lavender-mist dark:stroke-dark-3" strokeWidth="8" />
                <circle cx="40" cy="40" r={r} className="fill-none stroke-primary" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
            </svg>
            <div className="absolute text-center">
                <div className="font-poppins text-h6 font-bold leading-none text-black dark:text-white">{value}</div>
                <div className="whitespace-nowrap text-[0.625rem] leading-tight text-grey">{label}</div>
            </div>
        </div>
    );
};
const FooterBand = ({ text, cta, onClick }: { text: string; cta: string; onClick: () => void }) => (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-lavender-mist/70 p-4 dark:bg-dark-3/50">
        <div className="flex items-start gap-2">
            <Icon name="sparkles" className="mt-0.5 h-4 w-4 shrink-0 fill-primary" />
            <div>
                <p className="text-caption-1 font-semibold text-primary">AI recommendation</p>
                <p className="text-caption-2 text-grey">{text}</p>
            </div>
        </div>
        <button type="button" onClick={onClick} className="btn-secondary btn-sm gap-1.5">
            <Icon name="sparkles" className="h-4 w-4 fill-primary" /> {cta}
        </button>
    </div>
);
const SummaryCard = ({ children }: { children: React.ReactNode }) => (
    <div className="grid grid-cols-1 gap-5 rounded-2xl bg-lavender-mist/40 p-5 dark:bg-dark-3/30 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
);

// ─── 1. Internal linking ─────────────────────────────────────────────────────
export function InternalLinkingPanel({ groups, onLinks, onIgnore }: PanelProps) {
    const few = groups.find((g) => g.key === "INTERNAL_LINKS_FEW") ?? groups[0];
    // Only surface pages we actually have link suggestions for (hide "0 suggested links").
    const pages = useMemo(() => (few?.pages ?? []).filter((p) => (p.suggested ?? 0) > 0).slice().sort((a, b) => ({ high: 0, med: 1, low: 2 }[prioOf(a)] - { high: 0, med: 1, low: 2 }[prioOf(b)])), [few]);
    const counts = { high: pages.filter((p) => prioOf(p) === "high").length, med: pages.filter((p) => prioOf(p) === "med").length, low: pages.filter((p) => prioOf(p) === "low").length };
    const [openTier, setOpenTier] = useState<Band | null>("high");
    const [showAllHigh, setShowAllHigh] = useState(false);
    if (!few) return null;

    // No actionable suggestions: don't show empty "0 suggested links" rows.
    if (pages.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-lavender-mist/40 py-10 text-center dark:bg-dark-3/30">
                <Icon name="check" className="h-7 w-7 fill-success" />
                <p className="text-body-sm font-semibold text-black dark:text-white">No internal-linking opportunities right now</p>
                <p className="max-w-md text-caption-2 text-grey">Every page that needs links has no clear in-context match yet. Publish more related content and re-run the audit to surface suggestions.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <SummaryCard>
                <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12"><Icon name="external" className="h-5 w-5 fill-primary" /></span>
                    <div>
                        <p className="text-body-sm font-semibold text-black dark:text-white">{pages.length} pages need more internal links</p>
                        <p className="mt-0.5 text-caption-2 text-grey">Strengthening internal links can improve crawlability, rankings and topical relevance.</p>
                    </div>
                </div>
                <div>
                    <p className="mb-2 text-caption-2 font-semibold text-grey">Potential impact</p>
                    <ul className="flex flex-col gap-1.5">
                        <Check>Better crawl distribution</Check><Check>Stronger topical relevance</Check><Check>Higher rankings for key pages</Check>
                    </ul>
                </div>
                <div className="grid place-items-center"><Donut value={pages.length} label="pages" /></div>
                <div>
                    <p className="mb-2 text-caption-2 font-semibold text-grey">Link opportunities by priority</p>
                    {(["high", "med", "low"] as Band[]).map((b) => (
                        <div key={b} className="flex items-center justify-between py-1 text-caption-1">
                            <span className="flex items-center gap-2 text-black dark:text-white"><span className={`h-2 w-2 rounded-full ${PRIO[b].dot}`} /> {b === "high" ? "High" : b === "med" ? "Medium" : "Low"}</span>
                            <span className="text-grey">{counts[b]} pages</span>
                        </div>
                    ))}
                </div>
            </SummaryCard>

            <div className="rounded-2xl ring-1 ring-grey-light/70 dark:ring-grey-light/10">
                <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <h4 className="font-poppins text-title font-semibold text-black dark:text-white">Internal linking opportunities</h4>
                    <span className="text-caption-2 text-grey">Sorted by priority</span>
                </div>
                {(["high", "med", "low"] as Band[]).map((b) => {
                    const tierPages = pages.filter((p) => prioOf(p) === b);
                    if (!tierPages.length) return null;
                    const open = openTier === b;
                    const shown = b === "high" && !showAllHigh ? tierPages.slice(0, 3) : tierPages;
                    return (
                        <div key={b} className="border-t border-grey-light/60 dark:border-grey-light/10">
                            <div className="flex flex-wrap items-center gap-3 p-4">
                                <button type="button" onClick={() => setOpenTier(open ? null : b)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-grey hover:bg-lavender-mist dark:hover:bg-dark-3" aria-label="Toggle">
                                    <Icon name="arrow-down" className={`h-4 w-4 fill-current transition-transform ${open ? "" : "-rotate-90"}`} />
                                </button>
                                <span className={`rounded-md px-2 py-0.5 text-caption-2 font-semibold ${PRIO[b].cls}`}>{PRIO[b].label}</span>
                                <span className="text-caption-2 text-grey">{tierPages.length} pages</span>
                                <span className="ml-auto flex items-center gap-2">
                                    <IgnoreBtn onClick={() => onIgnore(few)} />
                                    <button type="button" onClick={onLinks} className="btn-primary btn-sm gap-1.5"><Icon name="sparkles" className="h-4 w-4 fill-white" /> Fix all {tierPages.length} with AI</button>
                                </span>
                            </div>
                            {open && (
                                <div className="px-4 pb-2">
                                    {shown.map((p, i) => (
                                        <div key={p.id ?? p.url ?? i} className="grid grid-cols-1 gap-3 border-t border-grey-light/40 py-3 dark:border-grey-light/10 md:grid-cols-[1.5fr_1.4fr_1.4fr_9rem] md:items-center">
                                            <div className="flex items-center gap-3">
                                                <DocTile />
                                                <div className="min-w-0">
                                                    <p className="truncate text-body-sm font-semibold text-black dark:text-white">{p.title ?? p.url ?? "Untitled"}</p>
                                                    {p.url && <p className="truncate text-caption-2 text-grey">{p.url}</p>}
                                                </div>
                                            </div>
                                            <p className="text-caption-2 text-grey"><span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${PRIO[b].dot}`} />{p.reason ?? "Opportunity to build topical authority."}</p>
                                            <div className="text-caption-2 text-grey">
                                                <span className="flex items-center gap-1 font-semibold text-primary"><Icon name="external" className="h-3.5 w-3.5 fill-primary" /> {p.suggested ?? 0} suggested links</span>
                                                {p.sources?.length ? <span className="truncate">From: {p.sources.join(", ")}</span> : null}
                                            </div>
                                            <span className="flex items-center gap-1 justify-self-start md:justify-self-end">
                                                <IgnoreBtn onClick={() => onIgnore(few, p)} />
                                                <button type="button" onClick={onLinks} className="btn-secondary btn-sm">View suggestions</button>
                                            </span>
                                        </div>
                                    ))}
                                    {b === "high" && tierPages.length > 3 && (
                                        <div className="flex justify-center py-2">
                                            <button type="button" onClick={() => setShowAllHigh((s) => !s)} className="inline-flex items-center gap-1 text-caption-1 font-semibold text-primary hover:text-primary/80">
                                                {showAllHigh ? "Show fewer" : `View all ${tierPages.length} high priority pages`}
                                                <Icon name="arrow-down" className={`h-3.5 w-3.5 fill-current transition-transform ${showAllHigh ? "rotate-180" : ""}`} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <FooterBand text="Add relevant internal links to help search engines discover your pages and pass authority." cta="Generate internal linking plan" onClick={onLinks} />
        </div>
    );
}

// ─── 2. Metadata ─────────────────────────────────────────────────────────────
const BADGE = { Low: "bg-grey/12 text-grey", Medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400", High: "bg-error/12 text-error" } as const;
const sevLabel = (s: Band) => (s === "high" ? "High" : s === "med" ? "Medium" : "Low");
const effLabel = (e: Effort) => (e === "easy" ? "Easy" : e === "med" ? "Medium" : "Hard");

export function MetadataPanel({ groups, onManual, onAi, onIgnore }: PanelProps) {
    const pageTotal = groups.reduce((s, g) => s + g.count, 0);
    const types = [...new Set(groups.map((g) => (/* coarse type from title */ g.title.toLowerCase().includes("title") ? "Title" : g.title.toLowerCase().includes("keyword") ? "Keyword" : g.title.toLowerCase().includes("description") ? "Description" : "Meta")))];
    const [open, setOpen] = useState<string | null>(groups[0]?.key ?? null);
    return (
        <div className="flex flex-col gap-4">
            <SummaryCard>
                <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12"><Icon name="edit" className="h-5 w-5 fill-primary" /></span>
                    <div><p className="text-body-sm font-semibold text-black dark:text-white">{pageTotal} issue{pageTotal === 1 ? "" : "s"} found</p><p className="text-caption-2 text-grey">Affecting {pageTotal} page{pageTotal === 1 ? "" : "s"}</p></div>
                </div>
                <div><p className="text-body-sm font-semibold text-black dark:text-white">{types.length} issue type{types.length === 1 ? "" : "s"}</p><p className="text-caption-2 text-grey">{types.join(", ")}</p></div>
                <div className="flex items-start gap-2 sm:col-span-2"><Icon name="sparkles" className="mt-0.5 h-4 w-4 shrink-0 fill-primary" /><div><p className="text-caption-1 font-semibold text-primary">AI opportunity</p><p className="text-caption-2 text-grey">Better metadata can improve rankings and CTR.</p></div></div>
            </SummaryCard>

            {groups.map((g) => {
                const isOpen = open === g.key;
                const withRec = g.pages.some((p) => p.current);
                return (
                    <div key={g.key} className="rounded-2xl ring-1 ring-grey-light/70 dark:ring-grey-light/10">
                        <div className="flex flex-wrap items-center gap-3 p-4">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-error/10"><Icon name="document" className="h-5 w-5 fill-error" /></span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2"><span className="text-body-sm font-semibold text-black dark:text-white">{g.title}</span><span className="rounded-md bg-lavender-mist px-1.5 text-caption-2 font-semibold text-grey dark:bg-dark-3">{g.count} page{g.count === 1 ? "" : "s"}</span></div>
                                <p className="mt-0.5 truncate text-caption-2 text-grey">{g.explanation}</p>
                            </div>
                            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                                <span className="hidden items-center gap-1 text-caption-2 text-grey lg:flex">Impact <span className={`rounded-md px-1.5 py-0.5 font-semibold ${BADGE[sevLabel(g.severity)]}`}>{sevLabel(g.severity)}</span></span>
                                <span className="hidden items-center gap-1 text-caption-2 text-grey lg:flex">Effort <span className={`rounded-md px-1.5 py-0.5 font-semibold ${g.effort === "easy" ? BADGE.Low : BADGE.Medium}`}>{effLabel(g.effort)}</span></span>
                                <IgnoreBtn onClick={() => onIgnore(g)} />
                                <button type="button" onClick={() => onAi(g)} className="btn-secondary btn-sm gap-1.5"><Icon name="sparkles" className="h-4 w-4 fill-primary" /> Fix all {g.count} with AI</button>
                                <button type="button" onClick={() => setOpen(isOpen ? null : g.key)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-grey hover:bg-lavender-mist dark:hover:bg-dark-3" aria-label="Toggle"><Icon name="arrow-down" className={`h-4 w-4 fill-current transition-transform ${isOpen ? "rotate-180" : ""}`} /></button>
                            </div>
                        </div>
                        {isOpen && withRec && (
                            <div className="border-t border-grey-light/60 px-4 py-2 dark:border-grey-light/10">
                                <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_6.5rem] gap-3 py-2 text-caption-2 font-semibold text-grey md:grid"><span>Page</span><span>Current (too long)</span><span>Recommended (160 characters or less)</span><span className="text-right">Action</span></div>
                                {g.pages.slice(0, 8).map((p, i) => (
                                    <div key={p.id ?? p.url ?? i} className="grid grid-cols-1 gap-3 border-t border-grey-light/40 py-3 dark:border-grey-light/10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_6.5rem] md:items-stretch">
                                        <div className="flex min-w-0 items-center gap-3"><DocTile /><div className="min-w-0"><p className="truncate text-body-sm font-semibold text-black dark:text-white">{p.title ?? "Untitled"}</p>{p.url && <p className="truncate text-caption-2 text-grey">{p.url}</p>}</div></div>
                                        <div className="min-w-0 rounded-xl bg-error/5 p-2.5 ring-1 ring-error/15"><p className="text-caption-2 font-semibold text-error">{p.currentLen ?? p.current?.length} characters</p><p className="mt-0.5 line-clamp-2 text-caption-2 text-grey">{p.current}</p></div>
                                        <div className="min-w-0 rounded-xl bg-success/8 p-2.5 ring-1 ring-success/20"><p className="text-caption-2 font-semibold text-[#0a7a5f] dark:text-success">{p.recommendedLen ?? p.recommended?.length} characters</p><p className="mt-0.5 line-clamp-2 text-caption-2 text-grey">{p.recommended}</p></div>
                                        <div className="flex min-w-0 flex-col items-start justify-center gap-1 md:items-end">
                                            {p.id && <button type="button" onClick={() => onManual(g, p)} className="btn-ghost btn-sm text-primary">Apply fix</button>}
                                            <IgnoreBtn onClick={() => onIgnore(g, p)} />
                                        </div>
                                    </div>
                                ))}
                                {g.pages.length > 8 && <div className="flex justify-center py-2"><span className="text-caption-2 text-grey">+ {g.pages.length - 8} more pages</span></div>}
                            </div>
                        )}
                        {isOpen && !withRec && (
                            <ul className="border-t border-grey-light/60 px-4 py-3 dark:border-grey-light/10">
                                {g.pages.slice(0, 10).map((p, i) => (
                                    <li key={p.id ?? p.url ?? i} className="flex items-center justify-between gap-3 py-1.5">
                                        <span className="truncate text-caption-1 text-black dark:text-white">{p.title ?? p.url ?? "Untitled"}{p.current ? <span className="ml-2 text-grey">· {p.current}</span> : null}</span>
                                        <span className="flex shrink-0 items-center gap-1">
                                            <IgnoreBtn onClick={() => onIgnore(g, p)} />
                                            {p.id && <button type="button" onClick={() => onManual(g, p)} className="btn-ghost btn-sm text-primary">Apply fix</button>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                );
            })}
            <FooterBand text="Strong metadata improves click-through rate (CTR) and helps search engines understand your content." cta="Generate metadata preview" onClick={() => groups[0] && onAi(groups[0])} />
        </div>
    );
}

// ─── 3. Content quality (duplicate) ──────────────────────────────────────────
export function ContentQualityPanel({ groups, onManual, onAi, onIgnore }: PanelProps) {
    return (
        <div className="flex flex-col gap-2">
            {groups.map((g) => <ContentRow key={g.key} g={g} onAi={onAi} onManual={onManual} onIgnore={onIgnore} />)}
        </div>
    );
}

// Per-type config so every content-quality issue (duplicate / thin / readability)
// shares ONE rich, collapsible layout (stat band + filters + aligned table).
const CQ_META: Record<string, { icon: string; tint: string; fill: string; title: string; statLabel: string; metricLabel: string; unit: string; action: string }> = {
    DUPLICATE_CONTENT: { icon: "copy", tint: "bg-primary/12", fill: "fill-primary", title: "Duplicate content", statLabel: "Duplicate passages", metricLabel: "Average overlap", unit: "%", action: "Open" },
    THIN_CONTENT: { icon: "document", tint: "bg-amber-500/15", fill: "fill-amber-500", title: "Thin content", statLabel: "Thin pages", metricLabel: "Average word count", unit: "", action: "Fix" },
    READABILITY_HARD: { icon: "chat", tint: "bg-secondary/12", fill: "fill-secondary", title: "Hard to read", statLabel: "Hard-to-read pages", metricLabel: "Average score", unit: "", action: "Fix" },
};
const numFrom = (s?: string): number | null => { const m = (s ?? "").match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

const ContentRow = ({ g, onAi, onManual, onIgnore }: { g: IssueGroup; onAi: PanelProps["onAi"]; onManual: PanelProps["onManual"]; onIgnore: PanelProps["onIgnore"] }) => {
    const meta = CQ_META[g.key] ?? { icon: "document", tint: "bg-primary/12", fill: "fill-primary", title: g.title, statLabel: "Pages", metricLabel: "Average", unit: "", action: "Fix" };
    const isDup = g.key === "DUPLICATE_CONTENT";
    const [open, setOpen] = useState(false);
    const [shown, setShown] = useState(7);
    const [q, setQ] = useState("");
    const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
    const [impact, setImpact] = useState<"all" | "high" | "med">("all");
    const expandable = g.pages.length > 0;
    const metricOf = (p: IssuePage) => (isDup ? p.overlap ?? null : numFrom(p.detail));
    const bandOf = (p: IssuePage): Band => (isDup ? ((p.overlap ?? 0) >= 80 ? "high" : "med") : (p.priority ?? g.severity));
    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return g.pages
            .filter((p) => !needle || (p.title ?? "").toLowerCase().includes(needle) || (p.matchTitle ?? "").toLowerCase().includes(needle) || (p.url ?? "").toLowerCase().includes(needle))
            .filter((p) => impact === "all" || (bandOf(p) === "high" ? "high" : "med") === impact)
            .slice()
            .sort((a, b) => { const av = metricOf(a) ?? 0, bv = metricOf(b) ?? 0; return sortDir === "desc" ? bv - av : av - bv; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [g.pages, q, sortDir, impact]);
    const pagesAffected = new Set(g.pages.map((p) => p.id ?? p.url)).size;
    const metricVals = g.pages.map(metricOf).filter((v): v is number => v != null);
    const avg = metricVals.length ? Math.round(metricVals.reduce((s, v) => s + v, 0) / metricVals.length) : null;
    const list = filtered.slice(0, shown);
    const exportCsv = () => {
        const rows = [["Page", "URL", meta.metricLabel], ...g.pages.map((p) => [p.title ?? "", p.url ?? "", isDup ? `${p.overlap ?? ""}` : (p.detail ?? "")])];
        const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = `${g.key.toLowerCase()}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };
    return (
        <div className="rounded-2xl ring-1 ring-grey-light/70 dark:ring-grey-light/10">
            <div className="flex flex-wrap items-center gap-3 p-4">
                {expandable ? (
                    <button type="button" onClick={() => setOpen((o) => !o)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-grey hover:bg-lavender-mist dark:hover:bg-dark-3" aria-label="Toggle"><Icon name="arrow-down" className={`h-4 w-4 fill-current transition-transform ${open ? "" : "-rotate-90"}`} /></button>
                ) : <span className="w-7 shrink-0" aria-hidden />}
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${meta.tint}`}><Icon name={meta.icon} className={`h-5 w-5 ${meta.fill}`} /></span>
                <div className="min-w-0 flex-1"><p className="text-body-sm font-semibold text-black dark:text-white">{meta.title}</p><p className="truncate text-caption-2 text-grey">{g.explanation}</p></div>
                <span className="hidden shrink-0 text-caption-2 text-grey sm:block">{g.count} issue{g.count === 1 ? "" : "s"}</span>
                <div className="flex shrink-0 items-center gap-2">
                    {expandable && <button type="button" onClick={() => setOpen((o) => !o)} className="btn-secondary btn-sm">Review</button>}
                    <IgnoreBtn onClick={() => onIgnore(g)} />
                    <button type="button" onClick={() => onAi(g)} className="btn-primary btn-sm gap-1.5"><Icon name="sparkles" className="h-4 w-4 fill-white" /> Fix all with AI</button>
                </div>
            </div>
            {open && expandable && (
                <div className="flex flex-col gap-4 border-t border-grey-light/60 px-4 py-4 dark:border-grey-light/10">
                    <div className="grid grid-cols-2 gap-4 rounded-2xl bg-lavender-mist/40 p-5 dark:bg-dark-3/30 lg:grid-cols-4">
                        <Stat icon={meta.icon} tint={meta.tint} fill={meta.fill} value={String(g.count)} label={meta.statLabel} />
                        <Stat icon="document" tint="bg-secondary/12" fill="fill-secondary" value={String(pagesAffected)} label="Pages affected" />
                        <Stat icon="chart" tint="bg-error/12" fill="fill-error" value={avg != null ? `${avg}${meta.unit}` : "—"} label={meta.metricLabel} />
                        <Stat icon="search" tint="bg-success/12" fill="fill-success" value={sevLabel(g.severity)} label="Impact on rankings" />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-[180px] flex-1">
                            <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-grey" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages..." className="w-full rounded-xl bg-lavender-mist/50 py-2 pl-9 pr-3 text-caption-1 text-black outline-none ring-1 ring-grey-light/60 placeholder:text-grey focus:ring-primary/40 dark:bg-dark-3/40 dark:text-white dark:ring-grey-light/10" />
                        </div>
                        <Select variant="filter" ariaLabel="Sort order" value={sortDir} onChange={(v) => setSortDir(v as "desc" | "asc")} options={[{ value: "desc", label: `${meta.metricLabel}: High to low` }, { value: "asc", label: `${meta.metricLabel}: Low to high` }]} />
                        <Select variant="filter" ariaLabel="Impact" value={impact} onChange={(v) => setImpact(v as "all" | "high" | "med")} options={[{ value: "all", label: "Impact: All" }, { value: "high", label: "Impact: High" }, { value: "med", label: "Impact: Medium" }]} />
                        <button type="button" onClick={exportCsv} className="btn-secondary btn-sm gap-1.5"><Icon name="download" className="h-4 w-4 fill-grey" /> Export</button>
                    </div>

                    <div className="rounded-2xl ring-1 ring-grey-light/70 dark:ring-grey-light/10">
                        {list.map((p, i) => {
                            const band = bandOf(p);
                            const sub = isDup ? (p.matchTitle ? `${p.overlap}% overlaps "${p.matchTitle}"` : (p.url ?? "")) : (p.url ?? "");
                            const right = isDup ? `${p.overlap}% overlap` : (p.detail ?? "");
                            return (
                                <div key={p.id ?? p.url ?? i} className="flex items-center gap-3 border-b border-grey-light/40 p-3 last:border-0 dark:border-grey-light/10">
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-lavender-mist/70 dark:bg-dark-3"><Icon name="document" className="h-4 w-4 fill-primary" /></span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-body-sm font-semibold text-black dark:text-white">{p.title ?? p.url ?? "Untitled"}</p>
                                        {sub && <p className="truncate text-caption-2 text-grey">{sub}</p>}
                                    </div>
                                    <span className={`hidden shrink-0 rounded-md px-2 py-0.5 text-caption-2 font-semibold sm:inline ${band === "high" ? BADGE.High : band === "med" ? BADGE.Medium : BADGE.Low}`}>{sevLabel(band)}</span>
                                    <span className="hidden w-28 shrink-0 text-right text-caption-2 text-grey md:block">{right}</span>
                                    <IgnoreBtn onClick={() => onIgnore(g, p)} />
                                    {p.id && <button type="button" onClick={() => onManual(g, p)} className="btn-ghost btn-sm shrink-0 gap-1 text-primary">{meta.action} <Icon name="arrow-right" className="h-3.5 w-3.5 fill-primary" /></button>}
                                </div>
                            );
                        })}
                        {filtered.length > shown && (
                            <div className="flex justify-center p-3"><button type="button" onClick={() => setShown((n) => n + 7)} className="inline-flex items-center gap-1 text-caption-1 font-semibold text-primary hover:text-primary/80">Show {Math.min(7, filtered.length - shown)} more <Icon name="arrow-down" className="h-3.5 w-3.5 fill-current" /></button></div>
                        )}
                        {!filtered.length && <p className="p-4 text-center text-caption-2 text-grey">No matching pages.</p>}
                    </div>
                </div>
            )}
        </div>
    );
};
const Stat = ({ icon, tint, fill, value, label }: { icon: string; tint: string; fill: string; value: string; label: string }) => (
    <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tint}`}><Icon name={icon} className={`h-5 w-5 ${fill}`} /></span>
        <div className="min-w-0"><div className="font-poppins text-title font-bold text-black dark:text-white">{value}</div><div className="text-caption-2 text-grey">{label}</div></div>
    </div>
);

// ─── 4. Schema ───────────────────────────────────────────────────────────────
const SCHEMA_TYPE: Record<string, string> = { SCHEMA_MISSING: "Article", SCHEMA_FAQ_MISSING: "FAQ", SCHEMA_ORG_MISSING: "Organization", SCHEMA_SERVICE_MISSING: "Service", SCHEMA_INVALID: "Article" };
const SCHEMA_BENEFITS: Record<string, string[]> = {
    Article: ["Enables rich article results", "Better content understanding"],
    FAQ: ["Eligible for FAQ rich results", "Better answer engine visibility"],
    Organization: ["Builds brand trust", "Improved knowledge panel visibility"],
    Service: ["Eligible for service rich results", "Higher click-through rates"],
};
const SCHEMA_TILE: Record<string, { bg: string; fill: string; icon: string }> = {
    Article: { bg: "bg-primary/12", fill: "fill-primary", icon: "document" },
    FAQ: { bg: "bg-secondary/12", fill: "fill-secondary", icon: "chat" },
    Organization: { bg: "bg-success/12", fill: "fill-success", icon: "users" },
    Service: { bg: "bg-amber-500/12", fill: "fill-amber-500", icon: "bag" },
};

export function SchemaPanel({ groups, onManual, onAi, onIgnore }: PanelProps) {
    const total = groups.reduce((s, g) => s + g.count, 0);
    const [open, setOpen] = useState<string | null>(groups.find((g) => g.pages.length)?.key ?? groups[0]?.key ?? null);
    const [showAll, setShowAll] = useState(false);
    return (
        <div className="flex flex-col gap-4">
            <SummaryCard>
                <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12"><Icon name="sparkles" className="h-5 w-5 fill-primary" /></span><div><p className="text-body-sm font-semibold text-black dark:text-white">{total} schema opportunities</p><p className="text-caption-2 text-grey">Add structured data to unlock rich results and improve AI and search visibility.</p></div></div>
                <SumItem icon="search" title="Rich results" text="Increase CTR with eligible rich snippets" />
                <SumItem icon="chat" title="Better AI visibility" text="Help AI engines better understand your content" />
                <SumItem icon="chart" title="Stronger rankings" text="Improve topical relevance and crawlability" />
            </SummaryCard>

            {groups.map((g) => {
                const type = g.pages[0]?.schemaType ?? SCHEMA_TYPE[g.key] ?? "Article";
                const tile = SCHEMA_TILE[type] ?? SCHEMA_TILE.Article;
                const isOpen = open === g.key && g.pages.length > 0;
                const shown = showAll ? g.pages : g.pages.slice(0, 4);
                return (
                    <div key={g.key} className="rounded-2xl ring-1 ring-grey-light/70 dark:ring-grey-light/10">
                        <div className="grid grid-cols-1 items-center gap-x-4 gap-y-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tile.bg}`}><Icon name={tile.icon} className={`h-5 w-5 ${tile.fill}`} /></span>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2"><span className="text-body-sm font-semibold text-black dark:text-white">{type} Schema</span><span className="rounded-md bg-secondary/12 px-1.5 text-caption-2 font-semibold text-secondary">{g.count} page{g.count === 1 ? "" : "s"} missing</span></div>
                                    <p className="mt-0.5 text-caption-2 text-grey">{type === "Article" ? "Ideal for blog posts and content pages." : g.explanation}</p>
                                </div>
                            </div>
                            <ul className="hidden min-w-0 flex-col gap-1 lg:flex">{(SCHEMA_BENEFITS[type] ?? []).map((b) => <Check key={b}>{b}</Check>)}</ul>
                            <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                                {g.pages.length > 0 && <button type="button" onClick={() => setOpen(open === g.key ? null : g.key)} className="btn-secondary btn-sm">Review</button>}
                                <IgnoreBtn onClick={() => onIgnore(g)} />
                                <button type="button" onClick={() => onAi(g)} className="btn-primary btn-sm">Apply to {g.count} page{g.count === 1 ? "" : "s"}</button>
                                {g.pages.length > 0 && <button type="button" onClick={() => setOpen(open === g.key ? null : g.key)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-grey hover:bg-lavender-mist dark:hover:bg-dark-3" aria-label="Toggle"><Icon name="arrow-down" className={`h-4 w-4 fill-current transition-transform ${isOpen ? "rotate-180" : ""}`} /></button>}
                            </div>
                        </div>
                        {isOpen && (
                            <div className="border-t border-grey-light/60 px-4 py-2 dark:border-grey-light/10">
                                <p className="py-2 text-caption-2 font-semibold text-grey">Pages requiring {type} Schema · {g.count}</p>
                                {shown.map((p, i) => {
                                    const b = prioOf(p);
                                    return (
                                        <div key={p.id ?? p.url ?? i} className="flex flex-wrap items-center gap-3 border-t border-grey-light/40 py-3 dark:border-grey-light/10">
                                            <DocTile />
                                            <div className="min-w-0 flex-1"><p className="truncate text-body-sm font-semibold text-black dark:text-white">{p.title ?? "Untitled"}</p>{p.url && <p className="truncate text-caption-2 text-grey">{p.url}</p>}</div>
                                            <span className="hidden items-center gap-2 text-caption-2 sm:flex"><span className={`h-2 w-2 rounded-full ${PRIO[b].dot}`} /><span className="text-black dark:text-white">{PRIO[b].label}</span></span>
                                            <IgnoreBtn onClick={() => onIgnore(g, p)} />
                                            <button type="button" onClick={() => onManual(g, p)} className="btn-secondary btn-sm">Preview</button>
                                            <button type="button" onClick={() => onManual(g, p)} className="btn-primary btn-sm">Apply</button>
                                        </div>
                                    );
                                })}
                                {g.pages.length > 4 && <div className="flex justify-center py-2"><button type="button" onClick={() => setShowAll((s) => !s)} className="inline-flex items-center gap-1 text-caption-1 font-semibold text-primary hover:text-primary/80">{showAll ? "Show fewer" : `+ ${g.pages.length - 4} more pages`} <Icon name="arrow-down" className={`h-3.5 w-3.5 fill-current transition-transform ${showAll ? "rotate-180" : ""}`} /></button></div>}
                            </div>
                        )}
                    </div>
                );
            })}
            <FooterBand text="Adding the right schema can unlock rich results and improve how your content appears in search and AI systems." cta="Generate schema plan" onClick={() => groups[0] && onAi(groups[0])} />
        </div>
    );
}
const SumItem = ({ icon, title, text }: { icon: string; title: string; text: string }) => (
    <div className="flex items-start gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10"><Icon name={icon} className="h-4 w-4 fill-primary" /></span><div><p className="text-caption-1 font-semibold text-black dark:text-white">{title}</p><p className="text-caption-2 text-grey">{text}</p></div></div>
);

// ─── 5. Cannibalization ──────────────────────────────────────────────────────
const ROLE = {
    primary: "bg-success/15 text-[#0a7a5f] dark:text-success",
    competing: "bg-primary/12 text-primary dark:text-lilac",
} as const;

export function CannibalizationPanel({ groups, onCluster, onIgnore }: PanelProps) {
    const g = groups.find((x) => x.key === "CANNIBALIZATION") ?? groups[0];
    const clusters = useMemo(() => {
        const by = new Map<string, IssuePage[]>();
        for (const p of g?.pages ?? []) { const k = p.group ?? "—"; by.set(k, [...(by.get(k) ?? []), p]); }
        return [...by.entries()].map(([keyword, pages]) => ({ keyword, pages }));
    }, [g]);
    const [openKw, setOpenKw] = useState<string | null>(clusters[0]?.keyword ?? null);
    const [insights, setInsights] = useState<string | null>(null);
    if (!g) return null;
    const totalPages = g.pages.length;
    const primaryCount = clusters.length;
    const competingCount = Math.max(0, totalPages - primaryCount);
    const bandOf = (n: number): Band => (n >= 5 ? "high" : n >= 3 ? "med" : "low");
    const openCluster = (pages: IssuePage[], keyword: string) => onCluster({ ...g, title: keyword, pages });

    return (
        <div className="flex flex-col gap-4">
            <SummaryCard>
                <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12"><Icon name="chart" className="h-5 w-5 fill-primary" /></span>
                    <div><p className="text-body-sm font-semibold text-black dark:text-white">{clusters.length} Cannibalization issue{clusters.length === 1 ? "" : "s"}</p><p className="mt-0.5 text-caption-2 text-grey">Multiple pages compete for the same query and split ranking signals.</p></div>
                </div>
                <div>
                    <p className="mb-2 text-caption-2 font-semibold text-grey">Why it matters</p>
                    <ul className="flex flex-col gap-1.5"><Check>Improves rankings for target keywords</Check><Check>Consolidates authority to primary pages</Check><Check>Better crawl efficiency</Check></ul>
                </div>
                <div className="grid place-items-center"><Donut value={totalPages} label="Pages affected" /></div>
                <div>
                    <div className="flex items-center justify-between py-1 text-caption-1"><span className="flex items-center gap-2 text-black dark:text-white"><span className="h-2 w-2 rounded-full bg-success" /> Primary pages</span><span className="text-grey">{primaryCount}</span></div>
                    <div className="flex items-center justify-between py-1 text-caption-1"><span className="flex items-center gap-2 text-black dark:text-white"><span className="h-2 w-2 rounded-full bg-primary" /> Competing pages</span><span className="text-grey">{competingCount}</span></div>
                </div>
            </SummaryCard>

            {clusters.map(({ keyword, pages }) => {
                const open = openKw === keyword;
                const band = bandOf(pages.length);
                const primary = pages[0];
                const competing = pages.slice(1);
                return (
                    <div key={keyword} className="rounded-2xl ring-1 ring-grey-light/70 dark:ring-grey-light/10">
                        <div className="flex flex-wrap items-center gap-3 p-4">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12"><Icon name="copy" className="h-5 w-5 fill-primary" /></span>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2"><span className="text-body-sm font-semibold text-black dark:text-white">{keyword}</span><span className={`rounded-md px-2 py-0.5 text-caption-2 font-semibold ${BADGE[sevLabel(band)]}`}>{sevLabel(band)} impact</span></div>
                                <p className="mt-0.5 text-caption-2 text-grey">{pages.length} pages competing for the same keyword</p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                <IgnoreBtn onClick={() => onIgnore(g)} />
                                <button type="button" onClick={() => openCluster(pages, keyword)} className="btn-secondary btn-sm">Review cluster</button>
                                <button type="button" onClick={() => openCluster(pages, keyword)} className="btn-primary btn-sm gap-1.5"><Icon name="sparkles" className="h-4 w-4 fill-white" /> Generate merge plan</button>
                                <button type="button" onClick={() => setOpenKw(open ? null : keyword)} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-lavender-mist dark:hover:bg-dark-3" aria-label="Toggle"><Icon name="arrow-down" className={`h-4 w-4 fill-current transition-transform ${open ? "rotate-180" : ""}`} /></button>
                            </div>
                        </div>
                        {open ? (
                            <div className="border-t border-grey-light/60 px-4 dark:border-grey-light/10">
                                <div className="hidden grid-cols-[1.6fr_1.1fr_7rem] gap-3 py-3 text-caption-2 font-semibold text-grey md:grid"><span>Pages</span><span>Role</span><span className="text-right">Action</span></div>
                                {pages.map((p, i) => {
                                    const isPrimary = i === 0;
                                    return (
                                        <div key={p.id ?? p.url ?? i} className="grid grid-cols-1 gap-3 border-t border-grey-light/40 py-3 dark:border-grey-light/10 md:grid-cols-[1.6fr_1.1fr_7rem] md:items-center">
                                            <div className="flex items-center gap-3">
                                                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${isPrimary ? "bg-success/12" : "bg-lavender-mist/70 dark:bg-dark-3"}`}><Icon name={isPrimary ? "check" : "document"} className={`h-4 w-4 ${isPrimary ? "fill-success" : "fill-grey"}`} /></span>
                                                <div className="min-w-0"><p className="truncate text-body-sm font-semibold text-black dark:text-white">{p.title ?? "Untitled"}</p>{p.url && <p className="truncate text-caption-2 text-grey">{p.url}</p>}</div>
                                            </div>
                                            <div>
                                                <span className={`inline-block rounded-md px-2 py-0.5 text-caption-2 font-semibold uppercase ${isPrimary ? ROLE.primary : ROLE.competing}`}>{isPrimary ? "Primary" : "Competing"}</span>
                                                <p className="mt-1 text-caption-2 text-grey">{isPrimary ? "Keep & strengthen" : "Merge into primary"}</p>
                                            </div>
                                            {p.url
                                                ? <a href={p.url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm justify-self-start gap-1 md:justify-self-end">View page <Icon name="external" className="h-3.5 w-3.5 fill-current" /></a>
                                                : <span className="justify-self-start text-caption-2 text-grey md:justify-self-end">Unmanaged</span>}
                                        </div>
                                    );
                                })}
                                <div className="flex justify-center py-3">
                                    <button type="button" onClick={() => setInsights(insights === keyword ? null : keyword)} className="inline-flex items-center gap-1 text-caption-1 font-semibold text-primary hover:text-primary/80">
                                        {insights === keyword ? "Hide cluster insights" : "Show cluster insights"} <Icon name="arrow-down" className={`h-3.5 w-3.5 fill-current transition-transform ${insights === keyword ? "rotate-180" : ""}`} />
                                    </button>
                                </div>
                                {insights === keyword && <p className="pb-4 text-caption-2 text-grey">{(primary?.detail ?? "").replace(/^Suggested primary · /, "") || g.fixHint}</p>}
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-grey-light/40 px-4 py-3 dark:border-grey-light/10">
                                {primary && <span className="flex items-center gap-2 text-caption-1 text-black dark:text-white"><span className={`rounded-md px-1.5 py-0.5 text-caption-2 font-semibold uppercase ${ROLE.primary}`}>Primary</span> <span className="truncate">{primary.title}</span></span>}
                                {competing[0] && <span className="flex items-center gap-2 text-caption-1 text-black dark:text-white"><span className={`rounded-md px-1.5 py-0.5 text-caption-2 font-semibold uppercase ${ROLE.competing}`}>Competing</span> <span className="truncate">{competing[0].title}</span></span>}
                            </div>
                        )}
                    </div>
                );
            })}
            <FooterBand text="Consolidate competing pages into the primary page to improve rankings and avoid splitting authority." cta="Generate merge plan for all" onClick={() => onCluster(g)} />
        </div>
    );
}

export const CATEGORY_PANEL: Record<string, (p: PanelProps) => React.ReactElement | null> = {
    links: InternalLinkingPanel,
    metadata: MetadataPanel,
    content: ContentQualityPanel,
    schema: SchemaPanel,
    cannibalization: CannibalizationPanel,
};
