"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

/**
 * Progress bar that animates its fill from 0 to `percent` when scrolled into
 * view. Isolated client leaf so parent cards stay Server Components. Honors
 * prefers-reduced-motion.
 *
 * Fill color: pass `color` (hex, via inline style) OR `barClassName` (a Tailwind
 * bg-* class). Shape is controlled by `trackClassName` / `barClassName` so the
 * same component serves the thin metric bars and the chunkier pipeline bars.
 */
const MetricBar = ({
    percent,
    color,
    trackClassName = "h-[3px] rounded-sm bg-[#EDE9FB] dark:bg-grey-light/10",
    barClassName = "rounded-sm",
}: {
    percent: number;
    color?: string;
    trackClassName?: string;
    barClassName?: string;
}) => {
    const reduce = useReducedMotion();

    return (
        <div className={cn("overflow-hidden", trackClassName)}>
            <motion.div
                className={cn("h-full", barClassName)}
                style={color ? { backgroundColor: color } : undefined}
                initial={reduce ? false : { width: 0 }}
                whileInView={{ width: `${percent}%` }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
        </div>
    );
};

export default MetricBar;
