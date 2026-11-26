import { esc, num, str, usd } from "./util";
import type { ElementTemplate } from "./index";

export type Preset = "drying-cost" | "insurance-out-of-pocket";

const read = (values: unknown) => {
    const v = (values && typeof values === "object" ? values : {}) as Record<string, unknown>;
    const preset: Preset = v.preset === "insurance-out-of-pocket" ? "insurance-out-of-pocket" : "drying-cost";
    return { title: str(v.title), preset, clean: num(v.rateClean), gray: num(v.rateGray), black: num(v.rateBlack) };
};

/** The starting inputs the static markup shows (and so what a reader without JS sees). */
const START = { area: 800, estimate: 8000, deductible: 1000 };
const r10 = (x: number) => Math.round(x / 10) * 10;
// Same maths as public/elements.js (kept in sync by hand; the browser test checks they agree).
const dryingResult = (area: number, rate: number, cat: string) => ({ cap: "Estimated drying cost", value: `${usd(r10(area * rate * 0.8))} - ${usd(r10(area * rate * 1.25))}`, note: `Typical drying time: 3 to 5 days for ${cat} water.` });
const insuranceResult = (est: number, ded: number, sudden: boolean) => {
    const pay = sudden ? Math.min(est, ded) : est;
    return { cap: "You pay", value: usd(pay), note: `Insurer may pay ${usd(est - pay)}` };
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
            ],
        },
        { key: "rateClean", label: "Clean water rate ($ per sq ft)", type: "number", hint: "Used by the drying cost calculator." },
        { key: "rateGray", label: "Gray water rate ($ per sq ft)", type: "number" },
        { key: "rateBlack", label: "Black water rate ($ per sq ft)", type: "number" },
    ],
    defaults: () => ({ title: "House drying cost estimator", preset: "drying-cost", rateClean: 3.75, rateGray: 4.5, rateBlack: 7 }),
    validate(values) {
        const v = read(values);
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
