"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import CountUp from "@/components/motion/CountUp";
import ConnectLock from "@/components/ui/ConnectLock";
import { type KeywordIntent } from "@/mocks/seo";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useConnections } from "@/lib/useConnections";
import { useScrollResetOnChange } from "@/lib/useScroll";
import LiveBadge from "./LiveBadge";

const INTENTS: (KeywordIntent | "All")[] = ["All", "Informational", "Commercial", "Transactional", "Navigational"];
const intentColor: Record<KeywordIntent, string> = {
    Informational: "#3B82F6",
    Commercial: "#6C5CE7",
    Transactional: "#00B894",
    Navigational: "#F5A623",
};
const intentIcon: Record<KeywordIntent, string> = {
    Informational: "document",
    Commercial: "overview",
    Transactional: "chart",
    Navigational: "compass",
};
const BUCKET_COLORS = ["#00B894", "#6C5CE7", "#3B82F6", "#F5A623", "#EF4444"];

const KW_KPIS = [
    { key: "visibility", label: "Visibility", icon: "eye", color: "#00B894", value: "18.7K", delta: "18%", spark: [12, 13, 14, 15, 16.5, 18.7] },
    { key: "total", label: "Keywords (Total)", icon: "chart", color: "#6C5CE7", value: "230", delta: "+12", spark: [210, 215, 218, 222, 226, 230] },
    { key: "top10", label: "Top 10 Keywords", icon: "compass", color: "#3B82F6", value: "64", delta: "+8", spark: [52, 54, 57, 59, 62, 64] },
    { key: "top3", label: "Top 3 Keywords", icon: "overview", color: "#F5A623", value: "38", delta: "+6", spark: [28, 30, 32, 34, 36, 38] },
    { key: "ctr", label: "Avg. CTR", icon: "logout", color: "#E91E63", value: "3.8%", delta: "+0.6%", spark: [3.0, 3.2, 3.4, 3.5, 3.6, 3.8] },
];

const PAGE_SIZE = 10;

type LiveKeyword = { id: string; term: string; clicks: number; impressions: number; ctr: number; position: number };
type LiveBucket = { label: string; count: number };
type KeywordsLive = { hasData: boolean; total: number; keywords: LiveKeyword[]; buckets: LiveBucket[] };

const DeltaChip = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-success/10 px-1.5 py-0.5 text-caption-2 font-bold text-success">
        <Icon className="h-3 w-3 fill-success rotate-180" name="arrow-down" />
        {children}
    </span>
);

const SortIcon = () => <Icon className="h-3 w-3 fill-grey" name="arrow-down" />;

const Keywords = () => {
    const [intent, setIntent] = useState<KeywordIntent | "All">("All");
    const [query, setQuery] = useState("");
    const [live, setLive] = useState<KeywordsLive | null>(null);
    const [kwConnected, setKwConnected] = useState(false);
    const [vol, setVol] = useState<Record<string, { volume: number; difficulty: number | null }>>({});
    const [ideas, setIdeas] = useState<string[]>([]);
    const [enriching, setEnriching] = useState(false);
    const [page, setPage] = useState(1);
    const reduce = useReducedMotion();
    const tableTopRef = useRef<HTMLDivElement>(null);
    const { connections: conn, loading: connLoading } = useConnections();
    useScrollResetOnChange(tableTopRef, intent);

    useEffect(() => {
        api<KeywordsLive>("/seo/keywords")
            .then((d) => setLive(d.hasData ? d : null))
            .catch(() => {});
        api<{ keyword: { connected: boolean } }>("/seo/connectors")
            .then((d) => setKwConnected(!!d.keyword?.connected))
            .catch(() => {});
    }, []);

    const isLive = !!live;

    const enrich = async () => {
        if (!live) return;
        setEnriching(true);
        try {
            const terms = live.keywords.slice(0, 50).map((k) => k.term);
            const res = await api<{ hasData: boolean; kind?: string; keywords: { keyword: string; volume: number | null; difficulty: number | null }[] }>(
                "/seo/keyword-research",
                { method: "POST", body: JSON.stringify({ terms }) },
            );
            if (res.kind === "ideas") {
                setIdeas((res.keywords ?? []).map((k) => k.keyword).filter(Boolean));
            } else {
                const map: Record<string, { volume: number; difficulty: number | null }> = {};
                for (const r of res.keywords ?? []) if (r.volume != null) map[r.keyword.toLowerCase()] = { volume: r.volume, difficulty: r.difficulty };
                setVol(map);
            }
        } catch {
            /* graceful */
        } finally {
            setEnriching(false);
        }
    };

    const hasVol = Object.keys(vol).length > 0;
    const hasIdeas = ideas.length > 0;
    const q = query.trim().toLowerCase();

    const buckets: { label: string; count: number; color: string }[] = isLive
        ? live!.buckets.map((b, i) => ({ ...b, color: BUCKET_COLORS[i] ?? "#6C5CE7" }))
        : [];
    const bucketTotal = Math.max(1, buckets.reduce((s, b) => s + b.count, 0));
    const totalKeywords = isLive ? live!.total : 0;

    const allRows: LiveKeyword[] = isLive
        ? live!.keywords.filter((k) => !q || k.term.toLowerCase().includes(q))
        : [];

    const pageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
    const rows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const liveKpiValues: Record<string, string> = isLive
        ? {
              total: String(totalKeywords),
              top3: String(live!.buckets[0]?.count ?? 0),
              top10: String(live!.buckets[1]?.count ?? 0),
          }
        : {};

    // Page numbers to show in pagination
    const visiblePages: (number | "…")[] = [];
    if (pageCount <= 6) {
        for (let i = 1; i <= pageCount; i++) visiblePages.push(i);
    } else {
        visiblePages.push(1);
        if (page > 3) visiblePages.push("…");
        for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) visiblePages.push(i);
        if (page < pageCount - 2) visiblePages.push("…");
        visiblePages.push(pageCount);
    }

    const frColumns = buckets.map((b) => `${(b.count / bucketTotal) * 100}fr`).join(" ");

    return (
        <ConnectLock
            connected={conn.gsc}
            loading={connLoading}
            brand="Google Search Console"
            title="Connect Search Console"
            description="Connect Google Search Console to see the keywords you rank for and how positions move from real search traffic."
            href="/settings/integrations?tab=analytics"
            ctaLabel="Connect Search Console"
        >
        <div className="flex flex-col gap-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                {KW_KPIS.map((kpi) => {
                    const value = isLive ? (liveKpiValues[kpi.key] ?? "—") : "—";
                    return (
                        <Card key={kpi.key} className="!p-4 flex flex-col gap-0 overflow-hidden">
                            <div className="flex items-center gap-2 mb-2">
                                <span
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.5rem]"
                                    style={{ backgroundColor: `${kpi.color}1f` }}
                                >
                                    <Icon className="h-4 w-4" name={kpi.icon} fill={kpi.color} />
                                </span>
                                <span className="text-caption-2 text-grey truncate">{kpi.label}</span>
                            </div>
                            <div className="font-poppins text-[1.75rem] leading-none font-bold text-black dark:text-white">{value}</div>
                            {isLive && liveKpiValues[kpi.key] != null ? (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    <DeltaChip>{kpi.delta}</DeltaChip>
                                    <span className="text-caption-2 text-grey">vs Apr 1 – Apr 30</span>
                                </div>
                            ) : (
                                <div className="mt-1.5 h-[1.25rem]" />
                            )}
                            <div className="mt-3 h-11" />
                        </Card>
                    );
                })}
            </div>

            {/* Keyword distribution by position — horizontal stacked bar */}
            <Card>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2.5">
                        <h2 className="text-h5 text-black dark:text-white">Keyword distribution by position</h2>
                        <LiveBadge live={isLive} source="Search Console" />
                    </div>
                    <span className="text-caption-2 text-grey">
                        <CountUp value={totalKeywords} /> tracked keywords
                    </span>
                </div>

                {/* Bucket label row */}
                <div className="grid mb-3" style={{ gridTemplateColumns: frColumns }}>
                    {buckets.map((b) => (
                        <div key={b.label} className="text-caption-1 font-semibold text-black dark:text-white">
                            {b.label === "1–3" ? "Top 3" : b.label}
                        </div>
                    ))}
                </div>

                {/* Stacked bar */}
                <div className="flex h-3 overflow-hidden rounded-xl gap-px mb-3">
                    {buckets.map((b, i) => (
                        <motion.div
                            key={b.label}
                            className={cn("h-full", i === 0 && "rounded-l-xl", i === buckets.length - 1 && "rounded-r-xl")}
                            style={{ flex: b.count, backgroundColor: b.color }}
                            initial={reduce ? false : { scaleX: 0, transformOrigin: "left" }}
                            whileInView={{ scaleX: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.55, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                        />
                    ))}
                </div>

                {/* Count + pct row */}
                <div className="grid mb-4" style={{ gridTemplateColumns: frColumns }}>
                    {buckets.map((b) => (
                        <div key={b.label} className="text-caption-2 text-black dark:text-white">
                            <span className="font-semibold">{b.count}</span>{" "}
                            <span className="text-grey">({((b.count / bucketTotal) * 100).toFixed(1)}%)</span>
                        </div>
                    ))}
                </div>

                {/* Scale */}
                <div className="flex justify-between text-caption-2 text-grey border-t border-grey-light/60 pt-2.5 dark:border-grey-light/10">
                    {["0%", "25%", "50%", "75%", "100%"].map((s) => <span key={s}>{s}</span>)}
                </div>
            </Card>

            {/* Keyword volume/difficulty enrichment */}
            {isLive && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-grey-light px-4 py-3 dark:border-grey-light/10">
                    <p className="text-caption-2 text-grey">
                        {kwConnected
                            ? hasVol
                                ? "Search volume & difficulty added from your keyword provider."
                                : "Add real search volume & difficulty from your connected keyword provider."
                            : "Connect a keyword provider for search volume & difficulty."}
                    </p>
                    {kwConnected ? (
                        <button type="button" onClick={enrich} disabled={enriching || hasVol || hasIdeas} className="btn-secondary h-9 px-3.5 text-caption-1 disabled:opacity-60">
                            <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="chart" />
                            {enriching ? "Fetching…" : hasVol || hasIdeas ? "Added" : "Add keyword data"}
                        </button>
                    ) : (
                        <a href="/settings/integrations" className="btn-secondary h-9 px-3.5 text-caption-1">
                            Connect provider
                        </a>
                    )}
                </div>
            )}

            {/* Keyword ideas */}
            {hasIdeas && (
                <Card>
                    <h2 className="text-h5 text-black dark:text-white mb-3">Keyword ideas</h2>
                    <div className="flex flex-wrap gap-2">
                        {ideas.map((k) => (
                            <span key={k} className="rounded-md bg-lavender-mist px-2.5 py-1 text-caption-1 text-primary dark:bg-dark-3 dark:text-lilac">
                                {k}
                            </span>
                        ))}
                    </div>
                </Card>
            )}

            {/* Filter bar + table */}
            <div ref={tableTopRef} className="scroll-mt-8" />
            <Card className="!p-0 overflow-hidden">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 p-5">
                    <label className="relative flex items-center grow max-w-xs">
                        <Icon className="absolute left-3.5 w-4 h-4 fill-grey" name="search" />
                        <input
                            value={query}
                            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                            placeholder="Filter keywords…"
                            className="w-full h-10 pl-10 pr-3 rounded-2xl bg-lavender-mist text-body-sm text-black outline-none placeholder:text-grey dark:bg-dark-3 dark:text-white"
                        />
                    </label>
                    {!isLive && (
                        <div className="flex flex-wrap gap-2">
                            {INTENTS.map((it) => {
                                const active = intent === it;
                                return (
                                    <button
                                        key={it}
                                        type="button"
                                        onClick={() => { setIntent(it); setPage(1); }}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-caption-1 font-semibold transition-colors",
                                            active ? "bg-primary text-white" : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3",
                                        )}
                                    >
                                        {it !== "All" && (
                                            <Icon
                                                className="h-3.5 w-3.5"
                                                name={intentIcon[it as KeywordIntent]}
                                                fill={active ? "white" : intentColor[it as KeywordIntent]}
                                            />
                                        )}
                                        {it}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-caption-1 font-semibold text-grey bg-lavender-mist hover:text-black transition-colors dark:bg-dark-3 dark:hover:text-white"
                    >
                        <Icon className="h-4 w-4 fill-grey" name="settings" />
                        More filters
                    </button>
                </div>

                {/* Table header */}
                <div
                    className={cn(
                        "hidden md:grid items-center gap-4 px-5 py-3 border-y border-grey-light text-caption-2 text-grey dark:border-grey-light/10",
                        isLive
                            ? "grid-cols-[2.6fr_0.9fr_1fr_0.7fr_0.8fr_1.5rem]"
                            : "grid-cols-[2.4fr_1fr_0.8fr_1fr_0.7fr_0.8fr_0.7fr_1.5rem]",
                    )}
                >
                    <button type="button" className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors text-left">
                        Keyword <SortIcon />
                    </button>
                    {!isLive && (
                        <button type="button" className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors text-left">
                            Intent <SortIcon />
                        </button>
                    )}
                    <button type="button" className="flex items-center justify-end gap-1 hover:text-black dark:hover:text-white transition-colors text-right w-full">
                        Clicks <SortIcon />
                    </button>
                    <button type="button" className="flex items-center justify-end gap-1 hover:text-black dark:hover:text-white transition-colors text-right w-full">
                        Impressions <SortIcon />
                    </button>
                    <button type="button" className="flex items-center justify-end gap-1 hover:text-black dark:hover:text-white transition-colors text-right w-full">
                        CTR <SortIcon />
                    </button>
                    <button type="button" className="flex items-center justify-end gap-1 hover:text-black dark:hover:text-white transition-colors text-right w-full">
                        Position <SortIcon />
                    </button>
                    {!isLive && <span className="text-right">Δ</span>}
                    <span />
                </div>

                {/* Table rows — live keyword data only */}
                {rows.map((k) => {
                    return (
                        <div
                            key={k.id}
                            className={cn(
                                "grid items-center gap-4 px-5 py-3.5 border-b border-grey-light transition-colors last:border-b-0 hover:bg-lavender-mist/40 dark:border-grey-light/10 dark:hover:bg-dark-3/40",
                                isLive
                                    ? "grid-cols-[1fr_auto] md:grid-cols-[2.6fr_0.9fr_1fr_0.7fr_0.8fr_1.5rem]"
                                    : "grid-cols-[1fr_auto] md:grid-cols-[2.4fr_1fr_0.8fr_1fr_0.7fr_0.8fr_0.7fr_1.5rem]",
                            )}
                        >
                            {/* Keyword + volume */}
                            <div className="min-w-0">
                                <div className="truncate text-title text-black dark:text-white">{k.term}</div>
                                {vol[k.term.toLowerCase()] && (
                                    <div className="truncate text-caption-2 text-grey">
                                        Vol {vol[k.term.toLowerCase()].volume.toLocaleString()}/mo
                                        {vol[k.term.toLowerCase()].difficulty != null ? ` · KD ${vol[k.term.toLowerCase()].difficulty}` : ""}
                                    </div>
                                )}
                            </div>

                            <CountUp value={k.clicks} className="hidden md:block text-right text-body-sm text-black dark:text-white" />
                            <CountUp value={k.impressions} className="hidden md:block text-right text-body-sm text-grey" />
                            <CountUp value={k.ctr} decimals={Number.isInteger(k.ctr) ? 0 : 1} suffix="%" className="hidden md:block text-right text-body-sm text-grey" />
                            <CountUp value={k.position} decimals={1} prefix="#" className="text-right text-caption-1 font-semibold text-black dark:text-white" />

                            {/* Row actions */}
                            <button
                                type="button"
                                className="flex h-6 w-6 items-center justify-center rounded-md text-grey opacity-0 group-hover:opacity-100 hover:bg-lavender-mist hover:text-black transition-colors dark:hover:bg-dark-3"
                            >
                                <Icon className="h-4 w-4 fill-grey" name="menu" />
                            </button>
                        </div>
                    );
                })}

                {rows.length === 0 && (
                    <div className="px-5 py-12 text-center text-body text-grey">No keywords match.</div>
                )}

                {/* Pagination */}
                {allRows.length > 0 && (
                    <div className="flex items-center justify-between gap-4 px-5 py-4 border-t border-grey-light dark:border-grey-light/10">
                        <span className="text-caption-2 text-grey">
                            Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, allRows.length)} of {allRows.length} keywords
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-grey hover:bg-lavender-mist disabled:opacity-40 transition-colors dark:hover:bg-dark-3"
                            >
                                <Icon className="h-4 w-4 fill-grey rotate-90" name="arrow-down" />
                            </button>
                            {visiblePages.map((p, i) =>
                                p === "…" ? (
                                    <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-caption-1 text-grey">…</span>
                                ) : (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setPage(p)}
                                        className={cn(
                                            "flex h-8 w-8 items-center justify-center rounded-md text-caption-1 font-semibold transition-colors",
                                            page === p
                                                ? "bg-primary text-white"
                                                : "text-grey hover:bg-lavender-mist dark:hover:bg-dark-3",
                                        )}
                                    >
                                        {p}
                                    </button>
                                ),
                            )}
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                                disabled={page === pageCount}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-grey hover:bg-lavender-mist disabled:opacity-40 transition-colors dark:hover:bg-dark-3"
                            >
                                <Icon className="h-4 w-4 fill-grey -rotate-90" name="arrow-down" />
                            </button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
        </ConnectLock>
    );
};

export default Keywords;
