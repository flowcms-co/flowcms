/**
 * The calculator builder: one `config` object holds the whole calculator (fields, options, extras,
 * plan, result text). This file reads it safely, validates it, builds the blank starting config and
 * renders the first-paint markup. The maths and the result markup live in calc-core.ts, shared with
 * the browser script and the Studio preview.
 */
import { esc, num, safeJson, str } from "./util";
import { flowCalc } from "./calc-core";

export type Pair = { low: number; high: number };
export type ShowIf = { field: string; in: (string | boolean)[] };
export type CalcOption = { label: string; add?: Pair; times?: Pair; minimum?: Pair; rates?: Record<string, Pair>; note?: string; est?: boolean; quote?: boolean };
export type NumberField = { id: string; type: "number"; label: string; unit: string; min: number; max: number; step: number; default: number; rate: Pair; showIf?: ShowIf };
export type ChoiceField = { id: string; type: "choice"; label: string; display: "buttons" | "select"; default: string; options: CalcOption[]; showIf?: ShowIf };
export type AddonField = { id: string; type: "addon"; label: string; default: boolean; add?: Pair; per?: { field: string; rate: Pair }; showIf?: ShowIf };
export type CalcField = NumberField | ChoiceField | AddonField;
export type PlanOption = { label: string; visitsPerYear: number; visit?: Pair; est?: boolean };
export type CalcPlan = { label: string; default: string; replaces?: string; note?: string; showIf?: ShowIf; options: PlanOption[] };
export type BuilderConfig = {
    title: string;
    intro: string;
    currency: string;
    base: Pair;
    minimum: Pair;
    fields: CalcField[];
    plan?: CalcPlan;
    result: { label: string; unit: "total" | "per visit"; showYearly: boolean; breakdown: boolean; note: string; coverage: string; advice: { over: number; text: string }[] };
};

export const MAX_FIELDS = 40;
export const MAX_OPTIONS = 40;
export const MAX_PLAN_OPTIONS = 12;
export const MAX_ADVICE = 10;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const P = (low: number, high: number): Pair => ({ low, high });

/** A low/high pair. An absent pair is undefined when optional and 0 to 0 when required. Anything unreadable becomes NaN, which validation reports. */
function pair(v: unknown, optional: true): Pair | undefined;
function pair(v: unknown, optional?: false): Pair;
function pair(v: unknown, optional = false): Pair | undefined {
    const o = obj(v);
    if (o.low === undefined && o.high === undefined) return optional ? undefined : P(0, 0);
    return P(num(o.low === undefined ? 0 : o.low), num(o.high === undefined ? 0 : o.high));
}

const showIf = (v: unknown): ShowIf | undefined => {
    const o = obj(v);
    if (!str(o.field)) return undefined;
    return { field: str(o.field), in: arr(o.in).filter((x): x is string | boolean => typeof x === "string" || typeof x === "boolean") };
};

/** Read anything into a config of the right shape. Never throws; what cannot be read becomes empty or NaN. */
export function normConfig(raw: unknown): BuilderConfig {
    const c = obj(raw);
    const fields: CalcField[] = arr(c.fields).slice(0, MAX_FIELDS).map((r): CalcField => {
        const f = obj(r);
        const base = { id: str(f.id), label: str(f.label), ...(showIf(f.showIf) ? { showIf: showIf(f.showIf) } : {}) };
        if (f.type === "choice") {
            const options = arr(f.options).slice(0, MAX_OPTIONS).map((x): CalcOption => {
                const o = obj(x);
                const rates = Object.fromEntries(Object.entries(obj(o.rates)).map(([k, v]) => [k, pair(v)]));
                return {
                    label: str(o.label),
                    ...(pair(o.add, true) ? { add: pair(o.add, true) } : {}),
                    ...(pair(o.times, true) ? { times: pair(o.times, true) } : {}),
                    ...(pair(o.minimum, true) ? { minimum: pair(o.minimum, true) } : {}),
                    ...(Object.keys(rates).length ? { rates } : {}),
                    ...(str(o.note) ? { note: str(o.note) } : {}),
                    ...(o.est === true ? { est: true } : {}),
                    ...(o.quote === true ? { quote: true } : {}),
                };
            });
            return { ...base, type: "choice", display: f.display === "select" ? "select" : "buttons", default: str(f.default), options };
        }
        if (f.type === "addon") {
            const per = obj(f.per);
            return { ...base, type: "addon", default: f.default === true, ...(f.per && str(per.field) ? { per: { field: str(per.field), rate: pair(per.rate) } } : { add: pair(f.add) }) };
        }
        return { ...base, type: "number", unit: str(f.unit), min: num(f.min === undefined ? 0 : f.min), max: num(f.max === undefined ? 100 : f.max), step: num(f.step === undefined ? 1 : f.step), default: num(f.default === undefined ? 0 : f.default), rate: pair(f.rate) };
    });
    const p = obj(c.plan);
    const planOptions = arr(p.options).slice(0, MAX_PLAN_OPTIONS).map((x): PlanOption => {
        const o = obj(x);
        return { label: str(o.label), visitsPerYear: num(o.visitsPerYear === undefined ? 1 : o.visitsPerYear), ...(pair(o.visit, true) ? { visit: pair(o.visit, true) } : {}), ...(o.est === true ? { est: true } : {}) };
    });
    const plan: CalcPlan | undefined = planOptions.length
        ? { label: str(p.label), default: str(p.default), ...(str(p.replaces) ? { replaces: str(p.replaces) } : {}), ...(str(p.note) ? { note: str(p.note) } : {}), ...(showIf(p.showIf) ? { showIf: showIf(p.showIf) } : {}), options: planOptions }
        : undefined;
    const r = obj(c.result);
    return {
        title: str(c.title),
        intro: str(c.intro),
        currency: typeof c.currency === "string" ? c.currency.trim().slice(0, 4) : "$",
        base: pair(c.base),
        minimum: pair(c.minimum),
        fields,
        ...(plan ? { plan } : {}),
        result: {
            label: str(r.label),
            unit: r.unit === "per visit" ? "per visit" : "total",
            showYearly: r.showYearly === true,
            breakdown: r.breakdown === true,
            note: str(r.note),
            coverage: str(r.coverage),
            advice: arr(r.advice).slice(0, MAX_ADVICE).map((x) => ({ over: num(obj(x).over === undefined ? 0 : obj(x).over), text: str(obj(x).text) })),
        },
    };
}

/** The starting calculator a new insert gets: general labels, no amounts. */
export const blankConfig = (): BuilderConfig => ({
    title: "Cost calculator",
    intro: "",
    currency: "$",
    base: P(0, 0),
    minimum: P(0, 0),
    fields: [
        { id: "n1", type: "number", label: "Quantity", unit: "units", min: 0, max: 100, step: 1, default: 1, rate: P(0, 0) },
        { id: "c1", type: "choice", label: "Option", display: "buttons", default: "Option A", options: [{ label: "Option A" }, { label: "Option B" }] },
        { id: "x1", type: "addon", label: "Extra", default: false, add: P(0, 0) },
    ],
    result: { label: "Estimated cost", unit: "total", showYearly: false, breakdown: false, note: "", coverage: "", advice: [] },
});

/** Remove references to fields, options and rates that no longer exist (after a delete or a rename). */
export function pruneConfig(cfg: BuilderConfig): BuilderConfig {
    const ids = new Set(cfg.fields.map((f) => f.id));
    const numbers = new Set(cfg.fields.filter((f) => f.type === "number").map((f) => f.id));
    const fix = (s: ShowIf | undefined): ShowIf | undefined => {
        if (!s) return undefined;
        const p = cfg.fields.find((f) => f.id === s.field);
        if (!p || p.type === "number") return undefined;
        const ok = p.type === "choice" ? s.in.filter((v) => typeof v === "string" && p.options.some((o) => o.label === v)) : s.in.filter((v) => typeof v === "boolean");
        return ok.length ? { field: s.field, in: ok } : undefined;
    };
    const withShow = <T extends { showIf?: ShowIf }>(x: T): T => {
        const { showIf: _drop, ...rest } = x;
        const s = fix(x.showIf);
        return (s ? { ...rest, showIf: s } : rest) as T;
    };
    const fields = cfg.fields.map((f): CalcField => {
        if (f.type === "choice")
            return withShow({
                ...f,
                default: f.options.some((o) => o.label === f.default) ? f.default : (f.options[0]?.label ?? ""),
                options: f.options.map((o) => {
                    if (!o.rates) return o;
                    const rates = Object.fromEntries(Object.entries(o.rates).filter(([k]) => numbers.has(k)));
                    const { rates: _r, ...rest } = o;
                    return Object.keys(rates).length ? { ...rest, rates } : rest;
                }),
            });
        if (f.type === "addon" && f.per && !numbers.has(f.per.field)) {
            const { per, ...rest } = f;
            const first = cfg.fields.find((x) => x.type === "number");
            return withShow(first ? { ...rest, per: { field: first.id, rate: per.rate } } : { ...rest, add: per.rate });
        }
        return withShow(f);
    });
    const plan = cfg.plan ? { ...cfg.plan, ...(cfg.plan.replaces && !ids.has(cfg.plan.replaces) ? { replaces: undefined } : {}) } : undefined;
    if (plan) {
        if (!plan.replaces) delete plan.replaces;
        if (!plan.options.some((o) => o.label === plan.default)) plan.default = plan.options[0]?.label ?? "";
        const s = fix(plan.showIf);
        if (s) plan.showIf = s;
        else delete plan.showIf;
    }
    return { ...cfg, fields, ...(plan ? { plan } : {}) };
}

/** Plain messages, one per problem. Empty means the calculator is valid. */
export function validateConfig(cfg: BuilderConfig): string[] {
    const out: string[] = [];
    const bad = (p: Pair | undefined) => !!p && !(Number.isFinite(p.low) && Number.isFinite(p.high));
    const reversed = (p: Pair | undefined) => !!p && Number.isFinite(p.low) && Number.isFinite(p.high) && p.low > p.high;
    const checkPair = (what: string, p: Pair | undefined) => {
        if (bad(p)) out.push(`${what}: the low and the high must be numbers.`);
        else if (reversed(p)) out.push(`${what}: the low cannot be above the high.`);
    };
    if (!cfg.result.label) out.push("The result needs a label.");
    if (!cfg.fields.length) out.push("Add at least one field.");
    checkPair("Base amount", cfg.base);
    checkPair("Minimum", cfg.minimum);
    const ids = new Set<string>();
    const numberIds = new Set(cfg.fields.filter((f) => f.type === "number").map((f) => f.id));
    cfg.fields.forEach((f, i) => {
        const name = f.label || `Field ${i + 1}`;
        if (!f.label) out.push(`Field ${i + 1} needs a label.`);
        if (!f.id || f.id === "plan") out.push(`${name}: the field id cannot be empty or "plan".`);
        else if (ids.has(f.id)) out.push(`${name}: the field id "${f.id}" is used twice.`);
        ids.add(f.id);
        if (f.type === "number") {
            checkPair(`${name}, rate`, f.rate);
            if (![f.min, f.max, f.step, f.default].every(Number.isFinite)) out.push(`${name}: min, max, step and default must be numbers.`);
            else {
                if (f.min > f.max) out.push(`${name}: the minimum cannot be above the maximum.`);
                if (!(f.step > 0)) out.push(`${name}: the step must be above zero.`);
            }
        } else if (f.type === "addon") {
            if (f.per) {
                if (!numberIds.has(f.per.field)) out.push(`${name}: pick a number field to price per unit.`);
                checkPair(`${name}, rate`, f.per.rate);
            } else checkPair(`${name}, amount`, f.add);
        } else {
            if (!f.options.length) out.push(`${name}: add at least one option.`);
            if (f.default && !f.options.some((o) => o.label === f.default)) out.push(`${name}: the default option does not exist.`);
            const seen = new Set<string>();
            f.options.forEach((o, j) => {
                const on = o.label || `option ${j + 1}`;
                if (!o.label) out.push(`${name}: option ${j + 1} needs a label.`);
                else if (seen.has(o.label)) out.push(`${name}: the option "${o.label}" appears twice.`);
                seen.add(o.label);
                checkPair(`${name}, ${on}, add`, o.add);
                checkPair(`${name}, ${on}, times`, o.times);
                checkPair(`${name}, ${on}, minimum`, o.minimum);
                for (const [k, r] of Object.entries(o.rates ?? {})) {
                    if (!numberIds.has(k)) out.push(`${name}, ${on}: the rate swap points at a number field that is gone.`);
                    checkPair(`${name}, ${on}, rate swap`, r);
                }
            });
        }
    });
    const checkShow = (name: string, s: ShowIf | undefined, selfId: string) => {
        if (!s) return;
        const p = cfg.fields.find((f) => f.id === s.field);
        if (!p || p.id === selfId || p.type === "number") out.push(`${name}: the show-only-if rule points at a field that is missing or cannot be used.`);
        else if (!s.in.length) out.push(`${name}: the show-only-if rule needs at least one value.`);
        else if (p.type === "choice") {
            for (const v of s.in) if (typeof v !== "string" || !p.options.some((o) => o.label === v)) out.push(`${name}: the show-only-if rule names an option that does not exist in "${p.label}".`);
        } else if (s.in.some((v) => typeof v !== "boolean")) out.push(`${name}: the show-only-if rule on "${p.label}" must be ticked or not ticked.`);
    };
    cfg.fields.forEach((f, i) => checkShow(f.label || `Field ${i + 1}`, f.showIf, f.id));
    if (cfg.plan) {
        const pl = cfg.plan;
        if (!pl.label) out.push("The plan needs a label.");
        if (pl.replaces && !cfg.fields.some((f) => f.id === pl.replaces && f.type === "choice")) out.push("The plan replaces a choice that does not exist.");
        checkShow("Plan", pl.showIf, "plan");
        pl.options.forEach((o, i) => {
            if (!o.label) out.push(`Plan option ${i + 1} needs a label.`);
            if (!(Number.isInteger(o.visitsPerYear) && o.visitsPerYear >= 1)) out.push(`Plan option ${o.label || i + 1}: visits per year must be a whole number of at least 1.`);
            checkPair(`Plan option ${o.label || i + 1}, visit price`, o.visit);
        });
        if (pl.options.some((o, i) => pl.options.findIndex((x) => x.label === o.label) !== i)) out.push("Two plan options have the same label.");
        if (pl.default && !pl.options.some((o) => o.label === pl.default)) out.push("The default plan option does not exist.");
    }
    cfg.result.advice.forEach((a, i) => {
        if (!Number.isFinite(a.over) || a.over < 0) out.push(`Advice line ${i + 1}: the amount must be zero or more.`);
        if (!a.text) out.push(`Advice line ${i + 1} needs text.`);
    });
    return out;
}

/** The inputs and the result of a config at its defaults: the markup a reader sees before any script runs. */
export function renderBuilder(raw: unknown): string {
    const cfg = normConfig(raw);
    const out = flowCalc(cfg, {});
    const S = out.st as Record<string, unknown>;
    const hid = (id: string) => (out.hidden[id] ? " hidden" : "");
    const body = cfg.fields
        .map((f) => {
            const id = esc(f.id);
            if (f.type === "number") {
                const un = f.unit ? ` <span class="el-un">(${esc(f.unit)})</span>` : "";
                const attrs = [Number.isFinite(f.min) ? ` min="${f.min}"` : "", Number.isFinite(f.max) ? ` max="${f.max}"` : "", f.step > 0 ? ` step="${f.step}"` : ""].join("");
                return `<div data-f="${id}" data-t="n"${hid(f.id)}><label>${esc(f.label)}${un}<input type="number"${attrs} inputmode="decimal" value="${Number(S[f.id]) || 0}"></label></div>`;
            }
            if (f.type === "addon")
                return `<div class="full" data-f="${id}" data-t="x"${hid(f.id)}><label class="el-chk"><input type="checkbox"${S[f.id] ? " checked" : ""}>${esc(f.label)}</label></div>`;
            const tip = (o: CalcOption) => (o.est ? ` title="Estimate: check before relying on it."` : "");
            if (f.display === "select")
                return `<div data-f="${id}" data-t="s"${hid(f.id)}><label>${esc(f.label)}<select>${f.options.map((o) => `<option value="${esc(o.label)}"${tip(o)}${S[f.id] === o.label ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label></div>`;
            return (
                `<div class="full" data-f="${id}" data-t="b"${hid(f.id)}><span class="el-lb">${esc(f.label)}</span><div class="el-opts" role="group" aria-label="${esc(f.label)}">` +
                f.options.map((o) => `<button type="button" data-v="${esc(o.label)}" aria-pressed="${S[f.id] === o.label}"${tip(o)}>${esc(o.label)}</button>`).join("") +
                "</div></div>"
            );
        })
        .join("");
    const plan = cfg.plan
        ? `<div class="full" data-f="plan" data-t="s"${hid("plan")}><label>${esc(cfg.plan.label || "Plan")}<select>${cfg.plan.options.map((o) => `<option value="${esc(o.label)}"${o.est ? ` title="Estimate: check before relying on it."` : ""}${S.plan === o.label ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label></div>`
        : "";
    return (
        `<div class="el-calc" data-preset="builder" data-config="${esc(safeJson(cfg))}"><div class="el-card">` +
        `${cfg.title ? `<p class="el-title">${esc(cfg.title)}</p>` : ""}${cfg.intro ? `<p class="el-intro">${esc(cfg.intro)}</p>` : ""}` +
        `<div class="el-cf">${body}${plan}</div><div class="el-res" aria-live="polite">${out.html}</div><p class="el-fine">Estimate only. Actual costs vary.</p></div></div>`
    );
}
