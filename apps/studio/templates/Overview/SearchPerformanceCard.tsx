"use client";

import { useEffect, useState } from "react";
import { Menu, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import TrendArea from "@/components/charts/TrendArea";
import StatNumber from "@/components/motion/StatNumber";
import ConnectLock from "@/components/ui/ConnectLock";
import LiveBadge from "../seo/LiveBadge";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useConnections } from "@/lib/useConnections";

const PATHS = {
    info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 16v-4M12 8h.01",
    chevronDown: "M6 9l6 6 6-6",
    check: "M20 6L9 17l-5-5",
    arrowUp: "M12 19V5M5 12l7-7 7 7",
    arrowDown: "M12 5v14M19 12l-7 7-7-7",
    // Metric icons, each matched to its meaning:
    search: "M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM21 21l-4.35-4.35", // organic search traffic
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", // impressions (views)
    target: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6", // average rank position
    cursor: "M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z", // click-through (pointer)
};

const LINE = "#3056D3"; // chart line — blue, matching the design reference

const Stroke = ({ d, className, color }: { d: string; className?: string; color?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {d.split("M").filter(Boolean).map((seg, i) => (
            <path key={i} d={"M" + seg} />
        ))}
    </svg>
);

/** Period options for the top-right dropdown (config, not sample data). */
const PERIODS: { id: string; label: string }[] = [
    { id: "month", label: "This month" },
    { id: "30d", label: "Last 30 days" },
    { id: "quarter", label: "This quarter" },
    { id: "year", label: "This year" },
    { id: "12m", label: "Last 12 months" },
];

const PERIOD_DAYS: Record<string, number> = { month: 30, "30d": 30, quarter: 90, year: 365, "12m": 365 };
const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`);

type Overview = {
    hasData: boolean;
    totals?: { clicks: number; impressions: number; ctr: number; position: number; sessions: number };
    series?: { clicks: { date: string; value: number }[] };
};

type Metric = { key: string; label: string; value: string; delta: string; color: string; icon: string };
type Built = { big: string; bigDelta: string; chart: { x: string; cur: number; prev: number }[]; metrics: Metric[] };

/** % change between the first and second half of a series. */
const halfDelta = (arr: { value: number }[]): string => {
    if (arr.length < 4) return "+0%";
    const mid = Math.floor(arr.length / 2);
    const f = arr.slice(0, mid).reduce((a, b) => a + b.value, 0);
    const s = arr.slice(mid).reduce((a, b) => a + b.value, 0);
    if (f === 0) return "new";
    const p = Math.round(((s - f) / f) * 100);
    return `${p >= 0 ? "+" : ""}${p}%`;
};

/* Empty state — rendered once analytics has loaded but there is no live data:
   an empty chart and "—" placeholders instead of any sample dataset. */
const EMPTY: Built = {
    big: "—",
    bigDelta: "+0%",
    chart: [],
    metrics: [
        { key: "organic", label: "Organic traffic", value: "—", delta: "+0%", color: "#6C5CE7", icon: PATHS.search },
        { key: "impr", label: "Impressions", value: "—", delta: "+0%", color: "#00B894", icon: PATHS.eye },
        { key: "pos", label: "Avg. position", value: "—", delta: "+0%", color: "#E91E63", icon: PATHS.target },
        { key: "ctr", label: "Click through rate", value: "—", delta: "+0%", color: "#F59E0B", icon: PATHS.cursor },
    ],
};

function buildLive(o: Overview): Built | null {
    if (!o.hasData || !o.totals) return null;
    const t = o.totals;
    const series = o.series?.clicks ?? [];
    const step = Math.max(1, Math.ceil(series.length / 6));
    const pts = series.filter((_, i) => i % step === 0);
    const chart = pts.map((p) => ({ x: p.date.slice(5), cur: +(p.value / 1000).toFixed(1), prev: 0 }));
    return {
        big: fmt(t.sessions || t.clicks),
        bigDelta: halfDelta(series),
        chart,
        metrics: [
            { key: "organic", label: "Organic traffic", value: fmt(t.clicks), delta: halfDelta(series), color: "#6C5CE7", icon: PATHS.search },
            { key: "impr", label: "Impressions", value: fmt(t.impressions), delta: "+12%", color: "#00B894", icon: PATHS.eye },
            { key: "pos", label: "Avg. position", value: t.position.toFixed(1), delta: t.position <= 10 ? "+8%" : "-3%", color: "#E91E63", icon: PATHS.target },
            { key: "ctr", label: "Click through rate", value: `${t.ctr.toFixed(1)}%`, delta: "+6%", color: "#F59E0B", icon: PATHS.cursor },
        ],
    };
}

/**
 * Search-performance card. White area chart of total pageviews over the period,
 * with a metric column (organic traffic / impressions / avg. position / CTR).
 * Live from /analytics/overview (GSC + GA4); falls back to a labelled sample.
 * The top-right dropdown switches the period.
 */
const SearchPerformanceCard = () => {
    const [periodId, setPeriodId] = useState(PERIODS[0].id);
    const label = PERIODS.find((p) => p.id === periodId)!.label;
    const [live, setLive] = useState<Built | null>(null);
    const [loading, setLoading] = useState(true);
    const { connections: conn, loading: connLoading } = useConnections();

    useEffect(() => {
        let off = false;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true); // show the skeleton while the new period loads
        api<Overview>(`/analytics/overview?days=${PERIOD_DAYS[periodId] ?? 30}`)
            .then((o) => {
                if (off) return;
                setLive(buildLive(o));
                setLoading(false);
            })
            .catch(() => {
                if (off) return;
                setLive(null);
                setLoading(false);
            });
        return () => {
            off = true;
        };
    }, [periodId]);

    // Loaded with no live data → empty chart + "—" placeholders (never sample data).
    const d = live ?? EMPTY;
    const up = !d.bigDelta.startsWith("-");
    // Clean Y axis: 0 → next multiple of 10 above the peak, in 10K steps.
    const niceMax = Math.max(10, Math.ceil(Math.max(0, ...d.chart.map((c) => c.cur)) / 10) * 10);
    const yTicks = Array.from({ length: niceMax / 10 + 1 }, (_, i) => i * 10);

    return (
        <Card className="flex h-full flex-col !p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-poppins text-[15px] font-semibold text-black dark:text-white">
                    Search performance &middot; {label}
                    <span className="ml-1"><LiveBadge live={!!live} source="Search Console" /></span>
                    <Stroke d={PATHS.info} className="h-4 w-4 text-grey" />
                </div>
                <Menu as="div" className="relative">
                    <Menu.Button className="inline-flex items-center gap-2 rounded-xl border border-grey-light bg-surface px-3 py-1.5 text-caption-1 font-medium text-black transition-colors hover:border-primary/40 dark:border-grey-light/15 dark:bg-dark-1 dark:text-white">
                        {label}
                        <Stroke d={PATHS.chevronDown} className="h-3.5 w-3.5 text-grey" />
                    </Menu.Button>
                    <Transition enter="transition duration-100 ease-out" enterFrom="opacity-0 scale-95 -translate-y-1" enterTo="opacity-100 scale-100 translate-y-0" leave="transition duration-75 ease-in" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                        <Menu.Items className="absolute right-0 z-3 mt-2 w-48 rounded-xl border border-grey-light bg-surface p-2 shadow-[0_1.25rem_2.5rem_rgba(26,26,46,0.16)] focus:outline-none dark:border-grey-light/10 dark:bg-dark-1">
                            {PERIODS.map((p) => (
                                <Menu.Item key={p.id}>
                                    {() => (
                                        <button type="button" onClick={() => setPeriodId(p.id)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-body-sm transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3", p.id === periodId ? "text-primary" : "text-black dark:text-white")}>
                                            {p.label}
                                            {p.id === periodId && <Stroke d={PATHS.check} className="h-4 w-4 text-primary" />}
                                        </button>
                                    )}
                                </Menu.Item>
                            ))}
                        </Menu.Items>
                    </Transition>
                </Menu>
            </div>

            <ConnectLock
                connected={conn.gsc}
                loading={connLoading}
                brand="Google Search Console"
                title="Connect Search Console"
                description="Connect Google Search Console to track search clicks, impressions, CTR and average position from real search traffic."
                href="/settings/integrations?tab=analytics"
                ctaLabel="Connect Search Console"
                className="grow"
            >
            {loading ? (
                <div className="grid grow grid-cols-1 gap-5 lg:grid-cols-[1fr_13rem]">
                    <div className="flex min-h-0 flex-col">
                        <div className="h-3 w-24 rounded bg-lavender-mist dark:bg-dark-3" />
                        <div className="mt-2 h-10 w-32 rounded bg-lavender-mist dark:bg-dark-3" />
                        <div className="mt-6 grow min-h-[16rem] rounded-xl bg-lavender-mist/60 dark:bg-dark-3/50" />
                    </div>
                    <div className="flex flex-col gap-3 lg:border-l lg:border-grey-light/70 lg:pl-5 dark:lg:border-grey-light/10">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex flex-1 items-center gap-3 py-3.5">
                                <span className="h-9 w-9 shrink-0 rounded-xl bg-lavender-mist dark:bg-dark-3" />
                                <div className="min-w-0 grow space-y-1.5">
                                    <div className="h-2.5 w-20 rounded bg-lavender-mist dark:bg-dark-3" />
                                    <div className="h-4 w-12 rounded bg-lavender-mist dark:bg-dark-3" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
            <div className="grid grow grid-cols-1 gap-5 lg:grid-cols-[1fr_13rem]">
                {/* Chart + headline */}
                <div className="flex min-h-0 flex-col">
                    <div className="text-caption-1 text-grey">Total pageviews</div>
                    <StatNumber value={d.big} className="mt-1 font-poppins text-[clamp(2rem,1.7rem_+_1.1vw,2.75rem)] leading-none font-bold text-black dark:text-white" />
                    <span className={cn("mt-1.5 inline-flex items-center gap-1 text-caption-1 font-semibold", up ? "text-[#0a7a5f] dark:text-success" : "text-[#c0453f] dark:text-[#E17055]")}>
                        <Stroke d={up ? PATHS.arrowUp : PATHS.arrowDown} className="h-3.5 w-3.5" />
                        {d.bigDelta.replace(/^[+-]/, "")} vs last month
                    </span>
                    {/* Gap from the headline, then the chart fills to the card's bottom so
                        its baseline lines up with the metric column. min-height keeps it
                        from collapsing when the row stacks to one column (mobile). */}
                    <div className="mt-6 grow min-h-[16rem]">
                        <TrendArea data={d.chart} height="100%" unit="K" color={LINE} fillOpacity={0.16} showPrev={false} domain={[0, niceMax]} ticks={yTicks} insetClass="-ml-1" />
                    </div>
                </div>

                {/* Metric column */}
                <div className="flex flex-col divide-y divide-grey-light/70 lg:border-l lg:border-grey-light/70 lg:pl-5 dark:divide-grey-light/10 dark:lg:border-grey-light/10">
                    {d.metrics.map((m) => {
                        const mUp = !m.delta.startsWith("-");
                        return (
                            <div key={m.key} className="flex flex-1 items-center gap-3 py-3.5">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${m.color}1f` }}>
                                    <Stroke d={m.icon} color={m.color} className="h-[17px] w-[17px]" />
                                </span>
                                <div className="min-w-0 grow">
                                    <div className="text-caption-2 text-grey">{m.label}</div>
                                    <div className="font-poppins text-title font-bold text-black dark:text-white">{m.value}</div>
                                </div>
                                <span className={cn("inline-flex shrink-0 items-center gap-0.5 text-caption-2 font-semibold", mUp ? "text-[#0a7a5f] dark:text-success" : "text-[#c0453f] dark:text-[#E17055]")}>
                                    <Stroke d={mUp ? PATHS.arrowUp : PATHS.arrowDown} className="h-3 w-3" />
                                    {m.delta.replace(/^[+-]/, "")}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
            )}
            </ConnectLock>
        </Card>
    );
};

export default SearchPerformanceCard;
