"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Sparkline from "@/components/charts/Sparkline";
import StatNumber from "@/components/motion/StatNumber";
import EmptyState from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

const PATHS = {
    search: "M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM21 21l-4.35-4.35",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    cursor: "M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z",
    arrowUp: "M12 19V5M5 12l7-7 7 7",
    arrowDown: "M12 5v14M19 12l-7 7-7-7",
};

const Stroke = ({ d, color, className }: { d: string; color?: string; className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {d.split("M").filter(Boolean).map((seg, i) => (
            <path key={i} d={"M" + seg} />
        ))}
    </svg>
);

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`);

type Pt = { value: number };
type Overview = {
    hasData: boolean;
    totals?: { clicks: number; impressions: number; ctr: number; position: number; sessions: number };
    series?: { clicks: Pt[]; impressions: Pt[]; sessions: Pt[] };
};

type Tile = { key: string; icon: string; color: string; value: string; label: string; delta: number | null; spark: number[]; href: string };

const sum = (a: Pt[], lo: number, hi: number) => a.slice(lo, hi).reduce((s, b) => s + b.value, 0);
const pct = (f: number, s: number): number | null => (f > 0 ? Math.round(((s - f) / f) * 100) : null);

const WeeklyProgressCard = () => {
    const [tiles, setTiles] = useState<Tile[]>([]);
    const [live, setLive] = useState(false);

    useEffect(() => {
        // 14 days so the first/second half is genuinely "this week vs last week".
        void api<Overview>("/analytics/overview?days=14")
            .then((o) => {
                if (!o.hasData || !o.totals || !o.series) return;
                const t = o.totals;
                const clk = o.series.clicks ?? [];
                const imp = o.series.impressions ?? [];
                const ses = o.series.sessions ?? [];
                const m = Math.floor(clk.length / 2);
                const ctrSeries = clk.map((c, i) => (imp[i]?.value ? +((c.value / imp[i].value) * 100).toFixed(2) : 0));
                const ctrDelta =
                    m >= 2 && sum(imp, 0, m) > 0 && sum(imp, m, imp.length) > 0
                        ? pct(sum(clk, 0, m) / sum(imp, 0, m), sum(clk, m, clk.length) / sum(imp, m, imp.length))
                        : null;
                setTiles([
                    { key: "organic", icon: PATHS.search, color: "#6C5CE7", value: fmt(t.clicks), label: "Organic traffic", delta: m >= 2 ? pct(sum(clk, 0, m), sum(clk, m, clk.length)) : null, spark: clk.map((p) => p.value), href: "/seo" },
                    { key: "impr", icon: PATHS.eye, color: "#00B894", value: fmt(t.impressions), label: "Impressions", delta: m >= 2 ? pct(sum(imp, 0, m), sum(imp, m, imp.length)) : null, spark: imp.map((p) => p.value), href: "/seo" },
                    { key: "sessions", icon: PATHS.users, color: "#3B82F6", value: fmt(t.sessions), label: "Total visits", delta: m >= 2 ? pct(sum(ses, 0, m), sum(ses, m, ses.length)) : null, spark: ses.map((p) => p.value), href: "/" },
                    { key: "ctr", icon: PATHS.cursor, color: "#F5A623", value: `${t.ctr.toFixed(1)}%`, label: "Click-through rate", delta: ctrDelta, spark: ctrSeries, href: "/seo" },
                ]);
                setLive(true);
            })
            .catch(() => {});
    }, []);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
                <h2 className="font-poppins text-h5 font-semibold text-black dark:text-white">This Week&rsquo;s Progress</h2>
                <span className="rounded-pill bg-lavender-mist px-2.5 py-0.5 text-caption-2 font-medium text-grey dark:bg-dark-3">vs last week</span>
                {live && (
                    <span className="inline-flex items-center gap-1.5 rounded-pill bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        Live
                    </span>
                )}
            </div>

            {!live ? (
                <Card className="!p-6">
                    <EmptyState
                        variant="bare"
                        icon="chart"
                        title="No traffic data yet"
                        description="Connect Search Console and Analytics to see organic traffic, impressions and click-through rate."
                        action={{ label: "Connect analytics", href: "/seo" }}
                    />
                </Card>
            ) : (
            /* KPI-strip card design: icon · number · label · delta, then a sparkline. */
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
                {tiles.map((t) => {
                    const up = (t.delta ?? 0) >= 0;
                    return (
                        <Link key={t.key} href={t.href} aria-label={`${t.label}: ${t.value}`} className="group block rounded-2xl">
                            <Card className="flex flex-col !p-4 transition-shadow group-hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.08)]">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105" style={{ backgroundColor: `${t.color}1f` }}>
                                        <Stroke d={t.icon} color={t.color} className="h-[15px] w-[15px]" />
                                    </span>
                                    <StatNumber value={t.value} className="font-poppins text-[1.25rem] leading-none font-extrabold text-black dark:text-white" />
                                    <span className="min-w-0 truncate text-[0.875rem] font-semibold text-black dark:text-white">{t.label}</span>
                                    {t.delta != null && (
                                        <span className={cn("ml-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap text-caption-2 font-semibold", up ? "text-[#0a7a5f] dark:text-success" : "text-[#c0453f] dark:text-[#E17055]")}>
                                            <Stroke d={up ? PATHS.arrowUp : PATHS.arrowDown} className="h-3 w-3" />
                                            <span>{Math.abs(t.delta)}%</span>
                                        </span>
                                    )}
                                </div>
                                <div className="mt-3 -mb-1">
                                    <Sparkline data={t.spark} color={t.color} height={34} />
                                </div>
                            </Card>
                        </Link>
                    );
                })}
            </div>
            )}
        </div>
    );
};

export default WeeklyProgressCard;
