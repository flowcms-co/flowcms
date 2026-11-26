import { esc, num, str, usd } from "./util";
import type { ElementTemplate } from "./index";

const read = (values: unknown) => {
    const v = (values && typeof values === "object" ? values : {}) as Record<string, unknown>;
    return { title: str(v.title), location: str(v.location), low: num(v.low), avg: num(v.avg), high: num(v.high), min: num(v.min), max: num(v.max), note: str(v.note), unit: str(v.unit) };
};

/** Position on the bar as a number from 0 to 100, two decimals. Anything unusable is 0. */
const pct = (x: number, min: number, max: number): number => {
    const p = ((x - min) / (max - min || 1)) * 100;
    return Number.isFinite(p) ? Math.round(Math.min(100, Math.max(0, p)) * 100) / 100 : 0;
};

export const cost: ElementTemplate = {
    id: "cost",
    name: "Cost Estimator",
    description: "Low, average and high price with a range bar.",
    enabled: true,
    fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "location", label: "Location", type: "text" },
        { key: "low", label: "Low end ($)", type: "number" },
        { key: "avg", label: "Average ($)", type: "number" },
        { key: "high", label: "High end ($)", type: "number" },
        { key: "min", label: "Bar minimum ($)", type: "number", hint: "The left edge of the bar. Use a value at or below the low end." },
        { key: "max", label: "Bar maximum ($)", type: "number", hint: "The right edge of the bar. Use a value at or above the high end." },
        { key: "unit", label: "Price unit (optional)", type: "text", hint: "Shown after the range, for example: per visit, per treatment, per roof square." },
        { key: "note", label: "How we get this data (optional)", type: "text", long: true },
    ],
    defaults: () => ({ title: "Service Cost", location: "", low: 1450, avg: 3450, high: 6200, min: 450, max: 15000, unit: "", note: "" }),
    validate(values) {
        const v = read(values);
        const out: string[] = [];
        const names: [string, number][] = [["Low end", v.low], ["Average", v.avg], ["High end", v.high], ["Bar minimum", v.min], ["Bar maximum", v.max]];
        for (const [n, x] of names) if (!Number.isFinite(x)) out.push(`${n} must be a number.`);
        if (out.length) return out;
        if (v.low > v.avg) out.push("Low end cannot be above the average.");
        if (v.avg > v.high) out.push("Average cannot be above the high end.");
        if (v.min > v.low) out.push("Bar minimum cannot be above the low end.");
        if (v.high > v.max) out.push("High end cannot be above the bar maximum.");
        return out;
    },
    render(values) {
        const v = read(values);
        const loc = esc(v.location);
        const style = `--p-low:${pct(v.low, v.min, v.max)}%;--p-high:${pct(v.high, v.min, v.max)}%;--p-avg:${pct(v.avg, v.min, v.max)}%`;
        const side = (
            [
                ["Average", v.avg],
                ["Low end", v.low],
                ["High end", v.high],
            ] as [string, number][]
        )
            .map(([l, x]) => `<div><span class="el-cap">${l}</span><b>${usd(x)}</b></div>`)
            .join("");
        return (
            `<div class="el-card"><div class="el-head">${v.title ? `<p class="el-title">${esc(v.title)}</p>` : ""}${loc ? `<p class="el-loc">${loc}</p>` : ""}</div>` +
            `<div class="el-grid"><div class="el-main"><p class="el-cap">Normal range${loc ? ` for ${loc}` : ""}</p><p class="el-big">${usd(v.low)} - ${usd(v.high)}${v.unit ? ` ${esc(v.unit)}` : ""}</p>` +
            `${v.note ? `<details class="el-det"><summary>How we get this data</summary><p>${esc(v.note)}</p></details>` : ""}</div>` +
            `<div class="el-side">${side}</div></div>` +
            `<div class="el-bar" style="${style}"><div class="el-track"><div class="el-fill"></div><div class="el-dot"></div><span class="el-avg">${usd(v.avg)} AVG</span></div><div class="el-lh el-cap"><span>Low</span><span>High</span></div></div></div>`
        );
    },
};
