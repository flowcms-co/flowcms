"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import StatNumber from "@/components/motion/StatNumber";

export type DonutSlice = { label: string; value: number; color: string };

/**
 * Generic donut chart with a centered value (Unity StatementsPage style).
 * Used for traffic-source / category breakdowns across the SEO + AI suites.
 */
const DonutChart = ({
    data,
    centerValue,
    centerLabel,
    size = 200,
}: {
    data: DonutSlice[];
    centerValue: string;
    centerLabel: string;
    size?: number;
}) => (
    <div className="relative" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <PieChart>
                <Pie
                    data={data}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="72%"
                    outerRadius="100%"
                    paddingAngle={3}
                    cornerRadius={6}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                >
                    {data.map((d) => (
                        <Cell key={d.label} fill={d.color} />
                    ))}
                </Pie>
            </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
            <StatNumber
                value={centerValue}
                className="font-poppins text-h3 font-extrabold leading-none text-black dark:text-white"
            />
            <span className="mt-1 text-caption-2 text-grey">{centerLabel}</span>
        </div>
    </div>
);

export default DonutChart;
