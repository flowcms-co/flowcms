"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import CountUp from "@/components/motion/CountUp";

/**
 * SEO severity donut — Unity's EarningsItem ring (innerRadius 82 / outerRadius
 * 112, rounded segment colors) with the score placed inside the hole, which
 * Unity left empty. Segments are the high/medium/low issue breakdown.
 */
type Segment = { label: string; value: number; color: string };

const SeoDonut = ({
    size = 208,
    score,
    segments = [],
    innerRadius = "74%",
    cornerRadius = 8,
    scoreSize = 40,
    caption,
    captionColor,
}: {
    size?: number;
    score?: number | null;
    segments?: Segment[];
    /** Ring inner radius (higher = thinner ring). */
    innerRadius?: string;
    /** Rounded segment caps; keep below the band width. */
    cornerRadius?: number;
    /** Score font size in px. */
    scoreSize?: number;
    /** Optional rating word shown under "/ 100" (e.g. "Good"). */
    caption?: string;
    /** Color for the rating word. */
    captionColor?: string;
}) => {
    const data = segments;
    const shown = score != null ? score : 0;
    return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <PieChart>
                <Pie
                    data={data}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={innerRadius}
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={2}
                    cornerRadius={cornerRadius}
                    stroke="none"
                    // Render immediately. The grow-in animation can stall in background
                    // tabs / headless / iframed contexts and leave the ring blank.
                    isAnimationActive={false}
                >
                    {data.map((s) => (
                        <Cell key={s.label} fill={s.color} style={{ outline: "none" }} />
                    ))}
                </Pie>
            </PieChart>
        </ResponsiveContainer>
        {/* Score centered in the hole */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-poppins leading-none font-semibold text-black dark:text-white" style={{ fontSize: scoreSize }}>
                <CountUp value={typeof shown === "number" ? shown : Number(shown) || 0} />
            </span>
            <span className="text-caption-2 text-grey">/ 100</span>
            {caption && (
                <span className="mt-1 font-poppins text-caption-1 font-bold" style={{ color: captionColor }}>
                    {caption}
                </span>
            )}
        </div>
    </div>
    );
};

export default SeoDonut;
