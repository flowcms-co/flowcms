"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import BrandIcon from "@/components/ui/BrandIcon";
import LiveBadge from "@/templates/seo/LiveBadge";
import StatNumber from "@/components/motion/StatNumber";
import CountUp from "@/components/motion/CountUp";
import MetricBar from "@/components/ui/MetricBar";
import SeoDonut from "@/components/charts/SeoDonut";
import Sparkline from "@/components/charts/Sparkline";
import ConnectLock from "@/components/ui/ConnectLock";
import EmptyState from "@/components/ui/EmptyState";
import { useConnections } from "@/lib/useConnections";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { resolveBrand } from "@/lib/brands";

/** Compact number: 1,240,000 → 1.24M · 124,800 → 124.8K · 512 → 512. */
const fmtNum = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`;

type Kpi = { value: number; delta: number | null; goodWhenUp: boolean };
type Summary = {
    hasData: boolean;
    kpis?: { clicks: Kpi; impressions: Kpi; ctr: Kpi; position: Kpi; sessions: Kpi; bounce: Kpi };
};
type ScorePillar = { key: string; label: string; source: string; weight: number; score: number | null; live: boolean };
type ScoreResp = { hasData: boolean; score: number | null; pillars: ScorePillar[] };
type IssuesResp = {
    score: number | null;
    counts: { total: number; pages: number; aiFixable: number; clean: number };
    categories: { key: string; label: string; count: number }[];
};
type AeoEngine = { id: string; name: string; citedQueries: number; totalQueries: number; share: number };
type AeoResp = { hasData: boolean; score?: number; engines?: AeoEngine[]; referral?: { platform: string; sessions: number }[] };
type LiveKeyword = { id: string; term: string; clicks: number; impressions: number; position: number };
type TopPage = { url: string; path: string; clicks: number; impressions: number; ctr: number; position: number };
type TopPagesResp = { hasData: boolean; total: number; pages: TopPage[] };
type RefDomain = { domain: string; sessions: number };
type BacklinksResp = {
    hasData: boolean;
    source: "ga4" | "provider";
    provider?: string;
    metric: "sessions" | "backlinks";
    referringDomains: number;
    referralSessions: number;
    newDomains: number | null;
    totalBacklinks: number | null;
    topReferring: RefDomain[];
};

const PILLAR_COLOR: Record<string, string> = { visibility: "#6C5CE7", technical: "#00B894", speed: "#F5A623", content: "#3B82F6", authority: "#E91E63" };

/** Severity-tinted glyphs for each grouped issue category (keys match the audit). */
const CAT_STYLE: Record<string, { icon: string; color: string }> = {
    metadata: { icon: "document", color: "#E24B4A" },
    schema: { icon: "grid", color: "#F5A623" },
    structure: { icon: "menu", color: "#6C5CE7" },
    content: { icon: "edit", color: "#00B894" },
    performance: { icon: "chart", color: "#3B82F6" },
    technical: { icon: "settings", color: "#6C5CE7" },
    readiness: { icon: "sparkles", color: "#6C5CE7" },
    links: { icon: "compass", color: "#F5A623" },
    cannibalization: { icon: "hash", color: "#3B82F6" },
    search: { icon: "search", color: "#3B82F6" },
    tracking: { icon: "eye", color: "#F5A623" },
    images: { icon: "image", color: "#00B894" },
    other: { icon: "info", color: "#9999B0" },
};
const catStyle = (k: string) => CAT_STYLE[k] ?? CAT_STYLE.other;

/** Brand-ish accent per AI platform (live referral can return any of these names). */
const PLATFORM_COLOR: Record<string, string> = {
    ChatGPT: "#6C5CE7",
    Perplexity: "#3B82F6",
    Gemini: "#00B894",
    "Google Gemini": "#00B894",
    "Google AI Overviews": "#6C5CE7",
    Claude: "#E91E63",
    Copilot: "#F5A623",
    "Microsoft Copilot": "#F5A623",
    Grok: "#1A1A2E",
    DeepSeek: "#3B82F6",
    Groq: "#F5A623",
    Mistral: "#E24B4A",
};
const platformColor = (name: string, i: number) => PLATFORM_COLOR[name] ?? ["#6C5CE7", "#3B82F6", "#00B894", "#E91E63", "#F5A623"][i % 5];

const DATA_SOURCES = [
    { label: "Google Search Console", icon: "search", color: "#4285F4" },
    { label: "GA4", icon: "chart", color: "#E37400" },
    { label: "PageSpeed Insights", icon: "overview", color: "#34A853" },
    { label: "Site Crawler", icon: "compass", color: "#6C5CE7" },
];

const ratingOf = (s: number) =>
    s >= 90 ? { label: "Excellent", color: "#00B894" } : s >= 75 ? { label: "Good", color: "#00B894" } : s >= 50 ? { label: "Fair", color: "#F5A623" } : { label: "Needs work", color: "#E24B4A" };

/** Inline up/down delta chip (curved-square, no pill). */
const DeltaChip = ({ good, dir, children }: { good: boolean; dir: "up" | "down"; children: React.ReactNode }) => (
    <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-caption-2 font-bold", good ? "bg-success/10 text-success" : "bg-error/10 text-error")}>
        <Icon className={cn("h-3 w-3", good ? "fill-success" : "fill-error", dir === "up" ? "rotate-180" : "")} name="arrow-down" />
        {children}
    </span>
);

/** Tiny brand badge: tinted curved square with the source's initial. */
const InitialBadge = ({ name, color }: { name: string; color: string }) => {
    if (resolveBrand(name)) return <BrandIcon brand={name} size={28} rounded="rounded-[0.5rem]" label={name} />;
    return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.5rem] font-poppins text-caption-2 font-bold" style={{ backgroundColor: `${color}1f`, color }}>
            {name.replace(/^https?:\/\//, "").charAt(0).toUpperCase()}
        </span>
    );
};

/**
 * SEO Dashboard — real-time overview of SEO performance and opportunities:
 * SEO Health (the one FlowCMS score + pillars) and an Issues Snapshot on top,
 * a clicks/impressions/CTR/position KPI strip, AI Search & Answer Engines next
 * to a Backlinks overview, then Top pages + Top keywords. Live where connected,
 * empty behind a ConnectLock otherwise (each card carries a Live badge). The deep
 * audit, Core Web Vitals, clusters and AEO detail live on their own SEO sub-pages.
 */
const SeoDashboard = () => {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [score, setScore] = useState<ScoreResp | null>(null);
    const [topKw, setTopKw] = useState<LiveKeyword[] | null>(null);
    const [topPagesData, setTopPagesData] = useState<TopPagesResp | null>(null);
    const [backlinks, setBacklinks] = useState<BacklinksResp | null>(null);
    const [issues, setIssues] = useState<IssuesResp | null>(null);
    const [scoreLoaded, setScoreLoaded] = useState(false);
    const [issuesLoaded, setIssuesLoaded] = useState(false);
    const [aeo, setAeo] = useState<AeoResp | null>(null);
    const [rerunning, setRerunning] = useState(false);
    const [updatedLabel, setUpdatedLabel] = useState("just now");
    const { connections: conn, loading: connLoading } = useConnections();

    const loadCore = useCallback(() => {
        api<Summary>("/seo/summary").then((d) => setSummary(d.hasData ? d : null)).catch(() => {});
        api<ScoreResp>("/seo/score").then((d) => setScore(d.hasData ? d : null)).catch(() => {}).finally(() => setScoreLoaded(true));
        api<{ hasData: boolean; keywords: LiveKeyword[] }>("/seo/keywords").then((d) => setTopKw(d.hasData ? d.keywords : null)).catch(() => {});
        api<TopPagesResp>("/seo/top-pages").then((d) => setTopPagesData(d.hasData ? d : null)).catch(() => {});
        api<BacklinksResp>("/seo/backlinks").then((d) => setBacklinks(d.hasData ? d : null)).catch(() => {});
        api<IssuesResp>("/seo/scan/issues").then(setIssues).catch(() => {}).finally(() => setIssuesLoaded(true));
        api<AeoResp>("/seo/aeo").then(setAeo).catch(() => {});
    }, []);

    useEffect(() => {
        loadCore();
    }, [loadCore]);

    const refresh = async () => {
        if (rerunning) return;
        setRerunning(true);
        // Re-run the crawl + speed test so the score recomputes, then reload everything.
        await Promise.all([
            api("/seo/audit?refresh=1").catch(() => {}),
            api("/seo/vitals?refresh=1").catch(() => {}),
        ]);
        loadCore();
        setUpdatedLabel("just now");
        setRerunning(false);
    };

    // ── SEO Health (the one FlowCMS SEO Score, crawler-internal) ──
    const scoreLive = !!score?.hasData;
    const scoreValue = scoreLive ? score!.score! : 0;
    const pillars = scoreLive ? score!.pillars : [];
    const rating = ratingOf(scoreValue);
    const segments = pillars.map((p) => ({ label: p.label, value: Math.max(p.score ?? 0, 0.001), color: PILLAR_COLOR[p.key] ?? "#9999B0" }));

    // ── Issues Snapshot (crawler-internal) ──
    const issuesLive = !!issues && issues.counts.total > 0;
    const issuesTotal = issuesLive ? issues!.counts.total : 0;
    const issuesFixable = issuesLive ? issues!.counts.aiFixable : 0;
    const issueCats = (issuesLive ? issues!.categories : []).slice(0, 6);

    // ── KPI strip (clicks · impressions · CTR · avg position) ──
    const liveKpis = summary?.hasData ? summary.kpis : null;
    const kpiDefs = [
        { key: "clicks" as const, label: "Clicks", color: "#6C5CE7", goodWhenUp: true, fmt: (v: number) => fmtNum(v) },
        { key: "impressions" as const, label: "Impressions", color: "#00B894", goodWhenUp: true, fmt: (v: number) => fmtNum(v) },
        { key: "ctr" as const, label: "CTR", color: "#3B82F6", goodWhenUp: true, fmt: (v: number) => `${v}%` },
        { key: "position" as const, label: "Avg. position", color: "#F5A623", goodWhenUp: false, fmt: (v: number) => v.toFixed(1) },
    ];
    const tiles = kpiDefs.map((d) => {
        const k = liveKpis?.[d.key];
        if (k) {
            const dir: "up" | "down" = (k.delta ?? 0) >= 0 ? "up" : "down";
            return { ...d, value: d.fmt(k.value), deltaStr: k.delta == null ? null : `${Math.abs(k.delta)}%`, dir, good: (dir === "up") === d.goodWhenUp, spark: [] as number[] };
        }
        return { ...d, value: "—", deltaStr: null, dir: "up" as const, good: true, spark: [] as number[] };
    });

    // ── AI Search & Answer Engines ──
    // Source preference: a connected BYO AEO provider / probe history wins (it adds
    // share-of-voice + citation coverage); otherwise we serve GA4 AI-referral data
    // (sessions + share of total traffic); empty behind the ConnectLock otherwise.
    const aiReferral = aeo?.referral && aeo.referral.length ? aeo.referral : null;
    const aiProbe = !!aeo?.hasData; // probe history or a connected AEO analytics provider
    const aiTier: "aeo" | "ga4" | "empty" = aiProbe ? "aeo" : aiReferral ? "ga4" : "empty";
    const aiLive = aiTier !== "empty";
    const aiSource = aiTier === "aeo" ? "AEO + GA4" : "GA4";
    const aiSessions = aiReferral ? aiReferral.reduce((s, r) => s + r.sessions, 0) : 0;
    const totalSessions = summary?.kpis?.sessions?.value ?? 0;
    const aiShareOfTraffic = totalSessions > 0 ? Math.round((aiSessions / totalSessions) * 1000) / 10 : 0;
    const aiStats: { value: string; label: string; delta?: string; caption?: string }[] =
        aiTier === "aeo"
            ? [
                  { value: fmtNum(aiSessions), label: "AI Sessions", caption: "from AI assistants" },
                  { value: `${Math.round(aeo!.score ?? 0)}%`, label: "AI Visibility", caption: "share of voice" },
                  { value: String(Math.max(0, ...(aeo!.engines?.map((e) => e.citedQueries) ?? [0]))), label: "Queries Cited", caption: `of ${aeo!.engines?.[0]?.totalQueries ?? 0} tracked` },
              ]
            : aiTier === "ga4"
              ? [
                    { value: fmtNum(aiSessions), label: "AI Sessions", caption: "from AI assistants" },
                    { value: `${aiShareOfTraffic}%`, label: "Share of Traffic", caption: "of all sessions" },
                    { value: String(aiReferral!.length), label: "AI Sources", caption: "sending traffic" },
                ]
              : [
                    { value: "—", label: "AI Sessions" },
                    { value: "—", label: "AI Visibility" },
                    { value: "—", label: "Queries Cited" },
                ];
    const platformRows: { name: string; sessions: number; change: number | null; color: string }[] = aiReferral
        ? aiReferral.slice(0, 5).map((r, i) => ({ name: r.platform, sessions: r.sessions, change: null as number | null, color: platformColor(r.platform, i) }))
        : [];
    const maxAiSessions = Math.max(1, ...platformRows.map((r) => r.sessions));

    // ── Top pages / keywords (GSC) ──
    const livePages = topPagesData?.pages?.length ? topPagesData.pages.slice(0, 5) : null;
    const pages = livePages ?? [];
    const liveKeywords = topKw && topKw.length ? topKw.slice(0, 5) : null;
    const kwRows = liveKeywords ?? [];

    // ── Backlinks (GA4 referral by default, BYO provider when connected) ──
    const blLive = !!backlinks?.hasData;
    const blProvider = backlinks?.source === "provider";
    const blStats: { value: string; label: string; delta?: string; caption?: string }[] = blProvider
        ? [
              { value: fmtNum(backlinks!.referringDomains), label: "Referring Domains", caption: backlinks!.provider ?? "from provider" },
              { value: backlinks!.totalBacklinks != null ? fmtNum(backlinks!.totalBacklinks) : "—", label: "Total Backlinks", caption: "live links" },
              { value: backlinks!.newDomains != null ? fmtNum(backlinks!.newDomains) : "—", label: "New Domains", caption: "recently added" },
          ]
        : blLive
          ? [
                { value: fmtNum(backlinks!.referringDomains), label: "Referring Domains", caption: "sending traffic" },
                { value: fmtNum(backlinks!.referralSessions), label: "Referral Sessions", caption: "from referrals" },
                { value: backlinks!.topReferring[0]?.domain ?? "—", label: "Top Source", caption: "most traffic" },
            ]
          : [
                { value: "—", label: "Referring Domains" },
                { value: "—", label: "Referral Sessions" },
                { value: "—", label: "Top Source" },
            ];
    const blRows: { domain: string; value: number; color: string }[] = blLive
        ? backlinks!.topReferring.slice(0, 5).map((r, i) => ({ domain: r.domain, value: r.sessions, color: ["#1769FF", "#EA4C89", "#64748B", "#0A66C2", "#3858E9"][i % 5] }))
        : [];
    const blColLabel = "Sessions";

    return (
        <div className="flex flex-col gap-6">
            {/* ── SEO Health + Issues Snapshot ── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {/* SEO Health */}
                <Card id="tour-seo-score" className="!px-6 !pt-6 !pb-9">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-h5 text-black dark:text-white">SEO Health</h2>
                            <LiveBadge live={scoreLive} source="FlowCMS score" />
                        </div>
                    </div>
                    {!scoreLive ? (
                        scoreLoaded && (
                            <div className="py-10">
                                <EmptyState
                                    variant="bare"
                                    icon="search"
                                    title="No scan yet"
                                    description="Run a site scan to see your SEO health."
                                    action={{ label: "Run a scan", href: "/seo/optimizer" }}
                                />
                            </div>
                        )
                    ) : (
                        <div className="flex flex-col items-center">
                            <div className="py-4">
                                <SeoDonut size={216} score={scoreValue} segments={segments} innerRadius="80%" cornerRadius={12} scoreSize={56} caption={rating.label} captionColor={rating.color} />
                            </div>
                            <div className="mt-2 flex w-full max-w-[27rem] flex-col gap-5">
                                {pillars.map((p) => {
                                    const c = PILLAR_COLOR[p.key] ?? "#9999B0";
                                    return (
                                        <div key={p.key}>
                                            <div className="mb-2.5 flex items-center justify-between gap-3">
                                                <span className="flex items-center gap-2.5 text-body font-medium text-black dark:text-white">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c }} />
                                                    {p.label}
                                                </span>
                                                <CountUp value={p.score ?? 0} className="font-poppins text-h6 font-bold tabular-nums" style={{ color: c }} />
                                            </div>
                                            <MetricBar percent={p.score ?? 0} color={c} trackClassName="h-2 rounded-full bg-lavender-mist dark:bg-grey-light/10" barClassName="rounded-full" />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </Card>

                {/* Issues Snapshot */}
                <Card className="!p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-h5 text-black dark:text-white">Issues Snapshot</h2>
                            <LiveBadge live={issuesLive} source="Crawler" />
                        </div>
                        <Link href="/seo/optimizer" className="text-caption-1 text-primary hover:opacity-70">View all issues →</Link>
                    </div>
                    {!issuesLive ? (
                        issuesLoaded && (
                            <div className="py-10">
                                <EmptyState
                                    variant="bare"
                                    icon="search"
                                    title="No scan yet"
                                    description="Run a site scan to see your SEO health."
                                    action={{ label: "Run a scan", href: "/seo/optimizer" }}
                                />
                            </div>
                        )
                    ) : (
                        <>
                            <div className="mb-5 flex items-center gap-3">
                                <CountUp value={issuesTotal} className="font-poppins text-[2.5rem] leading-none font-extrabold text-black dark:text-white" />
                                <div className="flex flex-col">
                                    <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-caption-2 font-bold text-success">
                                        <CountUp value={issuesFixable} /> AI-fixable
                                    </span>
                                    <span className="mt-1 text-caption-2 text-grey">Total issues</span>
                                </div>
                            </div>
                            <div className="flex flex-col">
                                {issueCats.map((c) => {
                                    const st = catStyle(c.key);
                                    return (
                                        <Link key={c.key} href="/seo/optimizer" className="group -mx-1.5 flex items-center gap-3 rounded-xl px-1.5 py-2 transition-colors hover:bg-lavender-mist/70 dark:hover:bg-dark-3/50">
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.625rem]" style={{ backgroundColor: `${st.color}1a` }}>
                                                <Icon className="h-4 w-4" name={st.icon} fill={st.color} />
                                            </span>
                                            <span className="grow truncate text-body-sm text-black dark:text-white">{c.label}</span>
                                            <CountUp value={c.count} className="shrink-0 font-poppins text-title font-bold" style={{ color: st.color }} />
                                        </Link>
                                    );
                                })}
                            </div>
                            <Link
                                href="/seo/optimizer"
                                className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-primary/30 py-3 text-title font-semibold text-primary transition-colors hover:bg-lavender-mist/70 dark:border-lilac/30 dark:text-lilac dark:hover:bg-dark-3/50"
                            >
                                Open AI Optimizer
                                <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="sparkles" />
                            </Link>
                        </>
                    )}
                </Card>
            </div>

            {/* ── KPI strip (Search Console) ── */}
            <ConnectLock
                connected={conn.gsc}
                loading={connLoading}
                brand="Google Search Console"
                title="Connect Search Console"
                description="Connect Google Search Console to track clicks, impressions, CTR and average position from real search traffic."
                ctaLabel="Connect Search Console"
            >
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {tiles.map((k) => (
                    <Card key={k.key} className="!p-5 transition-shadow hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.08)]">
                        <div className="text-caption-1 text-grey">{k.label}</div>
                        <div className="mt-2 flex items-center gap-2">
                            <StatNumber value={String(k.value)} className="block font-poppins text-[1.75rem] leading-none font-extrabold text-black dark:text-white" />
                            {k.deltaStr && <DeltaChip good={k.good} dir={k.dir}>{k.deltaStr}</DeltaChip>}
                        </div>
                        <div className="mb-3 mt-1 text-caption-2 text-grey">vs previous 30 days</div>
                        <Sparkline data={k.spark} color={k.color} height={40} />
                    </Card>
                ))}
            </div>
            </ConnectLock>

            {/* ── AI Search & Answer Engines + Backlinks ── */}
            <div data-tour="seo-aeo" className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {/* AI Search & Answer Engines */}
                <ConnectLock
                    connected={conn.ga4 || conn.aeo}
                    loading={connLoading}
                    brand="Google Analytics"
                    title="Connect AI search analytics"
                    description="Connect Google Analytics 4 (or an AEO provider) to see sessions and visibility across AI answer engines."
                    ctaLabel="Connect analytics"
                >
                <Card className="!p-6">
                    <div className="mb-5 flex items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">AI Search & Answer Engines</h2>
                        <LiveBadge live={aiLive} source={aiSource} />
                    </div>
                    <div className="mb-7 grid grid-cols-3">
                        {aiStats.map((s, i) => (
                            <div key={s.label} className={cn(i > 0 && "border-l border-grey-light pl-5 dark:border-grey-light/10")}>
                                <TripleStat value={s.value} label={s.label} delta={s.delta} caption={s.caption} />
                            </div>
                        ))}
                    </div>
                    <div className="mb-3 flex items-center justify-between gap-2 text-caption-2">
                        <span className="font-semibold text-black dark:text-white">Traffic by platform</span>
                        <span className="flex items-center gap-5 text-grey">
                            <span className="w-12 text-right">Sessions</span>
                            <span className="w-12 text-right">Change</span>
                        </span>
                    </div>
                    <div className="flex flex-col">
                        {platformRows.map((p) => (
                            <div key={p.name} className="flex items-center gap-3 py-2">
                                <InitialBadge name={p.name} color={p.color} />
                                <span className="w-[5.5rem] shrink-0 truncate text-body-sm text-black dark:text-white">{p.name}</span>
                                <div className="grow">
                                    <MetricBar percent={Math.round((p.sessions / maxAiSessions) * 100)} color={p.color} trackClassName="h-1.5 rounded-md bg-grey-light/70 dark:bg-grey-light/10" barClassName="rounded-md" />
                                </div>
                                <CountUp value={p.sessions} className="w-12 shrink-0 text-right text-caption-1 font-bold text-black dark:text-white" />
                                <span className="flex w-12 shrink-0 items-center justify-end">
                                    {p.change != null ? (
                                        <span className="inline-flex items-center gap-0.5 text-caption-2 font-bold text-success">
                                            <Icon className="h-3 w-3 rotate-180 fill-success" name="arrow-down" />
                                            {p.change}%
                                        </span>
                                    ) : (
                                        <span className="text-caption-2 text-grey">{aiLive ? "—" : `<1%`}</span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                    <Link href="/seo/aeo-geo" className="mt-5 inline-flex text-caption-1 text-primary hover:opacity-70">View full report →</Link>
                </Card>
                </ConnectLock>

                {/* Backlinks Overview */}
                <ConnectLock
                    connected={conn.ga4 || conn.backlinks}
                    loading={connLoading}
                    brand="Google Analytics"
                    title="Connect a backlinks source"
                    description="Connect Google Analytics 4 or a backlinks provider to see your referring domains and link growth."
                    ctaLabel="Connect a source"
                >
                <Card className="!p-6">
                    <div className="mb-5 flex items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">Backlinks Overview</h2>
                        <LiveBadge live={blLive} source={blProvider ? backlinks!.provider ?? "Provider" : "GA4"} />
                    </div>
                    <div className="mb-7 grid grid-cols-3">
                        {blStats.map((s, i) => (
                            <div key={s.label} className={cn(i > 0 && "border-l border-grey-light pl-5 dark:border-grey-light/10")}>
                                <TripleStat value={s.value} label={s.label} delta={s.delta} caption={s.caption} />
                            </div>
                        ))}
                    </div>
                    <div className="mb-3 flex items-center justify-between gap-2 text-caption-2">
                        <span className="font-semibold text-black dark:text-white">Top Referring Domains</span>
                        <span className="text-grey">{blColLabel}</span>
                    </div>
                    <div className="flex flex-col">
                        {blRows.map((d) => (
                            <div key={d.domain} className="flex items-center gap-3 py-2">
                                <InitialBadge name={d.domain} color={d.color} />
                                <span className="grow truncate text-body-sm text-black dark:text-white">{d.domain}</span>
                                <CountUp value={d.value} className="shrink-0 text-caption-1 font-bold text-black dark:text-white" />
                            </div>
                        ))}
                    </div>
                    <Link href="/seo/backlinks" className="mt-5 inline-flex text-caption-1 text-primary hover:opacity-70">View full report →</Link>
                </Card>
                </ConnectLock>
            </div>

            {/* ── Top pages + Top keywords ── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {/* Top pages */}
                <ConnectLock
                    connected={conn.gsc}
                    loading={connLoading}
                    brand="Google Search Console"
                    title="Connect Search Console"
                    description="Connect Google Search Console to see which pages earn the most search clicks and impressions."
                    ctaLabel="Connect Search Console"
                >
                <Card className="!p-6">
                    <div className="mb-4 flex items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">Top Pages</h2>
                        <LiveBadge live={!!livePages} source="Search Console" />
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 gap-y-3 text-caption-2">
                        <span className="text-grey">Page</span>
                        <span className="text-right text-grey">Clicks</span>
                        <span className="text-right text-grey">Impressions</span>
                        <span className="text-right text-grey">Position</span>
                        {pages.map((p) => {
                            const path = "path" in p ? p.path : (p as { label: string }).label;
                            const impressions = "impressions" in p ? (p as { impressions: number }).impressions : null;
                            const position = "position" in p ? (p as { position: number }).position : null;
                            return (
                                <div key={path} className="contents">
                                    <span className="min-w-0 truncate text-body-sm text-black dark:text-white">{path}</span>
                                    <CountUp value={p.clicks} className="text-right text-body-sm font-semibold text-black dark:text-white" />
                                    <span className="text-right text-body-sm text-grey">{impressions != null ? fmtNum(impressions) : "—"}</span>
                                    <span className="text-right text-body-sm text-grey">{position != null ? position.toFixed(1) : "—"}</span>
                                </div>
                            );
                        })}
                    </div>
                    <Link href="/seo/pages" className="mt-5 inline-flex text-caption-1 text-primary hover:opacity-70">View all pages →</Link>
                </Card>
                </ConnectLock>

                {/* Top keywords */}
                <ConnectLock
                    connected={conn.gsc}
                    loading={connLoading}
                    brand="Google Search Console"
                    title="Connect Search Console"
                    description="Connect Google Search Console to see the keywords you rank for and how positions move."
                    ctaLabel="Connect Search Console"
                >
                <Card className="!p-6">
                    <div className="mb-4 flex items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">Top Keywords</h2>
                        <LiveBadge live={!!liveKeywords} source="Search Console" />
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 gap-y-3 text-caption-2">
                        <span className="text-grey">Keyword</span>
                        <span className="text-right text-grey">Position</span>
                        <span className="text-right text-grey">Change</span>
                        <span className="text-right text-grey">Clicks</span>
                        {kwRows.map((k) => {
                            const delta = "delta" in k ? (k as { delta: number }).delta : null;
                            return (
                                <div key={k.id} className="contents">
                                    <span className="min-w-0 truncate text-body-sm text-black dark:text-white">{k.term}</span>
                                    <CountUp value={k.position} decimals={1} prefix="#" className="text-right text-body-sm font-semibold text-black dark:text-white" />
                                    <span className="flex items-center justify-end">
                                        {delta != null ? (
                                            <span className={cn("inline-flex items-center gap-0.5 text-caption-2 font-bold", delta >= 0 ? "text-success" : "text-error")}>
                                                <Icon className={cn("h-3 w-3", delta >= 0 ? "rotate-180 fill-success" : "fill-error")} name="arrow-down" />
                                                <CountUp value={Math.abs(delta)} decimals={delta % 1 === 0 ? 0 : 1} />
                                            </span>
                                        ) : (
                                            <span className="text-caption-2 text-grey">—</span>
                                        )}
                                    </span>
                                    <CountUp value={k.clicks} className="text-right text-body-sm text-grey" />
                                </div>
                            );
                        })}
                    </div>
                    <Link href="/seo/keywords" className="mt-5 inline-flex text-caption-1 text-primary hover:opacity-70">View all keywords →</Link>
                </Card>
                </ConnectLock>
            </div>

            {/* ── Footer: freshness + data sources ── */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-caption-2 text-grey">
                <button type="button" onClick={refresh} disabled={rerunning} className="inline-flex items-center gap-2 transition-colors hover:text-primary disabled:opacity-60">
                    Last updated: {rerunning ? "refreshing…" : updatedLabel}
                    <Icon className={cn("h-3.5 w-3.5 fill-grey", rerunning && "animate-spin")} name="refresh" />
                </button>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <span>Data sources:</span>
                    {DATA_SOURCES.map((s) => (
                        <span key={s.label} className="inline-flex items-center gap-1.5">
                            {resolveBrand(s.label) ? (
                                <BrandIcon brand={s.label} size={14} bare label={s.label} />
                            ) : (
                                <Icon className="h-3.5 w-3.5" name={s.icon} fill={s.color} />
                            )}
                            {s.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

/** A value + label column with either a delta chip or a descriptive caption.
 *  Used by the AI Search (caption) and Backlinks (delta + caption) cards. */
const TripleStat = ({ value, label, delta, caption }: { value: string; label: string; delta?: string; caption?: string }) => (
    <div>
        <StatNumber value={value} className="block font-poppins text-h3 font-extrabold text-black dark:text-white" />
        <div className="mt-0.5 truncate text-caption-2 text-grey">{label}</div>
        {delta && (
            <div className="mt-1.5">
                <DeltaChip good dir="up">{delta}</DeltaChip>
            </div>
        )}
        {caption && <div className="mt-1.5 text-caption-2 text-grey">{caption}</div>}
    </div>
);

export default SeoDashboard;
