"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import TrendArea from "@/components/charts/TrendArea";
import StatNumber from "@/components/motion/StatNumber";
import ConnectLock from "@/components/ui/ConnectLock";
import LiveBadge from "../seo/LiveBadge";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useConnections } from "@/lib/useConnections";
import { PERIODS, bucketSum, emptyReason, niceScale, pctDelta, type AnalyticsStatus } from "@/lib/trafficMath";

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

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`);

type Pt = { date: string; value: number };
type Totals = { clicks: number; impressions: number; ctr: number; position: number; sessions: number };
type Overview = {
    hasData: boolean;
    status?: AnalyticsStatus;
    totals?: Totals;
    /** The equal period before the selected one; null when there is none to compare. */
    previous?: Totals | null;
    series?: { clicks: Pt[]; impressions: Pt[]; sessions: Pt[] };
};

// delta is null when there is no previous period to compare against; the row then
// renders the value with no trend arrow (rather than a fake one). `good` is whether
// the change is an improvement (a lower average position is better).
type Metric = { key: string; label: string; value: string; delta: number | null; good: boolean; color: string; icon: string };
type Built = { big: string; bigLabel: string; bigDelta: number | null; source: string; chart: { x: string; cur: number; prev: number }[]; scale: ReturnType<typeof niceScale>; metrics: Metric[] };

const METRICS = [
    { key: "organic", label: "Organic traffic", color: "#6C5CE7", icon: PATHS.search },
    { key: "impr", label: "Impressions", color: "#00B894", icon: PATHS.eye },
    { key: "pos", label: "Avg. position", color: "#E91E63", icon: PATHS.target },
    { key: "ctr", label: "Click through rate", color: "#F59E0B", icon: PATHS.cursor },
];

/* Empty state: an empty chart and "—" placeholders, no delta and no sample dataset. */
const EMPTY: Built = {
    big: "—",
    bigLabel: "Search clicks",
    bigDelta: null,
    source: "Search Console",
    chart: [],
    scale: niceScale(0),
    metrics: METRICS.map((m) => ({ ...m, value: "—", delta: null, good: true })),
};

export function buildLive(o: Overview): Built | null {
    if (!o.hasData || !o.totals) return null;
    const t = o.totals;
    const p = o.previous ?? null;
    const gsc = (o.series?.clicks.length ?? 0) > 0;
    // The headline is GA4 sessions when GA4 has data, else Search Console clicks;
    // the label, the chart and the "%" all follow that same series.
    const ga4 = (o.series?.sessions.length ?? 0) > 0;
    const buckets = bucketSum((ga4 ? o.series?.sessions : o.series?.clicks) ?? []);
    const scale = niceScale(Math.max(0, ...buckets.map((b) => b.value)));
    const d = [pctDelta(p?.clicks, t.clicks), pctDelta(p?.impressions, t.impressions), pctDelta(p?.position, t.position), pctDelta(p?.ctr, t.ctr)];
    const values = [fmt(t.clicks), fmt(t.impressions), t.position.toFixed(1), `${t.ctr.toFixed(1)}%`];
    return {
        big: fmt(ga4 ? t.sessions : t.clicks),
        bigLabel: ga4 ? "Sessions (GA4)" : "Search clicks (Search Console)",
        bigDelta: ga4 ? pctDelta(p?.sessions, t.sessions) : d[0],
        source: ga4 && gsc ? "GA4 + Search Console" : ga4 ? "GA4" : "Search Console",
        chart: buckets.map((b) => ({ x: b.x, cur: +(b.value / scale.div).toFixed(1), prev: 0 })),
        scale,
        // The four rows are Search Console metrics: dashes when only GA4 is connected.
        metrics: METRICS.map((m, i) => ({ ...m, value: gsc ? values[i] : "—", delta: gsc ? d[i] : null, good: m.key === "pos" ? (d[i] ?? 0) <= 0 : (d[i] ?? 0) >= 0 })),
    };
}

/**
 * Search-performance card. Area chart of the headline series over the period (GA4
 * sessions, else Search Console clicks), with a metric column (organic traffic /
 * impressions / avg. position / CTR), each compared with the previous equal period.
 * Live from /analytics/overview; with no data it says why instead of showing numbers.
 * The top-right dropdown switches the period.
 */
const SearchPerformanceCard = () => {
    const [periodId, setPeriodId] = useState("30d");
    const period = PERIODS.find((p) => p.id === periodId)!;
    const label = period.label;
    const [live, setLive] = useState<Built | null>(null);
    const [status, setStatus] = useState<AnalyticsStatus | undefined>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const { connections: conn, loading: connLoading, forbidden } = useConnections();

    useEffect(() => {
        let off = false;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true); // show the skeleton while the new period loads
        api<Overview>(`/analytics/overview?days=${period.days}`)
            .then((o) => {
                if (off) return;
                setLive(buildLive(o));
                setStatus(o.status);
                setError(false);
                setLoading(false);
            })
            .catch(() => {
                if (off) return;
                setLive(null);
                setError(true);
                setLoading(false);
            });
        return () => {
            off = true;
        };
    }, [period.days]);

    // Loaded with no live data → empty chart + "—" placeholders (never sample data).
    const d = live ?? EMPTY;
    const up = (d.bigDelta ?? 0) >= 0;
    // Why there is nothing to show: a failed request is not the same as no data yet.
    const reason = loading ? "Loading" : error ? "Couldn't load" : emptyReason(status);

    return (
        <Card className="flex h-full flex-col !p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-poppins text-[15px] font-semibold text-black dark:text-white">
                    Search performance &middot; {label}
                    <span className="ml-1"><LiveBadge live={!!live} source={d.source} reason={reason} /></span>
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

            {forbidden.analytics ? (
                <p className="flex grow items-center justify-center py-16 text-body-sm text-grey">You don&rsquo;t have access to this data.</p>
            ) : (
            <ConnectLock
                connected={conn.gsc || conn.ga4}
                loading={connLoading}
                brand="Google Search Console"
                title="Connect Search Console"
                description="Connect Google Search Console or Google Analytics to track search clicks, impressions, CTR, average position and sessions from real traffic."
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
                    <div className="text-caption-1 text-grey">{d.bigLabel}</div>
                    <StatNumber value={d.big} className="mt-1 font-poppins text-[clamp(2rem,1.7rem_+_1.1vw,2.75rem)] leading-none font-bold text-black dark:text-white" />
                    {d.bigDelta != null ? (
                        <span className={cn("mt-1.5 inline-flex items-center gap-1 text-caption-1 font-semibold", up ? "text-[#0a7a5f] dark:text-success" : "text-[#c0453f] dark:text-[#E17055]")}>
                            <Stroke d={up ? PATHS.arrowUp : PATHS.arrowDown} className="h-3.5 w-3.5" />
                            {Math.abs(d.bigDelta)}% vs previous {period.days} days
                        </span>
                    ) : (
                        // No delta without data, and none when the synced history has no earlier period.
                        <span className="mt-1.5 text-caption-1 text-grey">
                            {error ? "Couldn\u2019t load search performance. Reload to try again." : live ? "No earlier period to compare with" : (
                                <>{reason}. <Link href="/settings/integrations?tab=analytics" className="font-semibold text-primary hover:opacity-70">Open analytics settings</Link></>
                            )}
                        </span>
                    )}
                    {/* Gap from the headline, then the chart fills to the card's bottom so
                        its baseline lines up with the metric column. min-height keeps it
                        from collapsing when the row stacks to one column (mobile). */}
                    <div className="mt-6 grow min-h-[16rem]">
                        <TrendArea data={d.chart} height="100%" unit={d.scale.unit} color={LINE} fillOpacity={0.16} showPrev={false} domain={[0, d.scale.max]} ticks={d.scale.ticks} insetClass="-ml-1" />
                    </div>
                </div>

                {/* Metric column */}
                <div className="flex flex-col divide-y divide-grey-light/70 lg:border-l lg:border-grey-light/70 lg:pl-5 dark:divide-grey-light/10 dark:lg:border-grey-light/10">
                    {d.metrics.map((m) => {
                        const mUp = (m.delta ?? 0) >= 0;
                        return (
                            <div key={m.key} className="flex flex-1 items-center gap-3 py-3.5">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${m.color}1f` }}>
                                    <Stroke d={m.icon} color={m.color} className="h-[17px] w-[17px]" />
                                </span>
                                <div className="min-w-0 grow">
                                    <div className="text-caption-2 text-grey">{m.label}</div>
                                    <div className="font-poppins text-title font-bold text-black dark:text-white">{m.value}</div>
                                </div>
                                {/* Only render a trend arrow when there is a previous period to compare with. */}
                                {m.delta != null && (
                                    <span className={cn("inline-flex shrink-0 items-center gap-0.5 text-caption-2 font-semibold", m.good ? "text-[#0a7a5f] dark:text-success" : "text-[#c0453f] dark:text-[#E17055]")}>
                                        <Stroke d={mUp ? PATHS.arrowUp : PATHS.arrowDown} className="h-3 w-3" />
                                        {Math.abs(m.delta)}%
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            )}
            </ConnectLock>
            )}
        </Card>
    );
};

export default SearchPerformanceCard;
