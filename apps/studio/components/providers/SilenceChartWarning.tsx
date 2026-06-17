"use client";

/**
 * Recharts' ResponsiveContainer initializes its size state to -1 and logs
 * "The width(-1) and height(-1) of chart should be greater than 0" on its first
 * render, before its ResizeObserver measures the (correctly sized) container. The
 * charts render fine; the message is a known false positive that floods the console
 * (Recharts emits it in production builds too). We filter only that one message
 * family (matched by its stable suffix, so width(0)/height(0) variants are caught)
 * so real warnings stay visible.
 *
 * Patched at module load (not in an effect) so it's in place before the first
 * chart renders on a fresh page load. Guarded to run once, client-side.
 */
declare global {
    interface Window { __flowChartWarnPatched?: boolean }
}

if (typeof window !== "undefined" && !window.__flowChartWarnPatched) {
    window.__flowChartWarnPatched = true;
    const orig = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
        const first = args[0];
        if (typeof first === "string" && first.includes("of chart should be greater than 0")) return;
        orig(...args);
    };
}

const SilenceChartWarning = () => null;

export default SilenceChartWarning;
