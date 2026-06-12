"use client";

/**
 * Recharts' ResponsiveContainer initializes its size state to -1 and logs
 * "The width(-1) and height(-1) of chart should be greater than 0" on its first
 * render, before its ResizeObserver measures the (correctly sized) container. The
 * charts render fine; the message is a known dev-only false positive that floods
 * the console. We filter that ONE exact message (nothing else) so real warnings
 * stay visible. No-ops in production, where Recharts doesn't log it anyway.
 *
 * Patched at module load (not in an effect) so it's in place before the first
 * chart renders on a fresh page load. Guarded to run once, client + dev only.
 */
declare global {
    interface Window { __flowChartWarnPatched?: boolean }
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production" && !window.__flowChartWarnPatched) {
    window.__flowChartWarnPatched = true;
    const orig = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
        const first = args[0];
        if (typeof first === "string" && first.includes("width(-1) and height(-1) of chart")) return;
        orig(...args);
    };
}

const SilenceChartWarning = () => null;

export default SilenceChartWarning;
