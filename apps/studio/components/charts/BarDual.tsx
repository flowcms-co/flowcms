"use client";

import {
    Bar,
    BarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

/**
 * Grouped dual-color bar chart (Unity CampaignsPage / StatementsPage style).
 * Primary = brand purple, secondary = light blue, rounded bar tops.
 */
const BarDual = ({
    data,
    height = 260,
}: {
    data: { x: string; cur: number; prev: number }[];
    height?: number;
}) => (
    <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={data} barGap={6} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <XAxis
                    dataKey="x"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fontWeight: 600, fill: "var(--color-grey)" }}
                    padding={{ left: 8, right: 8 }}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    tick={{ fontSize: 12, fontWeight: 600, fill: "var(--color-grey)" }}
                />
                <Tooltip
                    cursor={{ fill: "rgba(108,92,231,0.07)" }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #ECEAF5", fontSize: 12 }}
                />
                <Bar dataKey="cur" fill="#6C5CE7" radius={[6, 6, 0, 0]} barSize={14} animationDuration={900} />
                <Bar dataKey="prev" fill="#A0D7E7" radius={[6, 6, 0, 0]} barSize={14} animationDuration={1100} />
            </BarChart>
        </ResponsiveContainer>
    </div>
);

export default BarDual;
