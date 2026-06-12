"use client";

import { useEffect, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import BrandIcon from "@/components/ui/BrandIcon";
import Sparkline from "@/components/charts/Sparkline";
import ConnectLock from "@/components/ui/ConnectLock";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useConnections } from "@/lib/useConnections";
import LiveBadge from "./LiveBadge";
import {
    type BacklinkLinkType,
    type BacklinkRow,
} from "@/mocks/seo";

/* ─── helpers ─── */
const fmtNum = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`;

const drColor = (dr: number) =>
    dr >= 50 ? "#00B894" : dr >= 35 ? "#3B82F6" : dr >= 20 ? "#F5A623" : "#E24B4A";

/* ─── types ─── */
type ApiResp = {
    hasData: boolean;
    source: "ga4" | "provider";
    provider?: string;
    referringDomains: number;
    referralSessions: number;
    totalBacklinks: number | null;
    newDomains: number | null;
    topReferring: { domain: string; sessions: number }[];
};

type SortKey = "domainRating" | "firstSeenTs" | "lastSeenTs";
type LinkTab = "All" | BacklinkLinkType;

/* ─── constants ─── */
const LINK_TYPE_COLORS: Record<string, string> = {
    Dofollow: "#00B894",
    Nofollow: "#3B82F6",
    UGC: "#6C5CE7",
    Sponsored: "#F5A623",
};

const KPI_CONFIGS = [
    { key: "referringDomains" as const, label: "Referring domains", icon: "compass", color: "#00B894" },
    { key: "totalBacklinks" as const, label: "Backlinks (total)", icon: "external", color: "#6C5CE7" },
    { key: "referralSessions" as const, label: "Referral sessions", icon: "overview", color: "#3B82F6" },
    { key: "dofollowLinks" as const, label: "Dofollow links", icon: "send", color: "#F5A623" },
    { key: "domainRating" as const, label: "Domain rating (avg.)", icon: "star", color: "#E91E63" },
];

type KpiKey = (typeof KPI_CONFIGS)[number]["key"];

const PAGE_SIZE = 10;

/* ─── sub-components ─── */
const DeltaChip = ({ value }: { value: number }) => (
    <span
        className={cn(
            "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-caption-2 font-bold",
            value >= 0 ? "bg-success/10 text-success" : "bg-error/10 text-error",
        )}
    >
        <Icon
            className={cn("h-3 w-3", value >= 0 ? "fill-success rotate-180" : "fill-error")}
            name="arrow-down"
        />
        {value > 0 ? "+" : ""}
        {value}%
    </span>
);

const LinkTypeBadge = ({ type }: { type: BacklinkLinkType }) => {
    const color = LINK_TYPE_COLORS[type];
    return (
        <span
            className="inline-flex items-center rounded-md px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap"
            style={{ backgroundColor: `${color}1a`, color }}
        >
            {type}
        </span>
    );
};

const DomainRatingBadge = ({ rating }: { rating: number }) => {
    const color = drColor(rating);
    return (
        <span
            className="inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-md px-1.5 text-caption-1 font-bold"
            style={{ backgroundColor: `${color}1a`, color }}
        >
            {rating}
        </span>
    );
};

/* ─── main ─── */
const BacklinksReport = () => {
    const [live, setLive] = useState<ApiResp | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [query, setQuery] = useState("");
    const [linkTab, setLinkTab] = useState<LinkTab>("All");
    const [sortKey, setSortKey] = useState<SortKey>("domainRating");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [page, setPage] = useState(1);
    const tableRef = useRef<HTMLDivElement>(null);
    const { connections: conn, loading: connLoading } = useConnections();

    useEffect(() => {
        api<ApiResp>("/seo/backlinks")
            .then((d) => setLive(d.hasData ? d : null))
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    const isLive = !!live;

    /* KPI values — prefer live API data, fall back to mock */
    type KpiEntry = { value: number | null; delta: number | null; spark: number[] };
    const kpiData: Record<KpiKey, KpiEntry> = isLive
        ? {
              referringDomains: { value: live!.referringDomains, delta: null, spark: [] },
              totalBacklinks: { value: live!.totalBacklinks, delta: null, spark: [] },
              referralSessions: { value: live!.referralSessions, delta: null, spark: [] },
              dofollowLinks: { value: null, delta: null, spark: [] },
              domainRating: { value: null, delta: null, spark: [] },
          }
        : {
              referringDomains: { value: null, delta: null, spark: [] },
              totalBacklinks: { value: null, delta: null, spark: [] },
              referralSessions: { value: null, delta: null, spark: [] },
              dofollowLinks: { value: null, delta: null, spark: [] },
              domainRating: { value: null, delta: null, spark: [] },
          };

    /* Filter — per-backlink detail is not available from GA4/aggregate sources,
       so the row table stays empty until a backlinks provider feeds real rows. */
    const rows: BacklinkRow[] = [];
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r: BacklinkRow) => {
        if (q && !r.pageTitle.toLowerCase().includes(q) && !r.domainName.toLowerCase().includes(q) && !r.anchorText.toLowerCase().includes(q)) return false;
        if (linkTab !== "All" && r.linkType !== linkTab) return false;
        return true;
    });

    /* Sort */
    const sorted = [...filtered].sort((a, b) => {
        const dir = sortDir === "desc" ? -1 : 1;
        if (sortKey === "domainRating") return (a.domainRating - b.domainRating) * dir;
        if (sortKey === "firstSeenTs") return (a.firstSeenTs - b.firstSeenTs) * dir;
        if (sortKey === "lastSeenTs") return (a.lastSeenTs - b.lastSeenTs) * dir;
        return 0;
    });

    /* Paginate */
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    /* Pagination numbers */
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

    const doSort = (key: SortKey) => {
        if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        else {
            setSortKey(key);
            setSortDir("desc");
        }
        setPage(1);
        tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const setTab = (tab: LinkTab) => {
        setLinkTab(tab);
        setPage(1);
    };

    /* Per-link-type breakdown requires a backlinks provider; no sample fallback. */
    const linkTypeBreakdown: { label: string; count: number; pct: number; color: string }[] = [];
    const totalLinks = linkTypeBreakdown.reduce((s, t) => s + t.count, 0);
    const liveSource = live?.source === "provider" ? (live.provider ?? "Provider") : "GA4";

    /* Desktop table grid */
    const DESKTOP_COLS = "md:grid-cols-[minmax(0,2fr)_4.5rem_6rem_2.5rem_minmax(0,1.3fr)_minmax(0,1fr)_6rem_6rem]";

    return (
        <div className="flex flex-col gap-6">
            {/* Intro + date filter */}
            <div className="flex items-center justify-between gap-4 -mt-4">
                <p className="text-body text-grey">
                    Analyze your backlink profile and see how links contribute to your site&apos;s authority and traffic.
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
                connected={conn.ga4 || conn.backlinks}
                loading={connLoading}
                brand="Google Analytics"
                title="Connect a backlinks source"
                description="Connect Google Analytics 4 or a backlinks provider to see your referring domains and link growth."
                href="/settings/integrations?tab=analytics"
                ctaLabel="Connect a source"
            >
            <div className="flex flex-col gap-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
                {KPI_CONFIGS.map((kpi) => {
                    const d = kpiData[kpi.key];
                    const displayVal = d.value == null ? "—" : fmtNum(d.value);
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
                                    {isLive && d.value == null ? (
                                        <span className="text-caption-2 text-grey">Not connected</span>
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

            {/* Link type distribution — only when a provider supplies the breakdown */}
            {linkTypeBreakdown.length > 0 && (
            <Card className="!p-5">
                <div className="mb-4 flex items-center gap-2">
                    <h2 className="text-h5 text-black dark:text-white">Backlinks by link type</h2>
                    <Icon className="h-4 w-4 fill-grey" name="info" />
                    <span className="text-caption-2 text-grey">{fmtNum(totalLinks)} total links</span>
                    <div className="ml-auto">
                        <LiveBadge live source={liveSource} />
                    </div>
                </div>

                {/* Stacked bar */}
                <div className="flex h-3 w-full overflow-hidden rounded-[0.25rem] bg-grey-light/30 dark:bg-dark-3">
                    {linkTypeBreakdown.map((t, i) => (
                        <div
                            key={t.label}
                            style={{ width: `${t.pct}%`, backgroundColor: t.color }}
                            className={cn("h-full shrink-0", i < linkTypeBreakdown.length - 1 && "border-r-2 border-white dark:border-dark-1")}
                        />
                    ))}
                </div>

                {/* Segment labels — aligned with each segment start */}
                <div className="mt-3 flex w-full">
                    {linkTypeBreakdown.map((t) => (
                        <div
                            key={t.label}
                            style={{ width: `${t.pct}%` }}
                            className="overflow-visible whitespace-nowrap"
                        >
                            <div className="text-caption-1 font-bold" style={{ color: t.color }}>
                                {t.pct}%
                            </div>
                            <div className="text-caption-2 font-semibold text-black dark:text-white">{t.label}</div>
                            <div className="text-caption-2 text-grey">{fmtNum(t.count)}</div>
                        </div>
                    ))}
                </div>

                {/* Scale */}
                <div className="mt-2 flex justify-between">
                    {["0%", "25%", "50%", "75%", "100%"].map((label) => (
                        <span key={label} className="text-[0.625rem] text-grey">
                            {label}
                        </span>
                    ))}
                </div>
            </Card>
            )}

            {/* Table */}
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
                            placeholder="Filter backlinks..."
                            className="w-full h-9 pl-10 pr-3 rounded-[0.625rem] bg-lavender-mist text-body-sm text-black outline-none placeholder:text-grey dark:bg-dark-3 dark:text-white"
                        />
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => setTab("All")}
                            className={cn(
                                "h-9 px-3.5 rounded-[0.625rem] text-caption-1 font-semibold transition-colors",
                                linkTab === "All"
                                    ? "bg-primary text-white"
                                    : "bg-lavender-mist text-grey hover:text-black dark:bg-dark-3 dark:hover:text-white",
                            )}
                        >
                            All
                        </button>
                        {(["Dofollow", "Nofollow", "UGC", "Sponsored"] as BacklinkLinkType[]).map((type) => {
                            const color = LINK_TYPE_COLORS[type];
                            const active = linkTab === type;
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setTab(type)}
                                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[0.625rem] text-caption-1 font-semibold transition-colors"
                                    style={{
                                        backgroundColor: active ? `${color}28` : `${color}15`,
                                        color,
                                    }}
                                >
                                    <span
                                        className="h-2 w-2 rounded-full shrink-0"
                                        style={{ backgroundColor: color }}
                                    />
                                    {type}
                                </button>
                            );
                        })}
                    </div>
                    {/* Per-backlink detail isn't available from GA4/aggregate sources,
                        so rows stay empty until a backlinks provider feeds them. */}
                    <div className="ml-auto">
                        <LiveBadge live={isLive} source={liveSource} />
                    </div>
                </div>

                {/* Table header — desktop only */}
                <div
                    className={cn(
                        "hidden md:grid items-center gap-x-3 px-5 py-3 border-y border-grey-light text-caption-2 text-grey dark:border-grey-light/10",
                        DESKTOP_COLS,
                    )}
                >
                    <span>Referring page</span>
                    <button
                        type="button"
                        onClick={() => doSort("domainRating")}
                        className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors text-left"
                    >
                        Domain rating
                        <Icon
                            className={cn("h-3 w-3 fill-grey shrink-0", sortKey === "domainRating" && sortDir === "asc" ? "rotate-180" : "")}
                            name="arrow-down"
                        />
                    </button>
                    <span>Link type</span>
                    <span>Backlink</span>
                    <span>Target page</span>
                    <span>Anchor text</span>
                    <button
                        type="button"
                        onClick={() => doSort("firstSeenTs")}
                        className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                    >
                        First seen
                        <Icon
                            className={cn("h-3 w-3 fill-grey shrink-0", sortKey === "firstSeenTs" && sortDir === "asc" ? "rotate-180" : "")}
                            name="arrow-down"
                        />
                    </button>
                    <button
                        type="button"
                        onClick={() => doSort("lastSeenTs")}
                        className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                    >
                        Last seen
                        <Icon
                            className={cn("h-3 w-3 fill-grey shrink-0", sortKey === "lastSeenTs" && sortDir === "asc" ? "rotate-180" : "")}
                            name="arrow-down"
                        />
                    </button>
                </div>

                {/* Loading skeleton */}
                {!loaded && (
                    <div className="flex flex-col">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-4 px-5 py-3.5 border-b border-grey-light dark:border-grey-light/10 last:border-b-0"
                            >
                                <span className="h-8 w-8 shrink-0 animate-pulse rounded-[0.5rem] bg-grey-light/60 dark:bg-dark-3" />
                                <span className="h-4 flex-1 animate-pulse rounded bg-grey-light/60 dark:bg-dark-3" />
                                <span className="h-4 w-16 animate-pulse rounded bg-grey-light/60 dark:bg-dark-3" />
                                <span className="h-4 w-20 animate-pulse rounded bg-grey-light/60 dark:bg-dark-3" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Table rows */}
                {loaded &&
                    pageRows.map((row) => (
                        <div
                            key={row.id}
                            className={cn(
                                "border-b border-grey-light last:border-b-0 hover:bg-lavender-mist/40 dark:border-grey-light/10 dark:hover:bg-dark-3/40 transition-colors",
                                "grid items-center gap-x-3 px-5 py-3 grid-cols-[minmax(0,1fr)_4.5rem_6rem]",
                                DESKTOP_COLS,
                                "md:py-3.5",
                            )}
                        >
                            {/* Referring page */}
                            <div className="flex items-center gap-3 min-w-0">
                                <span
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.5rem] font-poppins text-caption-1 font-bold"
                                    style={{ backgroundColor: `${row.color}1f`, color: row.color }}
                                >
                                    {row.pageTitle.charAt(0).toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                    <div className="truncate text-body-sm font-semibold text-black dark:text-white">
                                        {row.pageTitle}
                                    </div>
                                    <div className="truncate text-caption-2 text-grey">{row.domainName}</div>
                                </div>
                            </div>

                            {/* Domain rating */}
                            <div>
                                <DomainRatingBadge rating={row.domainRating} />
                            </div>

                            {/* Link type */}
                            <div>
                                <LinkTypeBadge type={row.linkType} />
                            </div>

                            {/* Backlink icon — desktop only */}
                            <div className="hidden md:flex justify-center">
                                <a
                                    href={row.backlinkUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex h-7 w-7 items-center justify-center rounded-[0.5rem] bg-lavender-mist hover:bg-lavender-mist/80 transition-colors dark:bg-dark-3"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Icon className="h-3.5 w-3.5 fill-grey" name="external" />
                                </a>
                            </div>

                            {/* Target page — desktop only */}
                            <div className="hidden md:block min-w-0">
                                <div className="truncate text-body-sm font-medium text-black dark:text-white">
                                    {row.targetPath}
                                </div>
                                <div className="text-caption-2 text-grey">{row.targetLabel}</div>
                            </div>

                            {/* Anchor text — desktop only */}
                            <div className="hidden md:block min-w-0">
                                <span className="truncate text-body-sm text-grey">{row.anchorText}</span>
                            </div>

                            {/* First seen — desktop only */}
                            <div className="hidden md:block">
                                <span className="text-body-sm text-grey">{row.firstSeen}</span>
                            </div>

                            {/* Last seen — desktop only */}
                            <div className="hidden md:block">
                                <span className="text-body-sm text-grey">{row.lastSeen}</span>
                            </div>
                        </div>
                    ))}

                {/* Empty state */}
                {loaded && pageRows.length === 0 && (
                    <div className="px-5 py-12 text-center text-body text-grey">No backlinks match your filter.</div>
                )}

                {/* Pagination */}
                {loaded && sorted.length > 0 && (
                    <div className="flex items-center justify-between gap-4 px-5 py-4 border-t border-grey-light dark:border-grey-light/10">
                        <span className="text-caption-2 text-grey">
                            Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, sorted.length)} of{" "}
                            {sorted.length} backlinks
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
                    <LiveBadge live={isLive} source={liveSource} />
                </div>
            </div>
        </div>
    );
};

export default BacklinksReport;
