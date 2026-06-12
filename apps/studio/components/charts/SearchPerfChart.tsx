"use client";

import {
    Area,
    AreaChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

type Point = { x: string; cur: number; prev: number };

const Pill = ({ active, payload }: { active?: boolean; payload?: { value: number }[] }) =>
    active && payload?.length ? (
        <span className="inline-block rounded-md bg-ink px-2.5 py-1 text-[11px] font-bold text-white">
            {(payload[0].value * 1000).toLocaleString()}
        </span>
    ) : null;

/**
 * Search-performance line chart on the purple card. Data is passed in so the
 * graph swaps with the selected time range. Recharts redraws (animates) on
 * data change, so switching periods re-draws the line.
 */
const SearchPerfChart = ({ points }: { points: Point[] }) => {
    const vals = points.flatMap((p) => [p.cur, p.prev]);
    const min = Math.floor(Math.min(...vals) - 2);
    const max = Math.ceil(Math.max(...vals) + 2);

    return (
        <div className="h-full min-h-[150px]">
            <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
                <AreaChart data={points} margin={{ top: 24, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                        <linearGradient id="spcFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <YAxis hide domain={[min, max]} />
                    <XAxis
                        dataKey="x"
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        // Inset the first/last ticks so the end labels (e.g. W1, W4)
                        // sit fully inside the chart instead of being half-clipped.
                        padding={{ left: 16, right: 16 }}
                        tick={{ fontSize: 11, fill: "#ffffff" }}
                        dy={4}
                    />
                    <Tooltip cursor={false} content={<Pill />} />
                    {/* previous period — dashed, faint */}
                    <Line
                        type="monotone"
                        dataKey="prev"
                        stroke="rgba(255,255,255,0.4)"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        dot={false}
                        animationDuration={700}
                    />
                    {/* current period — solid white + soft fill */}
                    <Area
                        type="monotone"
                        dataKey="cur"
                        stroke="#ffffff"
                        strokeWidth={2.5}
                        fill="url(#spcFill)"
                        dot={false}
                        activeDot={{ r: 4, fill: "#6C5CE7", stroke: "#fff", strokeWidth: 2 }}
                        animationDuration={900}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default SearchPerfChart;
