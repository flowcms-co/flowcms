"use client";

import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

/**
 * Reusable current-vs-previous area chart on a light card. Takes its data as a
 * prop so it can be used across the SEO suite (organic trend, AI referral, …).
 */
const TrendArea = ({
    data,
    height = 256,
    unit = "k",
    color = "#6C5CE7",
    showPrev = true,
    fillOpacity = 0.35,
    domain,
    ticks,
    xInterval,
    insetClass = "-ml-4",
}: {
    data: { x: string; cur: number; prev: number }[];
    /** Pixel height (number) or a CSS value like "100%" to fill a flex/grow parent. */
    height?: number | string;
    unit?: string;
    color?: string;
    /** Show the lighter previous-period comparison area (default true). */
    showPrev?: boolean;
    /** Top opacity of the current-series area fill (default 0.35). */
    fillOpacity?: number;
    /** Fixed Y domain, e.g. [0, 30] for clean ticks. */
    domain?: [number, number];
    /** Explicit Y ticks, e.g. [0, 10, 20, 30]. */
    ticks?: number[];
    /** XAxis tick interval (recharts) — thin out crowded labels. */
    xInterval?: number | "preserveStartEnd";
    /** Left-margin utility on the wrapper; defaults to -ml-4 to hug the card.
        Pass a gentler value (e.g. "-ml-1") to keep breathing room. */
    insetClass?: string;
}) => (
    <div style={{ height }} className={insetClass}>
        <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id={`fillCur-${color}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillPrevTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#A29BFE" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#A29BFE" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid
                    vertical={false}
                    stroke="#ECEAF5"
                    strokeDasharray="4 4"
                    className="dark:opacity-10"
                />
                <XAxis
                    dataKey="x"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fontWeight: 600, fill: "var(--color-grey)" }}
                    padding={{ left: 8, right: 8 }}
                    {...(xInterval !== undefined ? { interval: xInterval } : {})}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    tick={{ fontSize: 12, fontWeight: 600, fill: "var(--color-grey)" }}
                    tickFormatter={(v) => `${v}${unit}`}
                    {...(domain ? { domain } : {})}
                    {...(ticks ? { ticks } : {})}
                />
                <Tooltip
                    cursor={{ stroke: "#C9BEFB", strokeWidth: 1 }}
                    contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #ECEAF5",
                        fontSize: 12,
                    }}
                />
                {showPrev && (
                    <Area
                        type="monotone"
                        dataKey="prev"
                        stroke="#A29BFE"
                        strokeWidth={2}
                        fill="url(#fillPrevTrend)"
                        animationDuration={900}
                    />
                )}
                <Area
                    type="monotone"
                    dataKey="cur"
                    stroke={color}
                    strokeWidth={2.5}
                    fill={`url(#fillCur-${color})`}
                    animationDuration={1100}
                />
            </AreaChart>
        </ResponsiveContainer>
    </div>
);

export default TrendArea;
