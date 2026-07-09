"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import ScoreRing from "@/components/ui/ScoreRing";
import CountUp from "@/components/motion/CountUp";
import EmptyState from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { type ClusterRich } from "@/mocks/seo";

/* ─── helpers ─── */
const authorityColor = (score: number) =>
    score >= 75 ? "#00B894" : score >= 55 ? "#3B82F6" : score >= 35 ? "#F5A623" : "#E24B4A";

const coverageColor = (pct: number) =>
    pct >= 75 ? "#00B894" : pct >= 50 ? "#F5A623" : "#E24B4A";

const linksColor = (label: string) =>
    label === "Strong" ? "#00B894" : label === "Good" ? "#3B82F6" : "#F5A623";

/* ─── Coverage dot for topic map ─── */
type CovStatus = "strong" | "partial" | "missing" | "none";
const CovDot = ({ status }: { status: CovStatus }) => {
    const palette: Record<CovStatus, string> = {
        strong: "#00B894",
        partial: "#F5A623",
        missing: "#E24B4A",
        none: "#CBD5E0",
    };
    return (
        <span
            className="mt-[3px] h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: palette[status] }}
        />
    );
};

/* ─── Per-cluster topic status lookup ─── */
const TOPIC_STATUS: Record<string, CovStatus[]> = {
    cl1: ["strong", "strong", "strong", "partial", "missing"],
    cl2: ["strong", "strong", "partial", "missing"],
    cl3: ["partial", "missing", "missing", "none"],
    cl4: ["strong", "strong", "partial", "missing"],
};

/* ─── Topic map cluster node ─── */
const TopicMapNode = ({
    cluster,
    highlighted,
}: {
    cluster: ClusterRich;
    highlighted?: boolean;
}) => {
    const statuses = TOPIC_STATUS[cluster.id] ?? [];
    return (
        <div
            className={cn(
                "rounded-2xl border p-3",
                highlighted
                    ? "border-primary/30 bg-primary/5 dark:border-primary/20 dark:bg-primary/10"
                    : "border-grey-light bg-white/80 dark:border-grey-light/10 dark:bg-dark-1/60",
            )}
        >
            <div className="mb-2 flex items-center gap-1.5">
                <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${cluster.color}1f` }}
                >
                    <Icon className="h-3.5 w-3.5" name={cluster.icon} fill={cluster.color} />
                </span>
                <span
                    className={cn(
                        "text-caption-1 font-bold",
                        highlighted ? "text-primary dark:text-lilac" : "text-black dark:text-white",
                    )}
                >
                    {cluster.pillar}
                </span>
            </div>
            <div className="flex flex-col gap-1">
                {cluster.mapTopics.slice(0, 4).map((topic, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                        <CovDot status={statuses[i] ?? "none"} />
                        <span className="text-caption-2 leading-tight text-grey">{topic}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

/* ─── Topic Map visualization ─── */
const TopicMap = ({ clusters }: { clusters: ClusterRich[] }) => {
    const left = clusters.slice(0, 2);
    const right = clusters.slice(2, 4);
    return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
            <div className="flex flex-col gap-3">
                {left.map((c) => (
                    <TopicMapNode key={c.id} cluster={c} />
                ))}
            </div>

            {/* Center hub */}
            <div className="flex flex-col items-center justify-center gap-2 py-6">
                <div className="h-10 w-px bg-grey-light/60 dark:bg-grey-light/20" />
                <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-primary/30 bg-lavender-mist px-4 py-3 dark:border-primary/20 dark:bg-dark-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15">
                        <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="overview" />
                    </span>
                    <span className="whitespace-nowrap text-caption-2 font-semibold text-black dark:text-white">
                        Your site
                    </span>
                </div>
                <div className="h-10 w-px bg-grey-light/60 dark:bg-grey-light/20" />
            </div>

            <div className="flex flex-col gap-3">
                {right.map((c) => (
                    <TopicMapNode key={c.id} cluster={c} highlighted />
                ))}
            </div>
        </div>
    );
};

/* ─── Opportunity row ─── */
const OpportunityRow = ({
    title,
    clusterPillar,
    estClicks,
    color,
}: {
    title: string;
    clusterPillar: string;
    estClicks: string;
    color: string;
}) => {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-grey-light p-3 dark:border-grey-light/10">
            <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${color}1f` }}
            >
                <Icon className="h-4 w-4" name="document" fill={color} />
            </span>
            <div className="min-w-0 grow">
                <div className="truncate text-body-sm font-semibold text-black dark:text-white">
                    {title}
                </div>
                <div className="text-caption-2 text-grey">High-impact topic in {clusterPillar}</div>
            </div>
            <div className="shrink-0 text-right">
                <div className="text-caption-1 font-bold text-success">+{estClicks}</div>
                <div className="text-caption-2 text-grey">est. clicks</div>
            </div>
            <button className="btn-secondary btn-sm shrink-0 whitespace-nowrap">
                Generate Brief
            </button>
        </div>
    );
};

/* ─── Overview KPI cell ─── */
const OverviewKpi = ({
    icon,
    color,
    label,
    children,
    delta,
    goodWhenUp = true,
}: {
    icon: string;
    color: string;
    label: string;
    children: React.ReactNode;
    delta: number;
    goodWhenUp?: boolean;
}) => {
    const good = goodWhenUp ? delta >= 0 : delta <= 0;
    const abs = Math.abs(delta);
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
                <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: `${color}1f` }}
                >
                    <Icon className="h-5 w-5" name={icon} fill={color} />
                </span>
                <span className="text-caption-1 text-grey">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">{children}</div>
            <div className="flex items-center gap-1.5 text-caption-2 text-grey">
                <span
                    className={cn(
                        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-caption-2 font-bold",
                        good ? "bg-success/10 text-success" : "bg-error/10 text-error",
                    )}
                >
                    <Icon
                        className={cn("h-3 w-3", good ? "fill-success rotate-180" : "fill-error")}
                        name="arrow-down"
                    />
                    {abs}
                </span>
                vs last month
            </div>
        </div>
    );
};

/* ─── Cluster detail panel ─── */
const ClusterDetailPanel = ({
    cluster,
    onCollapse,
}: {
    cluster: ClusterRich;
    onCollapse: () => void;
}) => {
    const lColor = linksColor(cluster.internalLinksLabel);
    const aColor = authorityColor(cluster.authorityScore);
    const lPct = Math.min(100, Math.round((cluster.internalLinks / 20) * 100));

    return (
        <div className="border-b border-grey-light dark:border-grey-light/10">
            {/* Panel header */}
            <div className="flex flex-wrap items-center gap-3 border-b border-grey-light/50 bg-lavender-mist/30 px-5 py-3 dark:border-grey-light/10 dark:bg-dark-3/20">
                <span
                    className="flex h-7 w-7 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${cluster.color}1f` }}
                >
                    <Icon className="h-3.5 w-3.5" name={cluster.icon} fill={cluster.color} />
                </span>
                <span className="text-body-sm font-bold text-black dark:text-white">
                    {cluster.pillar}
                </span>
                <span
                    className="inline-flex items-center rounded-md px-2 py-0.5 text-[0.6875rem] font-semibold"
                    style={{ backgroundColor: `${aColor}1f`, color: aColor }}
                >
                    {cluster.authorityLabel}
                </span>
                <span className="text-caption-2 text-grey">
                    Authority Score: {cluster.authorityScore}/100
                </span>
                <button
                    className="ml-auto inline-flex items-center gap-1.5 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac"
                    onClick={onCollapse}
                >
                    Collapse
                    <Icon
                        className="h-3.5 w-3.5 rotate-180 fill-primary dark:fill-lilac"
                        name="arrow-down"
                    />
                </button>
            </div>

            {/* Panel body: 4 columns */}
            <div className="grid grid-cols-1 gap-6 bg-white/40 px-5 py-5 dark:bg-dark-1/20 sm:grid-cols-2 xl:grid-cols-4">
                {/* Covered Topics */}
                <div>
                    <p className="mb-3 text-caption-1 font-semibold text-black dark:text-white">
                        Covered Topics ({cluster.coveredTopics}/{cluster.totalTopics})
                    </p>
                    <div className="flex flex-col gap-2">
                        {cluster.coveredTopicsList.map((t, i) => (
                            <div key={i} className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success/15">
                                    <Icon className="h-2.5 w-2.5 fill-success" name="check" />
                                </span>
                                <span className="text-caption-2 leading-relaxed text-black dark:text-white">
                                    {t}
                                </span>
                            </div>
                        ))}
                    </div>
                    <button className="mt-3 text-caption-2 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                        View all covered topics →
                    </button>
                </div>

                {/* Missing / Weak Topics */}
                <div>
                    <p className="mb-3 text-caption-1 font-semibold text-black dark:text-white">
                        Missing / Weak Topics ({cluster.gaps.length})
                    </p>
                    <div className="flex flex-col gap-2.5">
                        {cluster.gaps.map((g, i) => (
                            <div
                                key={i}
                                className="rounded-xl border border-grey-light p-3 dark:border-grey-light/10"
                            >
                                <div className="mb-1.5 flex items-start gap-2">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-error/10">
                                        <Icon className="h-3 w-3 fill-error" name="plus" />
                                    </span>
                                    <span className="text-caption-2 font-semibold text-black dark:text-white">
                                        {g.title}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-caption-2 text-grey">
                                        {g.impact} impact · {g.estClicks} est. clicks
                                    </span>
                                    <button className="btn-secondary btn-sm shrink-0">
                                        Generate Brief
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="mt-3 text-caption-2 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                        View all gaps →
                    </button>
                </div>

                {/* Suggested Content */}
                <div>
                    <p className="mb-3 text-caption-1 font-semibold text-black dark:text-white">
                        Suggested Content
                    </p>
                    <div className="flex flex-col gap-2">
                        {cluster.suggestions.map((s, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-2 rounded-xl border border-grey-light p-2.5 dark:border-grey-light/10"
                            >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-lavender-mist dark:bg-dark-3">
                                    <Icon
                                        className="h-3.5 w-3.5 fill-primary dark:fill-lilac"
                                        name="document"
                                    />
                                </span>
                                <span className="min-w-0 grow truncate text-caption-2 text-black dark:text-white">
                                    {s}
                                </span>
                                <button className="btn-primary btn-sm shrink-0">Create</button>
                            </div>
                        ))}
                    </div>
                    <button className="mt-3 text-caption-2 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                        View all suggestions →
                    </button>
                </div>

                {/* Internal Links */}
                <div>
                    <p className="mb-3 text-caption-1 font-semibold text-black dark:text-white">
                        Internal Links
                    </p>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-caption-2 text-grey">
                            {cluster.internalLinks} total internal links
                        </span>
                        <span
                            className="inline-flex items-center rounded-md px-2 py-0.5 text-[0.6875rem] font-semibold"
                            style={{ backgroundColor: `${lColor}1f`, color: lColor }}
                        >
                            {cluster.internalLinksLabel}
                        </span>
                    </div>
                    <div className="mb-4 h-2 overflow-hidden rounded-full bg-grey-light/70 dark:bg-grey-light/10">
                        <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${lPct}%`, backgroundColor: lColor }}
                        />
                    </div>
                    <p className="mb-2 text-caption-2 font-semibold text-grey">Top linked pages</p>
                    <div className="flex flex-col gap-2">
                        {cluster.topLinkedPages.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-caption-2">
                                <span className="min-w-0 truncate text-black dark:text-white">
                                    {p.path}
                                </span>
                                <span className="ml-2 shrink-0 text-grey">{p.links} links</span>
                            </div>
                        ))}
                    </div>
                    <button className="mt-3 text-caption-2 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                        View link report →
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ─── Table column template ─── */
const COL =
    "grid-cols-[2fr_8rem_2fr_5rem_5rem_7rem_10rem]";

/* ─── Sort key ─── */
type SortKey = "authorityScore" | "coveragePercent" | "internalLinks" | "contentGaps" | "estTrafficGain";

/* ─── Sort button ─── */
const SortBtn = ({
    col,
    label,
    sortKey,
    sortDir,
    onSort,
}: {
    col: SortKey;
    label: string;
    sortKey: SortKey;
    sortDir: "asc" | "desc";
    onSort: (key: SortKey) => void;
}) => (
    <button
        className="flex items-center gap-1 text-caption-2 text-grey transition-colors hover:text-black dark:hover:text-white"
        onClick={() => onSort(col)}
    >
        {label}
        <Icon
            className={cn(
                "h-3 w-3 transition-transform",
                sortKey === col ? "fill-primary dark:fill-lilac" : "fill-grey",
                sortKey === col && sortDir === "asc" && "rotate-180",
            )}
            name="arrow-down"
        />
    </button>
);

/* ─── Cluster table row ─── */
const ClusterRow = ({
    cluster,
    expanded,
    onToggle,
}: {
    cluster: ClusterRich;
    expanded: boolean;
    onToggle: () => void;
}) => {
    const aColor = authorityColor(cluster.authorityScore);
    const cColor = coverageColor(cluster.coveragePercent);
    const lColor = linksColor(cluster.internalLinksLabel);

    return (
        <>
            {/* Desktop row */}
            <div
                className={cn(
                    "hidden border-b border-grey-light transition-colors dark:border-grey-light/10 md:grid",
                    COL,
                    "items-center gap-4 px-5 py-4",
                    expanded
                        ? "bg-lavender-mist/40 dark:bg-dark-3/30"
                        : "hover:bg-lavender-mist/30 dark:hover:bg-dark-3/20",
                )}
            >
                {/* Cluster name */}
                <div className="flex items-center gap-3">
                    <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${cluster.color}1f` }}
                    >
                        <Icon className="h-4 w-4" name={cluster.icon} fill={cluster.color} />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate text-body-sm font-semibold text-black dark:text-white">
                            {cluster.pillar}
                        </div>
                        <div className="text-caption-2 text-grey">
                            {cluster.pages} pages · {cluster.subtopics} subtopics
                        </div>
                    </div>
                </div>

                {/* Authority Score */}
                <div className="flex items-center gap-2">
                    <ScoreRing
                        value={cluster.authorityScore}
                        size={44}
                        color={aColor}
                        valueClassName="font-poppins text-[0.6rem] font-bold text-black dark:text-white"
                    />
                    <span className="text-caption-2 font-semibold" style={{ color: aColor }}>
                        {cluster.authorityLabel}
                    </span>
                </div>

                {/* Coverage */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-caption-2">
                        <span className="font-bold text-black dark:text-white">
                            {cluster.coveragePercent}%
                        </span>
                        <span className="text-grey">
                            {cluster.coveredTopics}/{cluster.totalTopics} topics covered
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-grey-light/70 dark:bg-grey-light/10">
                        <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${cluster.coveragePercent}%`, backgroundColor: cColor }}
                        />
                    </div>
                </div>

                {/* Internal Links */}
                <div>
                    <div className="flex items-center gap-1 text-body-sm font-bold text-black dark:text-white">
                        <Icon className="h-3.5 w-3.5 fill-grey" name="external" />
                        <CountUp value={cluster.internalLinks} />
                    </div>
                    <div className="mt-0.5 text-caption-2 font-semibold" style={{ color: lColor }}>
                        {cluster.internalLinksLabel}
                    </div>
                </div>

                {/* Content Gaps */}
                <div>
                    <div
                        className="text-body-sm font-bold"
                        style={{ color: cluster.contentGaps > 0 ? "#E24B4A" : "#00B894" }}
                    >
                        <CountUp value={cluster.contentGaps} />
                    </div>
                    <div className="mt-0.5 text-caption-2 text-grey">
                        {cluster.contentGaps === 1 ? "opportunity" : "opportunities"}
                    </div>
                </div>

                {/* Est. Traffic Gain */}
                <div>
                    <div className="font-poppins text-base font-bold text-success">
                        +
                        <CountUp
                            value={cluster.estTrafficGain / 1000}
                            decimals={1}
                            suffix="K"
                        />
                    </div>
                    <div className="mt-0.5 text-caption-2 text-grey">monthly clicks</div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button className="btn-secondary btn-sm" onClick={onToggle}>
                        {expanded ? "Collapse" : "View details"}
                    </button>
                    <button
                        className="flex h-8 w-8 items-center justify-center rounded-[0.625rem] bg-lavender-mist transition-colors hover:bg-grey-light/40 dark:bg-dark-3"
                        onClick={onToggle}
                        aria-label={expanded ? "Collapse row" : "Expand row"}
                    >
                        <Icon
                            className={cn(
                                "h-4 w-4 fill-grey transition-transform duration-200",
                                expanded && "rotate-180",
                            )}
                            name="arrow-down"
                        />
                    </button>
                </div>
            </div>

            {/* Mobile card */}
            <div
                className={cn(
                    "flex cursor-pointer items-center gap-3 border-b border-grey-light px-4 py-3 transition-colors dark:border-grey-light/10 md:hidden",
                    expanded
                        ? "bg-lavender-mist/40 dark:bg-dark-3/30"
                        : "hover:bg-lavender-mist/30 dark:hover:bg-dark-3/20",
                )}
                onClick={onToggle}
            >
                <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${cluster.color}1f` }}
                >
                    <Icon className="h-4 w-4" name={cluster.icon} fill={cluster.color} />
                </span>
                <div className="min-w-0 grow">
                    <div className="text-body-sm font-semibold text-black dark:text-white">
                        {cluster.pillar}
                    </div>
                    <div className="text-caption-2 text-grey">
                        {cluster.pages} pages · Score {cluster.authorityScore}/100
                    </div>
                </div>
                <ScoreRing
                    value={cluster.authorityScore}
                    size={36}
                    color={authorityColor(cluster.authorityScore)}
                />
                <Icon
                    className={cn(
                        "h-4 w-4 shrink-0 fill-grey transition-transform duration-200",
                        expanded && "rotate-180",
                    )}
                    name="arrow-down"
                />
            </div>

            {/* Expanded detail panel */}
            {expanded && (
                <ClusterDetailPanel cluster={cluster} onCollapse={onToggle} />
            )}
        </>
    );
};

/* ─── Live API shape ─── */
/** The live endpoint returns a thinner cluster than ClusterRich (`coverage`
 *  instead of `coveragePercent`; no gaps/authority/links yet). */
type LiveCluster = Partial<ClusterRich> & { id: string; pillar: string; pages: number; coverage?: number };
type LiveResp = {
    hasData: boolean;
    authorityScore?: number;
    clustersTracked?: number;
    contentGaps?: number;
    estTrafficGain?: number;
    clusters?: LiveCluster[];
};

/** Fill the ClusterRich fields the UI dereferences with safe defaults so a
 *  partial live cluster can't crash the page; provided fields win. */
const toClusterRich = (c: LiveCluster): ClusterRich => ({
    icon: "grid",
    color: "#6C5CE7",
    subtopics: 0,
    authorityScore: 0,
    authorityLabel: "Needs work",
    coveragePercent: c.coverage ?? 0,
    coveredTopics: 0,
    totalTopics: 0,
    internalLinks: 0,
    internalLinksLabel: "Weak",
    contentGaps: 0,
    estTrafficGain: 0,
    coveredTopicsList: [],
    mapTopics: [],
    gaps: [],
    suggestions: [],
    topLinkedPages: [],
    ...c,
});

/* ─── Main component ─── */
const Clusters = () => {
    const [live, setLive] = useState<LiveResp | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [query, setQuery] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("authorityScore");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        api<LiveResp>("/seo/clusters")
            .then((d) => (d.hasData ? setLive(d) : null))
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    const isLive = !!live && !!live.clusters?.length;
    const clusters: ClusterRich[] = isLive ? live!.clusters!.map(toClusterRich) : [];

    // Overview KPIs, derived from the live crawl.
    const overview = {
        authorityScore: live?.authorityScore ?? 0,
        authorityScoreDelta: 0,
        clustersTracked: live?.clustersTracked ?? clusters.length,
        clustersTrackedDelta: 0,
        contentGaps: live?.contentGaps ?? clusters.reduce((s, c) => s + c.contentGaps, 0),
        contentGapsDelta: 0,
        estTrafficGain: live?.estTrafficGain ?? clusters.reduce((s, c) => s + c.estTrafficGain, 0),
        estTrafficGainDelta: 0,
    };

    // Top opportunities: the biggest content gaps across the live clusters.
    const parseClicks = (s: string) => {
        const n = parseFloat(s);
        return Number.isNaN(n) ? 0 : /k/i.test(s) ? n * 1000 : n;
    };
    const topicalOpportunities = clusters
        .flatMap((c) => c.gaps.map((g) => ({ title: g.title, clusterPillar: c.pillar, clusterId: c.id, estClicks: g.estClicks })))
        .sort((a, b) => parseClicks(b.estClicks) - parseClicks(a.estClicks))
        .slice(0, 4);

    const filtered = useMemo(() => {
        const q = query.toLowerCase();
        return clusters.filter((c) => c.pillar.toLowerCase().includes(q));
    }, [clusters, query]);

    const sorted = useMemo(
        () =>
            [...filtered].sort((a, b) => {
                const diff = a[sortKey] - b[sortKey];
                return sortDir === "desc" ? -diff : diff;
            }),
        [filtered, sortKey, sortDir],
    );

    const toggleSort = (key: SortKey) => {
        if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        else { setSortKey(key); setSortDir("desc"); }
    };

    const clusterColorMap = Object.fromEntries(
        clusters.map((c) => [c.id, c.color]),
    );

    if (!isLive) {
        if (!loaded) return null;
        return (
            <EmptyState
                icon="search"
                title="No clusters yet"
                description="Run a scan to map your topical clusters."
                action={{ label: "Run a scan", href: "/seo/optimizer" }}
            />
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* ─── 1. Topical Authority Overview ─── */}
            <Card>
                <div className="mb-5 flex items-center gap-2.5">
                    <h2 className="text-h5 text-black dark:text-white">
                        Topical Authority Overview
                    </h2>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 xl:grid-cols-[repeat(4,1fr)_minmax(11rem,1.3fr)]">
                    <OverviewKpi
                        icon="compass"
                        color="#6C5CE7"
                        label="Topical Authority Score"
                        delta={overview.authorityScoreDelta}
                    >
                        <CountUp
                            value={overview.authorityScore}
                            className="font-poppins text-[1.75rem] font-extrabold leading-none text-black dark:text-white"
                        />
                        <span className="font-poppins text-base font-normal text-grey">
                            {" "} / 100
                        </span>
                    </OverviewKpi>

                    <OverviewKpi
                        icon="grid"
                        color="#3B82F6"
                        label="Clusters Tracked"
                        delta={overview.clustersTrackedDelta}
                    >
                        <CountUp
                            value={overview.clustersTracked}
                            className="font-poppins text-[1.75rem] font-extrabold leading-none text-black dark:text-white"
                        />
                    </OverviewKpi>

                    <OverviewKpi
                        icon="document"
                        color="#F5A623"
                        label="Content Gaps"
                        delta={overview.contentGapsDelta}
                        goodWhenUp={false}
                    >
                        <CountUp
                            value={overview.contentGaps}
                            className="font-poppins text-[1.75rem] font-extrabold leading-none text-black dark:text-white"
                        />
                    </OverviewKpi>

                    <OverviewKpi
                        icon="chart"
                        color="#00B894"
                        label="Estimated Traffic Gain"
                        delta={overview.estTrafficGainDelta}
                    >
                        <CountUp
                            value={overview.estTrafficGain / 1000}
                            decimals={1}
                            prefix="+"
                            suffix="K"
                            className="font-poppins text-[1.75rem] font-extrabold leading-none text-success"
                        />
                    </OverviewKpi>

                    {/* Explainer card */}
                    <div className="col-span-2 rounded-2xl bg-lavender-mist p-4 dark:bg-dark-3 sm:col-span-4 xl:col-span-1">
                        <p className="mb-1.5 text-caption-1 font-semibold text-primary dark:text-lilac">
                            What is a topical cluster?
                        </p>
                        <p className="text-caption-2 leading-relaxed text-grey">
                            Clusters help search engines understand your expertise. Cover all important subtopics to build topical authority.
                        </p>
                        <button className="mt-3 inline-flex items-center gap-1 text-caption-2 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                            Learn more
                            <Icon className="h-3 w-3 fill-primary dark:fill-lilac" name="external" />
                        </button>
                    </div>
                </div>
            </Card>

            {/* ─── 2. Topic Map + Top Opportunities ─── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[55fr_45fr]">
                {/* Topic Map */}
                <Card className="flex flex-col">
                    <div className="mb-3 flex items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">Topic Map</h2>
                    </div>
                    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption-2 text-grey">
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-[#00B894]" />
                            Strong coverage
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-[#F5A623]" />
                            Partial coverage
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-[#E24B4A]" />
                            Missing
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-grey-light dark:bg-dark-3" />
                            No content
                        </span>
                    </div>
                    <TopicMap clusters={clusters} />
                </Card>

                {/* Top Opportunities */}
                <Card className="flex flex-col">
                    <div className="mb-4 flex items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">Top Opportunities</h2>
                    </div>
                    <div className="flex flex-col gap-2.5">
                        {topicalOpportunities.map((opp, i) => (
                            <OpportunityRow
                                key={i}
                                title={opp.title}
                                clusterPillar={opp.clusterPillar}
                                estClicks={opp.estClicks}
                                color={clusterColorMap[opp.clusterId] ?? "#6C5CE7"}
                            />
                        ))}
                    </div>
                    <button className="mt-4 inline-flex items-center gap-1.5 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                        View all opportunities
                        <Icon className="h-3.5 w-3.5 fill-primary dark:fill-lilac" name="external" />
                    </button>
                </Card>
            </div>

            {/* ─── 3. Topical Clusters table ─── */}
            <Card className="!p-0 overflow-hidden">
                {/* Table header bar */}
                <div className="flex flex-wrap items-center gap-3 p-5">
                    <h2 className="text-h5 text-black dark:text-white">
                        Topical Clusters
                        <span className="ml-1.5 font-normal text-grey">({filtered.length})</span>
                    </h2>
                    <div className="relative ml-auto">
                        <Icon
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-grey"
                            name="search"
                        />
                        <input
                            type="text"
                            placeholder="Search clusters..."
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setExpandedId(null);
                            }}
                            className="h-9 w-52 rounded-[0.625rem] bg-lavender-mist pl-9 pr-3 text-body-sm text-black outline-none placeholder:text-grey focus:ring-1 focus:ring-primary dark:bg-dark-3 dark:text-white"
                        />
                    </div>
                </div>

                {/* Column headers (desktop only) */}
                <div
                    className={cn(
                        "hidden border-y border-grey-light px-5 py-2.5 dark:border-grey-light/10 md:grid",
                        COL,
                        "items-center gap-4",
                    )}
                >
                    <span className="text-caption-2 text-grey">Cluster</span>
                    <SortBtn
                        col="authorityScore"
                        label="Authority Score"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                    />
                    <SortBtn
                        col="coveragePercent"
                        label="Coverage"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                    />
                    <SortBtn
                        col="internalLinks"
                        label="Internal Links"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                    />
                    <SortBtn
                        col="contentGaps"
                        label="Content Gaps"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                    />
                    <SortBtn
                        col="estTrafficGain"
                        label="Est. Traffic Gain"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                    />
                    <span />
                </div>

                {/* Rows */}
                {sorted.length === 0 ? (
                    <div className="px-5 py-12 text-center text-body text-grey">
                        No clusters match your search.
                    </div>
                ) : (
                    sorted.map((c) => (
                        <ClusterRow
                            key={c.id}
                            cluster={c}
                            expanded={expandedId === c.id}
                            onToggle={() =>
                                setExpandedId((prev) => (prev === c.id ? null : c.id))
                            }
                        />
                    ))
                )}

                {/* Footer */}
                <div className="px-5 py-4">
                    <button className="inline-flex items-center gap-1.5 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                        View all {overview.clustersTracked} clusters
                        <Icon
                            className="h-3.5 w-3.5 fill-primary dark:fill-lilac"
                            name="external"
                        />
                    </button>
                </div>
            </Card>
        </div>
    );
};

export default Clusters;
