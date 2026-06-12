"use client";

import { useEffect, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import BrandIcon from "@/components/ui/BrandIcon";
import CountUp from "@/components/motion/CountUp";
import Sparkline from "@/components/charts/Sparkline";
import ConnectLock from "@/components/ui/ConnectLock";
import { type TopPageRich, type PageType } from "@/mocks/seo";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useConnections } from "@/lib/useConnections";
import LiveBadge from "./LiveBadge";

/* ─── helpers ─── */
const fmtNum = (n: number) =>
    n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`
        : n >= 1000
          ? `${(n / 1000).toFixed(1)}K`
          : `${Math.round(n)}`;

const healthColor = (s: number) =>
    s >= 85 ? "#00B894" : s >= 70 ? "#3B82F6" : s >= 55 ? "#F5A623" : "#E24B4A";

const deriveType = (path: string): PageType => {
    if (path.startsWith("/blog/") || path.startsWith("/articles/") || path.startsWith("/posts/")) return "Blog";
    if (path.startsWith("/resources") || path.startsWith("/guides/") || path.startsWith("/docs/")) return "Resources";
    if (["/pricing", "/contact", "/signup", "/demo", "/free-brand-audit", "/get-started"].includes(path))
        return "Landing Page";
    return "Services";
};

/* ─── constants ─── */
const TYPE_COLOR: Record<PageType, string> = {
    Services: "#00B894",
    Blog: "#6C5CE7",
    Resources: "#3B82F6",
    "Landing Page": "#F5A623",
};

const TYPE_TABS = ["All", "Services", "Blog", "Resources", "Landing Page"] as const;
type TypeTab = (typeof TYPE_TABS)[number];

const PAGE_SIZE = 10;

const KPI_CONFIGS = [
    { key: "pagesWithTraffic" as const, label: "Pages receiving traffic", icon: "eye", color: "#00B894" },
    { key: "organicSessions" as const, label: "Organic sessions", icon: "overview", color: "#6C5CE7" },
    { key: "impressions" as const, label: "Impressions", icon: "search", color: "#3B82F6" },
    { key: "avgCtr" as const, label: "Avg. CTR", icon: "chart", color: "#E91E63" },
];

/* ─── types ─── */
type LivePage = { url: string; path: string; clicks: number; impressions: number; ctr: number; position: number };
type LiveResp = { hasData: boolean; total: number; pages: LivePage[] };
type SortKey = "sessions" | "clicks" | "impressions" | "ctr" | "position" | "health";

/* ─── sub-components ─── */

const DeltaChip = ({ value }: { value: number }) => (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-success/10 px-1.5 py-0.5 text-caption-2 font-bold text-success">
        <Icon className="h-3 w-3 fill-success rotate-180" name="arrow-down" />
        {value}%
    </span>
);

const Delta = ({
    value,
    goodWhenUp = true,
    suffix = "%",
}: {
    value: number;
    goodWhenUp?: boolean;
    suffix?: string;
}) => {
    const good = goodWhenUp ? value >= 0 : value <= 0;
    const abs = Math.abs(value);
    const formatted = abs >= 10 ? Math.round(abs) : abs.toFixed(1);
    return (
        <span
            className={cn(
                "inline-flex items-center gap-0.5 text-caption-2 font-bold",
                good ? "text-success" : "text-error",
            )}
        >
            <Icon
                className={cn("h-3 w-3", good ? "fill-success rotate-180" : "fill-error")}
                name="arrow-down"
            />
            {value > 0 ? "+" : ""}
            {formatted}
            {suffix}
        </span>
    );
};

const TypeBadge = ({ type, className }: { type: PageType; className?: string }) => (
    <span
        className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap",
            className,
        )}
        style={{ backgroundColor: `${TYPE_COLOR[type]}1a`, color: TYPE_COLOR[type] }}
    >
        {type}
    </span>
);

const HealthBadge = ({ score }: { score: number }) => {
    const color = healthColor(score);
    return (
        <span
            className="inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-md px-1.5 text-caption-1 font-bold"
            style={{ backgroundColor: `${color}1a`, color }}
        >
            {score}
        </span>
    );
};

/* ─── main ─── */
const TopPagesReport = () => {
    const [live, setLive] = useState<LiveResp | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [query, setQuery] = useState("");
    const [typeTab, setTypeTab] = useState<TypeTab>("All");
    const [specialFilter, setSpecialFilter] = useState<"high-growth" | "declining" | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>("sessions");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [page, setPage] = useState(1);
    const tableRef = useRef<HTMLDivElement>(null);
    const { connections: conn, loading: connLoading } = useConnections();

    useEffect(() => {
        api<LiveResp>("/seo/top-pages")
            .then((d) => setLive(d.hasData ? d : null))
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    const isLive = !!live;

    /* Build unified row array */
    const baseRows: TopPageRich[] = isLive
        ? live!.pages.map((p, i) => ({
              id: `live-${i}`,
              path: p.path,
              pageType: deriveType(p.path),
              sessions: 0,
              sessionsDelta: 0,
              clicks: p.clicks,
              clicksDelta: 0,
              impressions: p.impressions,
              impressionsDelta: 0,
              ctr: p.ctr,
              ctrDelta: 0,
              position: p.position,
              positionDelta: 0,
              spark: [] as number[],
              healthScore: 0,
          }))
        : [];

    /* Filter */
    const q = query.trim().toLowerCase();
    const filtered = baseRows.filter((r) => {
        if (q && !r.path.toLowerCase().includes(q)) return false;
        if (typeTab !== "All" && r.pageType !== typeTab) return false;
        if (specialFilter === "high-growth" && r.sessionsDelta < 15) return false;
        if (specialFilter === "declining" && r.sessionsDelta >= 0) return false;
        return true;
    });

    /* Sort */
    const sorted = [...filtered].sort((a, b) => {
        let av = 0,
            bv = 0;
        if (sortKey === "sessions") {
            av = a.sessions;
            bv = b.sessions;
        } else if (sortKey === "clicks") {
            av = a.clicks;
            bv = b.clicks;
        } else if (sortKey === "impressions") {
            av = a.impressions;
            bv = b.impressions;
        } else if (sortKey === "ctr") {
            av = a.ctr;
            bv = b.ctr;
        } else if (sortKey === "position") {
            av = a.position;
            bv = b.position;
        } else {
            av = a.healthScore;
            bv = b.healthScore;
        }
        const d = sortDir === "desc" ? -1 : 1;
        /* For position: lower number = better ranking; desc means best first = ascending numerically */
        return sortKey === "position" ? (av - bv) * (sortDir === "desc" ? 1 : -1) : (av - bv) * d;
    });

    /* Paginate */
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const doSort = (key: SortKey) => {
        if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        else {
            setSortKey(key);
            setSortDir("desc");
        }
        setPage(1);
        tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    /* Pagination page numbers */
    const pageNums: (number | "…")[] = [];
    if (pageCount <= 6) {
        for (let i = 1; i <= pageCount; i++) pageNums.push(i);
    } else {
        pageNums.push(1);
        if (page > 3) pageNums.push("…");
        for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) pageNums.push(i);
        if (page < pageCount - 2) pageNums.push("…");
        pageNums.push(pageCount);
    }

    /* KPI data */
    type KpiKey = "pagesWithTraffic" | "organicSessions" | "impressions" | "avgCtr";
    const kpiRaw: Record<KpiKey, { value: number | null; delta: number | null; spark: number[] }> = isLive
        ? {
              pagesWithTraffic: { value: live!.total, delta: null, spark: [] },
              organicSessions: { value: null, delta: null, spark: [] },
              impressions: {
                  value: live!.pages.reduce((s, p) => s + p.impressions, 0),
                  delta: null,
                  spark: [],
              },
              avgCtr: {
                  value:
                      Math.round(
                          (live!.pages.reduce((s, p) => s + p.ctr, 0) / Math.max(1, live!.pages.length)) * 10,
                      ) / 10,
                  delta: null,
                  spark: [],
              },
          }
        : {
              pagesWithTraffic: { value: null, delta: null, spark: [] },
              organicSessions: { value: null, delta: null, spark: [] },
              impressions: { value: null, delta: null, spark: [] },
              avgCtr: { value: null, delta: null, spark: [] },
          };

    const fmtKpi = (key: KpiKey, val: number) => {
        if (key === "avgCtr") return `${val}%`;
        return fmtNum(val);
    };

    /* Column grid templates */
    const MOCK_COLS =
        "grid-cols-[1.5rem_minmax(0,2fr)_1.1fr_0.85fr_0.85fr_0.9fr_0.65fr_0.8fr_3.5rem]";
    const LIVE_COLS = "grid-cols-[1.5rem_minmax(0,2fr)_1.1fr_0.9fr_0.9fr_0.65fr_0.8fr]";
    const desktopCols = isLive ? LIVE_COLS : MOCK_COLS;

    const setType = (tab: TypeTab) => {
        setTypeTab(tab);
        if (tab !== "All") setSpecialFilter(null);
        setPage(1);
    };

    const toggleSpecial = (f: "high-growth" | "declining") => {
        setSpecialFilter((prev) => (prev === f ? null : f));
        setTypeTab("All");
        setPage(1);
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Intro + date filter */}
            <div className="flex items-center justify-between gap-4 -mt-4">
                <p className="text-body text-grey">
                    Discover your top performing pages and how they contribute to traffic and rankings.
                </p>
                <button
                    type="button"
                    className="shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-[0.625rem] border border-grey-light text-caption-1 text-black hover:bg-lavender-mist transition-colors dark:border-grey-light/20 dark:text-white dark:hover:bg-dark-3"
                >
                    <Icon className="h-4 w-4 fill-grey" name="calendar" />
                    Last 30 days
                    <Icon className="h-3 w-3 fill-grey" name="arrow-down" />
                </button>
            </div>

            <ConnectLock
                connected={conn.gsc}
                loading={connLoading}
                brand="Google Search Console"
                title="Connect Search Console"
                description="Connect Google Search Console to see which pages earn the most search clicks and impressions."
                href="/settings/integrations?tab=analytics"
                ctaLabel="Connect Search Console"
            >
            <div className="flex flex-col gap-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {KPI_CONFIGS.map((kpi) => {
                    const d = kpiRaw[kpi.key];
                    const val = d.value;
                    const displayVal = val == null ? "—" : fmtKpi(kpi.key, val);
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
                            <div className="font-poppins text-[1.75rem] leading-none font-bold text-black dark:text-white">
                                {displayVal}
                            </div>
                            {d.delta != null ? (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    <DeltaChip value={d.delta} />
                                    <span className="text-caption-2 text-grey">vs Apr 1 – Apr 30</span>
                                </div>
                            ) : (
                                <div className="mt-1.5">
                                    {isLive && val == null ? (
                                        <span className="text-caption-2 text-grey">Not connected</span>
                                    ) : isLive ? (
                                        <span className="text-caption-2 text-grey">Top pages only</span>
                                    ) : (
                                        <div className="h-[1.25rem]" />
                                    )}
                                </div>
                            )}
                            {d.spark.length > 0 ? (
                                <div className="-mx-4 -mb-4 mt-3">
                                    <Sparkline data={d.spark} color={kpi.color} height={44} />
                                </div>
                            ) : (
                                <div className="mt-3 h-11" />
                            )}
                        </Card>
                    );
                })}
            </div>

            {/* Table card */}
            <div ref={tableRef} className="scroll-mt-8" />
            <Card className="!p-0 overflow-hidden">
                {/* Filter bar */}
                <div className="flex flex-wrap items-center gap-2.5 p-5">
                    <label className="relative flex items-center min-w-[180px] max-w-xs grow">
                        <Icon className="absolute left-3.5 h-4 w-4 fill-grey pointer-events-none" name="search" />
                        <input
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Search pages..."
                            className="w-full h-9 pl-10 pr-3 rounded-[0.625rem] bg-lavender-mist text-body-sm text-black outline-none placeholder:text-grey dark:bg-dark-3 dark:text-white"
                        />
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {TYPE_TABS.map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setType(tab)}
                                className={cn(
                                    "h-9 px-3.5 rounded-[0.625rem] text-caption-1 font-semibold transition-colors",
                                    typeTab === tab && specialFilter === null
                                        ? "bg-primary text-white"
                                        : "bg-lavender-mist text-grey hover:text-black dark:bg-dark-3 dark:hover:text-white",
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => toggleSpecial("high-growth")}
                            className={cn(
                                "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[0.625rem] text-caption-1 font-semibold transition-colors",
                                specialFilter === "high-growth"
                                    ? "bg-success/20 text-success"
                                    : "bg-success/10 text-success hover:bg-success/20",
                            )}
                        >
                            <Icon className="h-3.5 w-3.5 fill-success rotate-180" name="arrow-down" />
                            High growth
                        </button>
                        <button
                            type="button"
                            onClick={() => toggleSpecial("declining")}
                            className={cn(
                                "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[0.625rem] text-caption-1 font-semibold transition-colors",
                                specialFilter === "declining"
                                    ? "bg-error/20 text-error"
                                    : "bg-error/10 text-error hover:bg-error/20",
                            )}
                        >
                            <Icon className="h-3.5 w-3.5 fill-error" name="arrow-down" />
                            Declining
                        </button>
                    </div>
                </div>

                {/* Table header — desktop only */}
                <div
                    className={cn(
                        "hidden md:grid items-center gap-3 px-5 py-3 border-y border-grey-light text-caption-2 text-grey dark:border-grey-light/10",
                        desktopCols,
                    )}
                >
                    <span>#</span>
                    <button
                        type="button"
                        className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors text-left"
                    >
                        Page <Icon className="h-3 w-3 fill-grey" name="arrow-down" />
                    </button>
                    <span>Page type</span>
                    {!isLive && (
                        <button
                            type="button"
                            onClick={() => doSort("sessions")}
                            className="flex items-center justify-end gap-1 hover:text-black dark:hover:text-white transition-colors text-right w-full"
                        >
                            Sessions{" "}
                            <Icon
                                className={cn(
                                    "h-3 w-3 fill-grey",
                                    sortKey === "sessions" && sortDir === "asc" ? "rotate-180" : "",
                                )}
                                name="arrow-down"
                            />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => doSort("clicks")}
                        className="flex items-center justify-end gap-1 hover:text-black dark:hover:text-white transition-colors text-right w-full"
                    >
                        Clicks{" "}
                        <Icon
                            className={cn(
                                "h-3 w-3 fill-grey",
                                sortKey === "clicks" && sortDir === "asc" ? "rotate-180" : "",
                            )}
                            name="arrow-down"
                        />
                    </button>
                    <button
                        type="button"
                        onClick={() => doSort("impressions")}
                        className="flex items-center justify-end gap-1 hover:text-black dark:hover:text-white transition-colors text-right w-full"
                    >
                        Impressions{" "}
                        <Icon
                            className={cn(
                                "h-3 w-3 fill-grey",
                                sortKey === "impressions" && sortDir === "asc" ? "rotate-180" : "",
                            )}
                            name="arrow-down"
                        />
                    </button>
                    <button
                        type="button"
                        onClick={() => doSort("ctr")}
                        className="flex items-center justify-end gap-1 hover:text-black dark:hover:text-white transition-colors text-right w-full"
                    >
                        CTR{" "}
                        <Icon
                            className={cn(
                                "h-3 w-3 fill-grey",
                                sortKey === "ctr" && sortDir === "asc" ? "rotate-180" : "",
                            )}
                            name="arrow-down"
                        />
                    </button>
                    <button
                        type="button"
                        onClick={() => doSort("position")}
                        className="flex items-center justify-end gap-1 hover:text-black dark:hover:text-white transition-colors text-right w-full"
                    >
                        Avg. position{" "}
                        <Icon
                            className={cn(
                                "h-3 w-3 fill-grey",
                                sortKey === "position" && sortDir === "asc" ? "rotate-180" : "",
                            )}
                            name="arrow-down"
                        />
                    </button>
                    {!isLive && (
                        <button
                            type="button"
                            onClick={() => doSort("health")}
                            className="flex items-center justify-end gap-1 hover:text-black dark:hover:text-white transition-colors text-right w-full"
                        >
                            Health{" "}
                            <Icon
                                className={cn(
                                    "h-3 w-3 fill-grey",
                                    sortKey === "health" && sortDir === "asc" ? "rotate-180" : "",
                                )}
                                name="arrow-down"
                            />
                        </button>
                    )}
                </div>

                {/* Loading skeleton */}
                {!loaded && (
                    <div className="flex flex-col">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-4 px-5 py-3.5 border-b border-grey-light dark:border-grey-light/10 last:border-b-0"
                            >
                                <span className="h-4 w-5 shrink-0 animate-pulse rounded bg-grey-light/60 dark:bg-dark-3" />
                                <span className="h-4 flex-1 animate-pulse rounded bg-grey-light/60 dark:bg-dark-3" />
                                <span className="h-4 w-20 animate-pulse rounded bg-grey-light/60 dark:bg-dark-3" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Table rows */}
                {loaded &&
                    pageRows.map((row, idx) => {
                        const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                        return (
                            <div
                                key={row.id}
                                className={cn(
                                    "grid items-center gap-3 px-5 border-b border-grey-light last:border-b-0 hover:bg-lavender-mist/40 dark:border-grey-light/10 dark:hover:bg-dark-3/40 transition-colors",
                                    /* mobile: path + position */
                                    "grid-cols-[1fr_auto] py-3",
                                    /* desktop: full column set */
                                    isLive
                                        ? "md:grid-cols-[1.5rem_minmax(0,2fr)_1.1fr_0.9fr_0.9fr_0.65fr_0.8fr] md:py-3.5"
                                        : "md:grid-cols-[1.5rem_minmax(0,2fr)_1.1fr_0.85fr_0.85fr_0.9fr_0.65fr_0.8fr_3.5rem] md:py-3.5",
                                )}
                            >
                                {/* # */}
                                <span className="hidden md:block text-caption-2 text-grey">{rowNum}</span>

                                {/* Page path */}
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="truncate text-title text-black dark:text-white">
                                            {row.path}
                                        </span>
                                        <Icon
                                            className="h-3 w-3 shrink-0 fill-grey opacity-0 hover:opacity-100 md:group-hover:opacity-100"
                                            name="external"
                                        />
                                    </div>
                                    {/* Type badge stacked on mobile only */}
                                    <div className="mt-0.5 md:hidden">
                                        <TypeBadge type={row.pageType} />
                                    </div>
                                </div>

                                {/* Page type — desktop only */}
                                <TypeBadge type={row.pageType} className="hidden md:inline-flex" />

                                {/* Sessions — mock only, desktop only */}
                                {!isLive && (
                                    <div className="hidden md:flex flex-col items-end gap-0.5">
                                        <span className="text-body-sm text-black dark:text-white">
                                            {fmtNum(row.sessions)}
                                        </span>
                                        <Delta value={row.sessionsDelta} />
                                    </div>
                                )}

                                {/* Clicks — desktop only */}
                                <div className="hidden md:flex flex-col items-end gap-0.5">
                                    <CountUp
                                        value={row.clicks}
                                        className="text-body-sm text-black dark:text-white"
                                    />
                                    {!isLive && <Delta value={row.clicksDelta} />}
                                </div>

                                {/* Impressions — desktop only */}
                                <div className="hidden md:flex flex-col items-end gap-0.5">
                                    <span className="text-body-sm text-grey">{fmtNum(row.impressions)}</span>
                                    {!isLive && <Delta value={row.impressionsDelta} />}
                                </div>

                                {/* CTR — desktop only */}
                                <div className="hidden md:flex flex-col items-end gap-0.5">
                                    <span className="text-body-sm text-grey">{row.ctr.toFixed(1)}%</span>
                                    {!isLive && <Delta value={row.ctrDelta} />}
                                </div>

                                {/* Position — always visible (mobile: right column) */}
                                <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-body-sm font-semibold text-black dark:text-white">
                                        {row.position.toFixed(1)}
                                    </span>
                                    {!isLive && (
                                        <span className="hidden md:block">
                                            <Delta value={row.positionDelta} goodWhenUp suffix="" />
                                        </span>
                                    )}
                                </div>

                                {/* Health score — mock only, desktop only */}
                                {!isLive && (
                                    <div className="hidden md:flex justify-end">
                                        {row.healthScore > 0 && <HealthBadge score={row.healthScore} />}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                {/* Empty state */}
                {loaded && pageRows.length === 0 && (
                    <div className="px-5 py-12 text-center text-body text-grey">No pages match your filter.</div>
                )}

                {/* Pagination */}
                {loaded && sorted.length > 0 && (
                    <div className="flex items-center justify-between gap-4 px-5 py-4 border-t border-grey-light dark:border-grey-light/10">
                        <span className="text-caption-2 text-grey">
                            Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, sorted.length)} of{" "}
                            {sorted.length} pages
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
                            {pageNums.map((p, i) =>
                                p === "…" ? (
                                    <span
                                        key={`el-${i}`}
                                        className="flex h-8 w-8 items-center justify-center text-caption-1 text-grey"
                                    >
                                        …
                                    </span>
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

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 text-caption-2 text-grey">
                <div className="flex items-center gap-1.5">
                    <span>Last updated: 2 hours ago</span>
                    <button
                        type="button"
                        className="hover:text-black transition-colors dark:hover:text-white"
                        title="Refresh"
                    >
                        <Icon className="h-3.5 w-3.5 fill-grey" name="refresh" />
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    <span>Data sources:</span>
                    <span className="flex items-center gap-1.5">
                        <BrandIcon brand="ga4" size={14} bare label="Google Analytics 4" />
                        Google Analytics 4
                    </span>
                    <span className="flex items-center gap-1.5">
                        <BrandIcon brand="gsc" size={14} bare label="Google Search Console" />
                        Google Search Console
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 fill-grey" name="settings" />
                        Site Crawler
                    </span>
                    <LiveBadge live={isLive} source="Search Console" />
                </div>
            </div>
        </div>
    );
};

export default TopPagesReport;
