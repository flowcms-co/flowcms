import { esc, num, str, usd } from "./util";
import type { ElementField, ElementTemplate } from "./index";

export type Preset = "drying-cost" | "insurance-out-of-pocket" | "custom";

const read = (values: unknown) => {
    const v = (values && typeof values === "object" ? values : {}) as Record<string, unknown>;
    const preset: Preset = v.preset === "insurance-out-of-pocket" || v.preset === "custom" ? v.preset : "drying-cost";
    const options = [1, 2, 3, 4].map((i) => ({ name: str(v[`option${i}Name`]), rate: num(v[`option${i}Rate`]) })).filter((o) => o.name);
    return {
        title: str(v.title), preset, clean: num(v.rateClean), gray: num(v.rateGray), black: num(v.rateBlack),
        qtyLabel: str(v.qtyLabel), optLabel: str(v.optLabel), qty: num(v.qty), qtyUnit: str(v.qtyUnit), options, low: num(v.low), high: num(v.high), caption: str(v.caption), note: str(v.note),
    };
};

/** Range multipliers for the custom preset: anything unusable falls back to the drying defaults. */
const mults = (lo: number, hi: number): [number, number] => (lo > 0 && hi >= lo ? [lo, hi] : [0.8, 1.25]);

/** The starting inputs the static markup shows (and so what a reader without JS sees). */
const START = { area: 800, estimate: 8000, deductible: 1000 };
const r10 = (x: number) => Math.round(x / 10) * 10;
// Same maths as public/elements.js (kept in sync by hand; the browser test checks they agree).
const dryingResult = (area: number, rate: number, cat: string) => ({ cap: "Estimated drying cost", value: `${usd(r10(area * rate * 0.8))} - ${usd(r10(area * rate * 1.25))}`, note: `Typical drying time: 3 to 5 days for ${cat} water.` });
const insuranceResult = (est: number, ded: number, sudden: boolean) => {
    const pay = sudden ? Math.min(est, ded) : est;
    return { cap: "You pay", value: usd(pay), note: `Insurer may pay ${usd(est - pay)}` };
};

/** Same maths as the custom branch of js.ts (a parity test runs both). */
const customResult = (qty: number, rate: number, lo: number, hi: number) => {
    const base = (qty > 0 ? qty : 0) * (rate > 0 ? rate : 0);
    return `${usd(r10(base * lo))} - ${usd(r10(base * hi))}`;
};

export const calculator: ElementTemplate = {
    id: "calculator",
    name: "Calculator",
    description: "A small working calculator with presets.",
    enabled: true,
    fields: [
        { key: "title", label: "Title", type: "text" },
        {
            key: "preset",
            label: "Calculator",
            type: "choice",
            options: [
                { value: "drying-cost", label: "Drying cost" },
                { value: "insurance-out-of-pocket", label: "Insurance out of pocket" },
                { value: "custom", label: "Custom price x quantity" },
            ],
        },
        { key: "rateClean", label: "Clean water rate ($ per sq ft)", type: "number", hint: "Used by the drying cost calculator." },
        { key: "rateGray", label: "Gray water rate ($ per sq ft)", type: "number" },
        { key: "rateBlack", label: "Black water rate ($ per sq ft)", type: "number" },
        { key: "qtyLabel", label: "Custom: quantity label", type: "text", hint: "For example: Roof size (sq ft), Number of outlets." },
        { key: "qty", label: "Custom: starting quantity", type: "number" },
        { key: "optLabel", label: "Custom: option picker label", type: "text", hint: "For example: Roof material, Type of pest. Default: Option." },
        { key: "qtyUnit", label: "Custom: rate unit (optional)", type: "text", hint: "Shown beside each rate, for example: sq ft, outlet." },
        ...[1, 2, 3, 4].flatMap((i): ElementField[] => [
            { key: `option${i}Name`, label: `Custom: option ${i} name${i > 1 ? " (optional)" : ""}`, type: "text" },
            { key: `option${i}Rate`, label: `Custom: option ${i} rate ($ per unit)`, type: "number" },
        ]),
        { key: "low", label: "Custom: low multiplier", type: "number", hint: "The low end of the range is the total times this. Default 0.8." },
        { key: "high", label: "Custom: high multiplier", type: "number", hint: "The high end is the total times this. Default 1.25." },
        { key: "caption", label: "Custom: result caption", type: "text" },
        { key: "note", label: "Custom: note under the result (optional)", type: "text" },
    ],
    defaults: () => ({ title: "House drying cost estimator", preset: "drying-cost", rateClean: 3.75, rateGray: 4.5, rateBlack: 7,
        qtyLabel: "Quantity", optLabel: "Option", qty: 100, qtyUnit: "", option1Name: "Standard", option1Rate: 10, option2Name: "", option2Rate: "", option3Name: "", option3Rate: "", option4Name: "", option4Rate: "",
        low: 0.8, high: 1.25, caption: "Estimated cost", note: "",
    }),
    validate(values) {
        const v = read(values);
        if (v.preset === "custom") {
            const out: string[] = [];
            if (!v.qtyLabel) out.push("The quantity label cannot be empty.");
            if (!(v.qty > 0)) out.push("The starting quantity must be a number above zero.");
            if (!v.options.some((o) => o.rate > 0)) out.push("Add at least one option with a name and a rate above zero.");
            else if (v.options.some((o) => !(o.rate > 0))) out.push("Every named option needs a rate above zero.");
            if (Number.isFinite(v.low) || Number.isFinite(v.high)) if (!(v.low > 0 && v.high >= v.low)) out.push("The low multiplier must be above zero and not above the high multiplier.");
            return out;
        }
        if (v.preset !== "drying-cost") return [];
        return (["clean", "gray", "black"] as const).filter((k) => !(v[k] > 0)).map((k) => `The ${k} water rate must be a number above zero.`);
    },
    render(values) {
        const v = read(values);
        const title = v.title ? `<p class="el-title">${esc(v.title)}</p>` : "";
        const sel = (cur: string, opts: [string, string][]) => opts.map(([val, l]) => `<option value="${val}"${val === cur ? " selected" : ""}>${l}</option>`).join("");
        let attrs: string, fields: string, r: { cap: string; value: string; note: string };
        if (v.preset === "drying-cost") {
            const rate = (n: number) => (n > 0 ? n : 0);
            attrs = `data-preset="drying" data-rate-clean="${rate(v.clean)}" data-rate-gray="${rate(v.gray)}" data-rate-black="${rate(v.black)}"`;
            fields =
                `<div><label>Affected area (sq ft)<input data-k="a" type="number" min="0" inputmode="decimal" value="${START.area}"></label></div>` +
                `<div><label>Water category<select data-k="s">${sel("clean", [["clean", "Clean water"], ["gray", "Gray water"], ["black", "Black water"]])}</select></label></div>`;
            r = dryingResult(START.area, rate(v.clean), "clean");
        } else if (v.preset === "custom") {
            const opts = v.options.map((o) => ({ name: o.name, rate: o.rate > 0 ? o.rate : 0 }));
            const [lo, hi] = mults(v.low, v.high);
            const qty = v.qty > 0 ? v.qty : 1;
            const cap = v.caption || "Estimated cost";
            attrs = `data-preset="custom" data-lo="${lo}" data-hi="${hi}" data-cap="${esc(cap)}"`;
            const ql = v.qtyLabel || "Quantity";
            const optHtml = opts.map((o, i) => `<option value="${i}" data-rate="${o.rate}"${i === 0 ? " selected" : ""}>${esc(o.name)} (${usd(o.rate)}${v.qtyUnit ? ` per ${esc(v.qtyUnit)}` : ""})</option>`).join("");
            fields =
                `<div><label>${esc(ql)}<input data-k="a" type="number" min="0" inputmode="decimal" value="${qty}"></label></div>` +
                `<div><label>${esc(v.optLabel || "Option")}<select data-k="s">${optHtml}</select></label></div>`;
            r = { cap: esc(cap), value: customResult(qty, opts[0]?.rate ?? 0, lo, hi), note: esc(v.note) };
        } else {
            attrs = `data-preset="insurance"`;
            fields =
                `<div><label>Repair estimate ($)<input data-k="a" type="number" min="0" inputmode="decimal" value="${START.estimate}"></label></div>` +
                `<div><label>Deductible ($)<input data-k="b" type="number" min="0" inputmode="decimal" value="${START.deductible}"></label></div>` +
                `<div class="full"><label>Cause of damage<select data-k="s">${sel("sudden", [["sudden", "Sudden, such as a burst pipe: usually covered"], ["gradual", "Gradual leak or flood: usually not covered"]])}</select></label></div>`;
            r = insuranceResult(START.estimate, START.deductible, true);
        }
        return (
            `<div class="el-calc" ${attrs}><div class="el-card">${title}<div class="el-cf">${fields}</div>` +
            `<div class="el-res" aria-live="polite"><p class="el-cap">${r.cap}</p><div class="v">${r.value}</div><p class="el-note">${r.note}</p></div>` +
            `<p class="el-fine">Estimate only. Actual costs vary.</p></div></div>`
        );
    },
};
