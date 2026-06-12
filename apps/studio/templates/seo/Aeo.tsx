"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import BrandIcon from "@/components/ui/BrandIcon";
import { resolveBrand } from "@/lib/brands";
import MetricBar from "@/components/ui/MetricBar";
import CountUp from "@/components/motion/CountUp";
import StatNumber from "@/components/motion/StatNumber";
import ConnectLock from "@/components/ui/ConnectLock";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useConnections } from "@/lib/useConnections";
import LiveBadge from "./LiveBadge";
import FileGenModal from "./FileGenModal";

/* ── types ── */
type AeoResp = {
    hasData: boolean;
    brand?: string;
    score?: number;
    engines?: { id: string; name: string; citedQueries: number; totalQueries: number; runs: number; share: number }[];
    matrix?: { query: string; cells: { engine: string; timesCited: number; runs: number }[] }[];
    referral?: { platform: string; sessions: number }[];
};
type AuditLive = {
    hasData: boolean;
    jsonLdRows?: { type: string; path?: string }[];
    files?: {
        robots: { present: boolean; hasSitemapRef: boolean; blocksAiBots: boolean };
        sitemap: { present: boolean; urls: number };
        llmsTxt: { present: boolean };
    };
};
type IssuesResp = {
    score: number | null;
    counts: { total: number; pages: number; aiFixable: number; clean: number };
    categories: { key: string; label: string; count: number }[];
};

/* ── constants ── */
const RANGES = [
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
    { value: "90", label: "Last 90 days" },
];

const PLATFORM_COLORS: Record<string, string> = {
    ChatGPT: "#10A37F",
    Perplexity: "#5436DA",
    "Google Gemini": "#4285F4",
    Gemini: "#4285F4",
    Claude: "#D97757",
    Copilot: "#0078D4",
    "Microsoft Copilot": "#0078D4",
    "Google AI Overviews": "#E37400",
    Grok: "#1A1A2E",
    DeepSeek: "#3B82F6",
};
const FALLBACK_COLORS = ["#6C5CE7", "#3B82F6", "#00B894", "#F5A623", "#E91E63"];
const pcColor = (name: string, i: number) => PLATFORM_COLORS[name] ?? FALLBACK_COLORS[i % 5];

const DATA_SOURCES = [
    { label: "Google Analytics 4", icon: "chart", color: "#E37400" },
    { label: "Google Search Console", icon: "search", color: "#4285F4" },
    { label: "Site Crawler", icon: "compass", color: "#6C5CE7" },
];

/* ── sample data ── */

const SPARKS = {
    sessions: [1080, 1130, 1190, 1260, 1340, 1420, 1500, 1580, 1650, 1720, 1790, 1842],
    users: [740, 790, 850, 900, 960, 1010, 1060, 1110, 1160, 1200, 1230, 1243],
    engRate: [59.1, 60.4, 61.8, 62.5, 63.9, 64.8, 65.6, 66.3, 67.1, 67.6, 68.0, 68.1],
    avgTime: [142, 145, 148, 152, 156, 158, 160, 162, 163, 165, 166, 167],
};

const AI_PAGES_SAMPLE = [
    {
        path: "/free-brand-audit",
        pageType: "Landing Page",
        pageIcon: "document" as const,
        pageColor: "#F5A623",
        barColor: "#6C5CE7",
        aiSessions: 512, aiSessionsDelta: 28,
        engRate: 72.4, engRateDelta: 8,
        avgTime: "3m 12s", avgTimeDelta: 14,
        healthScore: 92, healthLabel: "Excellent", healthSub: "High AI readiness", healthColor: "#00B894",
    },
    {
        path: "/services",
        pageType: "Service Page",
        pageIcon: "grid" as const,
        pageColor: "#4285F4",
        barColor: "#4285F4",
        aiSessions: 267, aiSessionsDelta: 18,
        engRate: 68.7, engRateDelta: 6,
        avgTime: "2m 34s", avgTimeDelta: 11,
        healthScore: 78, healthLabel: "Good", healthSub: "Needs improvement", healthColor: "#F5A623",
    },
    {
        path: "/blog/rebrand-starts-with-positioning",
        pageType: "Blog Post",
        pageIcon: "compass" as const,
        pageColor: "#00B894",
        barColor: "#00B894",
        aiSessions: 186, aiSessionsDelta: -4,
        engRate: 63.1, engRateDelta: -3,
        avgTime: "2m 22s", avgTimeDelta: -5,
        healthScore: 85, healthLabel: "Very Good", healthSub: "Strong performance", healthColor: "#00B894",
    },
    {
        path: "/pricing",
        pageType: "Pricing Page",
        pageIcon: "chart" as const,
        pageColor: "#F5A623",
        barColor: "#F5A623",
        aiSessions: 143, aiSessionsDelta: 22,
        engRate: 66.9, engRateDelta: 7,
        avgTime: "2m 08s", avgTimeDelta: 10,
        healthScore: 63, healthLabel: "Needs Work", healthSub: "Optimize content", healthColor: "#E24B4A",
    },
    {
        path: "/features",
        pageType: "Feature Page",
        pageIcon: "sparkles" as const,
        pageColor: "#6C5CE7",
        barColor: "#6C5CE7",
        aiSessions: 98, aiSessionsDelta: 15,
        engRate: 64.3, engRateDelta: 5,
        avgTime: "1m 55s", avgTimeDelta: 9,
        healthScore: 81, healthLabel: "Good", healthSub: "Above average", healthColor: "#00B894",
    },
];

const READINESS_ICONS: Record<string, string> = {
    schema: "grid",
    faq: "hash",
    entity: "users",
    internal: "compass",
};

/* ── helpers ── */
const fmtNum = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${Math.round(n)}`;

const readinessRating = (v: number) =>
    v >= 85
        ? { label: "Excellent", color: "#00B894" }
        : v >= 70
          ? { label: "Good", color: "#00B894" }
          : v >= 50
            ? { label: "Needs Improvement", color: "#F5A623" }
            : { label: "Poor", color: "#E24B4A" };

/* ── sub-components ── */

const MiniArea = ({ data, color }: { data: number[]; color: string }) => {
    const id = `ma-${color.replace(/[^a-z0-9]/gi, "")}`;
    return (
        <div className="h-12 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

const DeltaChip = ({ value, good }: { value: string; good: boolean }) => (
    <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-bold", good ? "bg-success/10 text-success" : "bg-error/10 text-error")}>
        <Icon className={cn("h-3 w-3", good ? "fill-success rotate-180" : "fill-error")} name="arrow-down" />
        {value}
    </span>
);

const Delta = ({ value }: { value: number }) => (
    <span className={cn("inline-flex items-center gap-0.5 text-[0.6875rem] font-bold", value >= 0 ? "text-success" : "text-error")}>
        <Icon className={cn("h-3 w-3", value >= 0 ? "fill-success rotate-180" : "fill-error")} name="arrow-down" />
        {Math.abs(value)}%
    </span>
);

const PlatformGlyph = ({ name, color, className }: { name: string; color: string; className?: string }) => {
    const k = name.toLowerCase();
    if (k.includes("chatgpt") || k.includes("openai"))
        return (
            <svg viewBox="0 0 24 24" className={className} fill="none" stroke={color} strokeWidth="2.4" aria-hidden>
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="2.4" fill={color} stroke="none" />
            </svg>
        );
    if (k.includes("perplexity"))
        return (
            <svg viewBox="0 0 24 24" className={className} aria-hidden fill={color}>
                <rect x="3" y="5" width="14" height="2.6" rx="1.3" />
                <rect x="3" y="10.7" width="18" height="2.6" rx="1.3" />
                <rect x="7" y="16.4" width="14" height="2.6" rx="1.3" />
            </svg>
        );
    if (k.includes("gemini") || k.includes("bard"))
        return (
            <svg viewBox="0 0 24 24" className={className} aria-hidden>
                <path d="M12 2c.4 5.2 4.6 9.4 9.8 9.8C16.6 12.2 12.4 16.4 12 21.6 11.6 16.4 7.4 12.2 2.2 11.8 7.4 11.4 11.6 7.2 12 2z" fill={color} />
            </svg>
        );
    if (k.includes("claude") || k.includes("anthropic"))
        return (
            <svg viewBox="0 0 24 24" className={className} fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" aria-hidden>
                <path d="M12 2.5v19M2.5 12h19M5.2 5.2l13.6 13.6M18.8 5.2 5.2 18.8" />
            </svg>
        );
    if (k.includes("copilot") || k.includes("bing"))
        return (
            <svg viewBox="0 0 24 24" className={className} aria-hidden>
                <path d="M12 3l1.8 4.8L18.6 9l-4.8 1.8L12 15.6l-1.8-4.8L5.4 9l4.8-1.8L12 3z" fill={color} />
                <circle cx="19" cy="5" r="2.2" fill={color} />
            </svg>
        );
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke={color} strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M9 12h6M12 9v6" />
        </svg>
    );
};

const HealthRing = ({ score, color }: { score: number; color: string }) => {
    const r = 16;
    const circumference = 2 * Math.PI * r;
    const arc = (score / 100) * circumference;
    return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0" aria-hidden>
            <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(107,114,128,0.18)" strokeWidth="3" />
            <circle
                cx="20" cy="20" r={r}
                fill="none"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${arc} ${circumference - arc}`}
                transform="rotate(-90 20 20)"
            />
            <text
                x="20" y="20"
                dominantBaseline="central"
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="800"
                fill={color}
            >
                {score}
            </text>
        </svg>
    );
};

/* ── main component ── */
const Aeo = ({ range = "30" }: { range?: string }) => {
    const [aeo, setAeo] = useState<AeoResp | null>(null);
    const [audit, setAudit] = useState<AuditLive | null>(null);
    const [issues, setIssues] = useState<IssuesResp | null>(null);
    const [genKind, setGenKind] = useState<"llms" | "robots" | "sitemap" | null>(null);
    const [rerunning, setRerunning] = useState(false);
    const [updatedLabel, setUpdatedLabel] = useState("2 hours ago");
    const { connections: conn, loading: connLoading } = useConnections();

    const loadAudit = useCallback(() => {
        api<AuditLive>("/seo/audit")
            .then((d) => setAudit(d.hasData ? d : null))
            .catch(() => {});
    }, []);

    useEffect(() => {
        api<AeoResp>("/seo/aeo").then(setAeo).catch(() => {});
        loadAudit();
        api<IssuesResp>("/seo/scan/issues").then(setIssues).catch(() => {});
    }, [loadAudit]);

    /* ── platform data ── */
    const referral = useMemo(() => aeo?.referral ?? [], [aeo]);
    const referralLive = referral.length > 0;
    const totalAiSessions = referralLive ? referral.reduce((s, r) => s + r.sessions, 0) : 0;

    const platformData = useMemo(() => {
        const base = referralLive
            ? [...referral].sort((a, b) => b.sessions - a.sessions).map((r, i) => ({ name: r.platform, sessions: r.sessions, color: pcColor(r.platform, i) }))
            : [];
        const total = base.reduce((s, p) => s + p.sessions, 0) || 1;
        return base.map((p) => ({ ...p, pct: Math.round((p.sessions / total) * 100) }));
    }, [referral, referralLive]);

    const maxPlatformSessions = Math.max(1, ...platformData.map((p) => p.sessions));
    const donutSegments = platformData.map((p) => ({ label: p.name, value: p.sessions, color: p.color }));

    const topPlatform = platformData[0];

    /* ── readiness ── */
    const jsonLdRows = audit?.jsonLdRows ?? [];
    const files = audit?.files;
    const totalRows = Math.max(1, jsonLdRows.length);
    const schemaPages = jsonLdRows.filter((r) => r.type && r.type !== "—").length;
    const faqPages = jsonLdRows.filter((r) => /FAQPage/i.test(r.type)).length;

    const readiness = useMemo(() => {
        const schemaVal = audit ? Math.min(100, Math.round((schemaPages / totalRows) * 100)) : 82;
        const faqVal = audit ? Math.min(100, Math.round((faqPages / totalRows) * 100)) : 74;
        const entityVal = 68;
        const internalVal = files?.robots.present ? 91 : 72;
        return [
            { key: "schema", label: "Schema Coverage", value: schemaVal, color: "#10A37F" },
            { key: "faq", label: "FAQ Coverage", value: faqVal, color: "#5436DA" },
            { key: "entity", label: "Entity Coverage", value: entityVal, color: "#4285F4" },
            { key: "internal", label: "Internal Linking", value: internalVal, color: "#F5A623" },
        ];
    }, [audit, schemaPages, faqPages, totalRows, files]);

    /* ── limiting issues ── */
    const limitingIssues = useMemo(() => {
        const schemaCat = issues?.categories.find((c) => c.key === "schema");
        const structCat = issues?.categories.find((c) => c.key === "structure");
        return [
            { isWarning: true, count: schemaCat?.count ?? 14, label: "Pages missing FAQ schema", color: "#F5A623", href: "/seo/markup" },
            { isWarning: true, count: Math.max(1, (schemaCat?.count ?? 14) - 6), label: "Pages missing article schema", color: "#F5A623", href: "/seo/markup" },
            { isWarning: false, count: structCat?.count ?? 6, label: "Pages with missing entity signals", color: "#6C5CE7", href: "/seo/markup" },
        ];
    }, [issues]);

    /* ── KPI definitions ── */
    const periodLabel = range === "7" ? "vs previous 7 days" : range === "90" ? "vs previous 90 days" : "vs previous 30 days";
    const kpiCards = [
        { key: "sessions", label: "AI Sessions", value: referralLive ? fmtNum(totalAiSessions) : "—", delta: "+34%", spark: SPARKS.sessions, color: "#10A37F", icon: "overview" as const, live: referralLive },
        { key: "users", label: "AI Users", value: "—", delta: "+28%", spark: SPARKS.users, color: "#5436DA", icon: "users" as const, live: false },
        { key: "engRate", label: "Engagement Rate", value: "—", delta: "+12%", spark: SPARKS.engRate, color: "#4285F4", icon: "chart" as const, live: false },
        { key: "avgTime", label: "Avg. Engagement Time", value: "—", delta: "+16%", spark: SPARKS.avgTime, color: "#E91E63", icon: "clock" as const, live: false },
    ];

    const aiPages: typeof AI_PAGES_SAMPLE = [];
    const maxAiSessions = Math.max(1, ...aiPages.map((p) => p.aiSessions));

    return (
        <ConnectLock
            connected={conn.ga4 || conn.aeo}
            loading={connLoading}
            brand="Google Analytics"
            title="Connect AI search analytics"
            description="Connect Google Analytics 4 (or an AEO provider) to see sessions and visibility across AI answer engines."
            href="/settings/integrations?tab=analytics"
            ctaLabel="Connect analytics"
        >
        <div className="flex flex-col gap-6">
            {/* ── KPI strip ── */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {kpiCards.map((k) => (
                    <Card key={k.key} className="!p-5 transition-shadow hover:shadow-lift">
                        <div className="mb-3 flex items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.625rem]" style={{ backgroundColor: `${k.color}18` }}>
                                <Icon className="h-5 w-5" name={k.icon} fill={k.color} />
                            </span>
                            <span className="text-caption-1 text-grey">{k.label}</span>
                        </div>
                        <StatNumber value={k.value} className="block font-poppins text-[1.875rem] leading-none font-extrabold text-black dark:text-white" />
                        {k.live ? (
                            <>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    <DeltaChip value={k.delta} good />
                                </div>
                                <p className="mt-0.5 text-caption-2 text-grey">{periodLabel}</p>
                                <div className="mt-3">
                                    <MiniArea data={k.spark} color={k.color} />
                                </div>
                            </>
                        ) : (
                            <div className="mt-2 h-[4.25rem]" />
                        )}
                    </Card>
                ))}
            </div>

            {/* ── AI Ecosystem ── */}
            <Card className="!p-6">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h2 className="text-h5 text-black dark:text-white">AI Ecosystem</h2>
                    <LiveBadge live={referralLive} source="GA4" />
                </div>
                <p className="mb-6 text-caption-2 text-grey">
                    Sessions from AI platforms in the {RANGES.find((r) => r.value === range)?.label.toLowerCase() ?? "last 30 days"}
                </p>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[11rem_1fr]">
                    {/* Donut */}
                    <div className="relative mx-auto shrink-0" style={{ width: 176, height: 176 }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <PieChart>
                                <Pie
                                    data={donutSegments}
                                    dataKey="value"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius="74%"
                                    outerRadius="100%"
                                    startAngle={90}
                                    endAngle={-270}
                                    paddingAngle={1}
                                    stroke="none"
                                    animationDuration={900}
                                >
                                    {donutSegments.map((s) => (
                                        <Cell key={s.label} fill={s.color} style={{ outline: "none" }} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                            <CountUp value={totalAiSessions} className="font-poppins text-[1.625rem] leading-none font-extrabold text-black dark:text-white" />
                            <span className="mt-1 text-caption-2 text-grey">Total Sessions</span>
                        </div>
                    </div>

                    {/* Platform list */}
                    <div className="flex flex-col justify-center gap-3.5">
                        {platformData.length === 0 && (
                            <p className="text-caption-2 text-grey">No AI platform sessions yet.</p>
                        )}
                        {platformData.map((p) => (
                            <div key={p.name} className="flex items-center gap-3">
                                {resolveBrand(p.name) ? (
                                    <BrandIcon brand={p.name} size={32} rounded="rounded-[0.5rem]" label={p.name} />
                                ) : (
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.5rem]" style={{ backgroundColor: `${p.color}18` }}>
                                        <PlatformGlyph name={p.name} color={p.color} className="h-4 w-4" />
                                    </span>
                                )}
                                <span className="w-24 shrink-0 text-body-sm font-medium text-black dark:text-white">{p.name}</span>
                                <div className="grow">
                                    <MetricBar
                                        percent={Math.round((p.sessions / maxPlatformSessions) * 100)}
                                        color={p.color}
                                        trackClassName="h-2 rounded-md bg-grey-light/50 dark:bg-grey-light/10"
                                        barClassName="rounded-md"
                                    />
                                </div>
                                <CountUp value={p.sessions} className="w-12 shrink-0 text-right text-body-sm font-semibold text-black dark:text-white" />
                                <span className="w-9 shrink-0 text-right text-caption-1 font-bold" style={{ color: p.color }}>
                                    {p.pct}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Highlights row */}
                <div className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-grey-light p-4 dark:border-grey-light/10 sm:grid-cols-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-[#F5A623]/15">
                            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                                <path fill="#F5A623" d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
                            </svg>
                        </span>
                        <div className="min-w-0">
                            <div className="text-caption-2 text-grey">Top Platform</div>
                            <div className="truncate text-body font-semibold text-black dark:text-white">{topPlatform?.name ?? "—"}</div>
                            <div className="text-caption-2 text-grey">{topPlatform ? `${topPlatform.pct}% of AI sessions` : "No data yet"}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 sm:border-l sm:border-grey-light sm:pl-4 dark:sm:border-grey-light/10">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-primary/10">
                            <Icon className="h-5 w-5 fill-primary dark:fill-lilac" name="overview" />
                        </span>
                        <div className="min-w-0">
                            <div className="text-caption-2 text-grey">Fastest Growth</div>
                            <div className="truncate text-body font-semibold text-black dark:text-white">—</div>
                            <div className="text-caption-2 text-grey">No data yet</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 sm:border-l sm:border-grey-light sm:pl-4 dark:sm:border-grey-light/10">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-[#4285F4]/10">
                            <Icon className="h-5 w-5" name="clock" fill="#4285F4" />
                        </span>
                        <div className="min-w-0">
                            <div className="text-caption-2 text-grey">Best Engagement</div>
                            <div className="truncate text-body font-semibold text-black dark:text-white">—</div>
                            <div className="text-caption-2 text-grey">No data yet</div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* ── Top AI Landing Pages ── */}
            <Card className="!p-0 overflow-hidden">
                <div className="border-b border-grey-light p-5 dark:border-grey-light/10">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">Top AI Landing Pages</h2>
                        <LiveBadge live={aiPages.length > 0} source="GA4" />
                    </div>
                    <p className="mt-0.5 text-caption-2 text-grey">Pages most frequently visited from AI assistants and answer engines.</p>
                </div>

                {/* Header */}
                {aiPages.length > 0 && (
                <div className="hidden border-b border-grey-light bg-lavender-mist/30 px-5 py-2.5 text-caption-2 text-grey dark:border-grey-light/10 dark:bg-dark-3/30 md:grid md:grid-cols-[2.5rem_1fr_9rem_9rem_10rem_13rem]">
                    <span>#</span>
                    <span>Page</span>
                    <span className="flex items-center gap-1">
                        AI Sessions
                        <Icon className="h-3 w-3 fill-grey" name="arrow-down" />
                    </span>
                    <span>Engagement Rate</span>
                    <span>Avg. Engagement Time</span>
                    <span>AI Health</span>
                </div>
                )}

                {aiPages.length === 0 && (
                    <div className="px-5 py-12 text-center text-body text-grey">No AI landing page data yet.</div>
                )}

                {aiPages.map((p, i) => (
                    <div
                        key={p.path}
                        className={cn(
                            "grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-x-3 gap-y-0 px-5 py-3.5 transition-colors hover:bg-lavender-mist/40 dark:hover:bg-dark-3/40 md:grid-cols-[2.5rem_1fr_9rem_9rem_10rem_13rem]",
                            i < aiPages.length - 1 && "border-b border-grey-light/60 dark:border-grey-light/10",
                        )}
                    >
                        {/* Rank */}
                        <div className="flex items-center justify-center">
                            {i === 0 ? (
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F5A623]/15">
                                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#F5A623" aria-hidden>
                                        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
                                    </svg>
                                </span>
                            ) : (
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-grey-light/50 text-caption-2 font-bold text-grey dark:bg-dark-3">
                                    {i + 1}
                                </span>
                            )}
                        </div>

                        {/* Page info */}
                        <div className="flex min-w-0 items-center gap-2.5">
                            <span
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.625rem]"
                                style={{ backgroundColor: `${p.pageColor}18` }}
                            >
                                <Icon className="h-4 w-4" name={p.pageIcon} fill={p.pageColor} />
                            </span>
                            <div className="min-w-0">
                                <div className="truncate text-body-sm font-semibold text-black dark:text-white">{p.path}</div>
                                <span
                                    className="mt-0.5 inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.625rem] font-semibold"
                                    style={{ backgroundColor: `${p.pageColor}18`, color: p.pageColor }}
                                >
                                    {p.pageType}
                                </span>
                            </div>
                        </div>

                        {/* AI Sessions + bar */}
                        <div className="md:min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="text-body-sm font-semibold text-black dark:text-white">{p.aiSessions}</span>
                                <Delta value={p.aiSessionsDelta} />
                            </div>
                            <div className="mt-1.5 hidden md:block">
                                <MetricBar
                                    percent={Math.round((p.aiSessions / maxAiSessions) * 100)}
                                    color={p.barColor}
                                    trackClassName="h-1.5 rounded bg-grey-light/50 dark:bg-grey-light/10"
                                    barClassName="rounded"
                                />
                            </div>
                        </div>

                        {/* Engagement Rate — desktop only */}
                        <div className="hidden flex-col gap-0.5 md:flex">
                            <span className="text-body-sm font-semibold text-black dark:text-white">{p.engRate}%</span>
                            <Delta value={p.engRateDelta} />
                        </div>

                        {/* Avg. Engagement Time — desktop only */}
                        <div className="hidden flex-col gap-0.5 md:flex">
                            <span className="text-body-sm font-semibold text-black dark:text-white">{p.avgTime}</span>
                            <Delta value={p.avgTimeDelta} />
                        </div>

                        {/* AI Health */}
                        <div className="flex items-center gap-2.5">
                            <HealthRing score={p.healthScore} color={p.healthColor} />
                            <div className="hidden min-w-0 md:block">
                                <div className="text-body-sm font-bold leading-tight" style={{ color: p.healthColor }}>{p.healthLabel}</div>
                                <div className="text-caption-2 text-grey">{p.healthSub}</div>
                            </div>
                            <Icon className="ml-auto h-4 w-4 shrink-0 fill-grey" name="arrow-right" />
                        </div>
                    </div>
                ))}
            </Card>

            {/* ── AI Readiness + What's Limiting ── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {/* AI Readiness */}
                <Card className="!p-5">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">AI Readiness</h2>
                        <LiveBadge live={!!audit} source="Crawler" />
                    </div>
                    <p className="mb-5 text-caption-2 text-grey">How well your site is optimized for AI platforms</p>
                    <div className="flex flex-col gap-5">
                        {readiness.map((r) => {
                            const rating = readinessRating(r.value);
                            return (
                                <div key={r.key}>
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.5rem]" style={{ backgroundColor: `${r.color}18` }}>
                                                <Icon className="h-3.5 w-3.5" name={READINESS_ICONS[r.key] ?? "grid"} fill={r.color} />
                                            </span>
                                            <span className="text-body-sm font-medium text-black dark:text-white">{r.label}</span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="text-body-sm font-bold text-black dark:text-white">{r.value}%</span>
                                            <span
                                                className="inline-flex items-center rounded-md px-2 py-0.5 text-[0.6875rem] font-semibold"
                                                style={{ backgroundColor: `${rating.color}1a`, color: rating.color }}
                                            >
                                                {rating.label}
                                            </span>
                                        </div>
                                    </div>
                                    <MetricBar
                                        percent={r.value}
                                        color={r.color}
                                        trackClassName="h-2 rounded-md bg-grey-light/50 dark:bg-grey-light/10"
                                        barClassName="rounded-md"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* What's Limiting Your AI Visibility */}
                <Card className="!p-5 flex flex-col">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">What&apos;s Limiting Your AI Visibility</h2>
                    </div>
                    <p className="mb-5 text-caption-2 text-grey">Issues impacting your visibility in AI platforms</p>

                    <div className="flex flex-col gap-3">
                        {limitingIssues.map((issue, i) => (
                            <Link
                                key={i}
                                href={issue.href}
                                className="flex items-center gap-3 rounded-xl border border-grey-light p-3 transition-colors hover:bg-lavender-mist/40 dark:border-grey-light/10 dark:hover:bg-dark-3/40"
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.625rem]" style={{ backgroundColor: `${issue.color}15` }}>
                                    {issue.isWarning ? (
                                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
                                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke={issue.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M12 9v4M12 17h.01" stroke={issue.color} strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    ) : (
                                        <Icon className="h-4 w-4" name="compass" fill={issue.color} />
                                    )}
                                </span>
                                <CountUp value={issue.count} className="font-poppins text-h5 font-extrabold shrink-0" style={{ color: issue.color }} />
                                <span className="grow min-w-0 truncate text-body-sm text-black dark:text-white">{issue.label}</span>
                                <Icon className="h-4 w-4 shrink-0 fill-grey" name="arrow-right" />
                            </Link>
                        ))}
                    </div>

                    <div className="mt-auto pt-5">
                        <Link
                            href="/seo/optimizer"
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-title font-semibold text-white shadow-glow transition-opacity hover:opacity-90 dark:bg-lilac"
                        >
                            <Icon className="h-4 w-4 fill-white" name="sparkles" />
                            Open AI Optimizer
                        </Link>
                    </div>
                </Card>
            </div>

            {/* ── Footer ── */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-caption-2 text-grey">
                <button
                    type="button"
                    onClick={() => {
                        setRerunning(true);
                        api("/seo/audit?refresh=1")
                            .catch(() => {})
                            .finally(() => {
                                loadAudit();
                                setRerunning(false);
                                setUpdatedLabel("just now");
                            });
                    }}
                    disabled={rerunning}
                    className="inline-flex items-center gap-2 transition-colors hover:text-primary disabled:opacity-60"
                >
                    Last updated: {rerunning ? "refreshing..." : updatedLabel}
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

            <FileGenModal open={!!genKind} onClose={() => { setGenKind(null); loadAudit(); }} kind={genKind} />
        </div>
        </ConnectLock>
    );
};

export default Aeo;
