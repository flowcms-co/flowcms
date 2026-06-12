"use client";

import { Bar, BarChart, ResponsiveContainer } from "recharts";

/**
 * White ghost-capped bars for a bold colored panel (Unity "Active Users" card):
 * a solid white value bar with a lighter translucent cap on top. Axis-less.
 */
const BarGhost = ({
    data,
    height = 150,
}: {
    data: { x: string; value: number }[];
    height?: number;
}) => (
    <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart
                data={data.map((d) => ({
                    x: d.x,
                    v: d.value,
                    cap: Math.max(2, Math.round(d.value * 0.2)),
                }))}
                barCategoryGap="42%"
                margin={{ top: 6, right: 4, left: 4, bottom: 0 }}
            >
                <Bar dataKey="v" stackId="a" fill="rgba(255,255,255,0.95)" radius={[0, 0, 7, 7]} animationDuration={900} />
                <Bar dataKey="cap" stackId="a" fill="rgba(255,255,255,0.4)" radius={[7, 7, 0, 0]} animationDuration={1000} />
            </BarChart>
        </ResponsiveContainer>
    </div>
);

export default BarGhost;
