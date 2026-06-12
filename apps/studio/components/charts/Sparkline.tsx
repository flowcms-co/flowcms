"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

/** Tiny axis-less trend line used beside a hero metric (Unity style). */
const Sparkline = ({
    data,
    color = "#6C5CE7",
    width = "100%",
    height = 40,
}: {
    data: number[];
    color?: string;
    width?: number | string;
    height?: number;
}) => (
    <div style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 4, bottom: 4, left: 2, right: 2 }}>
                <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} dot={false} />
            </LineChart>
        </ResponsiveContainer>
    </div>
);

export default Sparkline;
