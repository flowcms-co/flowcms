"use client";

import { useState, type ReactNode } from "react";
import {
    MAX_ADVICE,
    MAX_FIELDS,
    MAX_OPTIONS,
    MAX_PLAN_OPTIONS,
    normConfig,
    pruneConfig,
    type AddonField,
    type BuilderConfig,
    type CalcField,
    type CalcOption,
    type CalcPlan,
    type ChoiceField,
    type NumberField,
    type Pair,
    type ShowIf,
} from "@flowcms/shared/elements";

const label = "mb-1 block text-caption-2 font-semibold text-black dark:text-white";
const card = "rounded-xl border border-grey-light p-3 dark:border-grey-light/15";
const small = "inline-flex h-8 items-center rounded-lg px-2.5 text-caption-2 font-semibold text-grey transition-colors hover:bg-lavender-mist hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-grey dark:hover:bg-dark-3";
const danger = "inline-flex h-8 items-center rounded-lg px-2.5 text-caption-2 font-semibold text-grey transition-colors hover:bg-lavender-mist hover:text-error dark:hover:bg-dark-3";
const heading = "text-caption-1 font-semibold text-black dark:text-white";

const Est = () => (
    <span title="An estimate: check it before relying on it." className="ml-1.5 rounded bg-warning/15 px-1.5 py-0.5 text-caption-2 font-semibold text-black dark:text-white">
        est.
    </span>
);

/** A number box. Uncontrolled on purpose, so "1." and "-" can be typed on the way to a number. */
const NumInput = ({ value, onChange, name }: { value: number; onChange: (n: number) => void; name: string }) => (
    <input
        className="flow-input"
        type="number"
        step="any"
        inputMode="decimal"
        aria-label={name}
        defaultValue={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
        }}
    />
);

const Check = ({ text, checked, onChange }: { text: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-2 text-caption-1 text-black dark:text-white">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {text}
    </label>
);

const Text = ({ name, value, onChange, hint }: { name: string; value: string; onChange: (v: string) => void; hint?: string }) => (
    <label className="block">
        <span className={label}>{name}</span>
        <input className="flow-input" value={value} onChange={(e) => onChange(e.target.value)} />
        {hint && <span className="mt-1 block text-caption-2 text-grey">{hint}</span>}
    </label>
);

const Choose = ({ name, value, options, onChange }: { name: string; value: string; options: [string, string][]; onChange: (v: string) => void }) => (
    <label className="block">
        <span className={label}>{name}</span>
        <select className="flow-input" value={value} onChange={(e) => onChange(e.target.value)}>
            {options.map(([v, t]) => (
                <option key={v} value={v}>
                    {t}
                </option>
            ))}
        </select>
    </label>
);

/** A low and a high amount side by side. */
const PairInput = ({ name, value, onChange }: { name: string; value: Pair; onChange: (p: Pair) => void }) => (
    <div className="grid grid-cols-2 gap-2">
        <label className="block">
            <span className="mb-0.5 block text-caption-2 text-grey">{name}, low</span>
            <NumInput name={`${name}, low`} value={value.low} onChange={(low) => onChange({ ...value, low })} />
        </label>
        <label className="block">
            <span className="mb-0.5 block text-caption-2 text-grey">{name}, high</span>
            <NumInput name={`${name}, high`} value={value.high} onChange={(high) => onChange({ ...value, high })} />
        </label>
    </div>
);

/** A pair that may be absent: a button to add it, a Remove once it is there. */
const OptPair = ({ name, value, start, onChange }: { name: string; value: Pair | undefined; start: Pair; onChange: (p: Pair | undefined) => void }) =>
    value ? (
        <div>
            <div className="mb-0.5 flex items-center justify-between">
                <span className="text-caption-2 font-semibold text-grey">{name}</span>
                <button type="button" onClick={() => onChange(undefined)} className={danger}>
                    Remove {name.toLowerCase()}
                </button>
            </div>
            <PairInput name={name} value={value} onChange={onChange} />
        </div>
    ) : (
        <button type="button" onClick={() => onChange(start)} className={`${small} justify-self-start border border-dashed border-grey-light dark:border-grey-light/15`}>
            Add {name.toLowerCase()}
        </button>
    );

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="flex flex-col gap-3">
        <h3 className={heading}>{title}</h3>
        {children}
    </section>
);

/** Does `f` show only when `id` shows, directly or further up the chain? Used to stop loops in show-if. */
const dependsOn = (cfg: BuilderConfig, f: CalcField, id: string): boolean => {
    for (let cur: CalcField | undefined = f, n = 0; cur?.showIf && n < 50; n++) {
        if (cur.showIf.field === id) return true;
        cur = cfg.fields.find((x) => x.id === cur!.showIf!.field);
    }
    return false;
};

/** Show only if: pick a choice (then its options) or an extra (then ticked or not ticked). */
const ShowIfEditor = ({ cfg, selfId, self, value, onChange }: { cfg: BuilderConfig; selfId: string; self?: CalcField; value: ShowIf | undefined; onChange: (s: ShowIf | undefined) => void }) => {
    const parents = cfg.fields.filter((p) => p.id !== selfId && p.type !== "number" && !(self && dependsOn(cfg, p, selfId)));
    const parent = value ? cfg.fields.find((p) => p.id === value.field) : undefined;
    const pick = (id: string) => {
        const p = cfg.fields.find((x) => x.id === id);
        if (!p) return onChange(undefined);
        onChange({ field: id, in: p.type === "choice" ? (p.options[0] ? [p.options[0].label] : []) : [true] });
    };
    return (
        <div className="grid gap-2">
            <Choose
                name="Show only if"
                value={value?.field ?? ""}
                options={[["", "Always shown"], ...parents.map((p): [string, string] => [p.id, `${p.type === "addon" ? "Extra" : "Choice"}: ${p.label || p.id}`])]}
                onChange={pick}
            />
            {value && parent?.type === "choice" && (
                <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                    <legend className="mb-0.5 text-caption-2 text-grey">is one of</legend>
                    {parent.options.map((o) => (
                        <Check key={o.label} text={o.label || "(no label)"} checked={value.in.includes(o.label)} onChange={(on) => onChange({ ...value, in: on ? [...value.in, o.label] : value.in.filter((x) => x !== o.label) })} />
                    ))}
                </fieldset>
            )}
            {value && parent?.type === "addon" && (
                <Choose name="is" value={value.in[0] === false ? "no" : "yes"} options={[["yes", "Ticked"], ["no", "Not ticked"]]} onChange={(v) => onChange({ ...value, in: [v === "yes"] })} />
            )}
        </div>
    );
};

const nextId = (cfg: BuilderConfig, prefix: string): string => {
    const used = new Set(cfg.fields.map((f) => f.id));
    let i = 1;
    while (used.has(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
};

/**
 * The editor for a calculator builder config: fields, options, extras, show-if rules, plan and result.
 * Controlled: every change hands a whole new config up. The live preview is the drawer's own preview,
 * which runs the same compute as the published page.
 */
const CalculatorBuilderEditor = ({ value, onChange }: { value: unknown; onChange: (c: BuilderConfig) => void }) => {
    // Read once. Re-reading on every change would trim a space the moment it is typed.
    const [cfg, setCfg] = useState(() => normConfig(value));
    const edit = (fn: (c: BuilderConfig) => void, prune = false) => {
        const next = structuredClone(cfg);
        fn(next);
        const out = prune ? pruneConfig(next) : next;
        setCfg(out);
        onChange(out);
    };
    const numbers = cfg.fields.filter((f): f is NumberField => f.type === "number");
    const choices = cfg.fields.filter((f): f is ChoiceField => f.type === "choice");

    const move = (i: number, d: number) => edit((c) => {
        const j = i + d;
        if (j >= 0 && j < c.fields.length) [c.fields[i], c.fields[j]] = [c.fields[j], c.fields[i]];
    });
    const add = (f: CalcField) => edit((c) => void c.fields.push(f));

    const fieldBody = (f: CalcField, i: number) => {
        const set = (fn: (x: never) => void, prune = false) => edit((c) => fn(c.fields[i] as never), prune);
        const body: ReactNode[] = [<Text key="label" name="Label" value={f.label} onChange={(v) => set((x: CalcField) => void (x.label = v))} />];
        if (f.type === "number") {
            const s = (fn: (x: NumberField) => void) => set(fn as (x: never) => void);
            body.push(
                <div key="num" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Text name="Unit" value={f.unit} onChange={(v) => s((x) => void (x.unit = v))} />
                    {(["min", "max", "step", "default"] as const).map((k) => (
                        <label key={k} className="block">
                            <span className={label}>{k[0].toUpperCase() + k.slice(1)}</span>
                            <NumInput name={k} value={f[k]} onChange={(n) => s((x) => void (x[k] = n))} />
                        </label>
                    ))}
                </div>,
                <PairInput key="rate" name="Rate per unit" value={f.rate} onChange={(p) => s((x) => void (x.rate = p))} />,
            );
        } else if (f.type === "addon") {
            const s = (fn: (x: AddonField) => void) => set(fn as (x: never) => void);
            body.push(
                <Check key="def" text="Ticked by default" checked={f.default} onChange={(v) => s((x) => void (x.default = v))} />,
                <Choose
                    key="mode"
                    name="Priced"
                    value={f.per ? "per" : "flat"}
                    options={[["flat", "Flat amount"], ["per", "Per unit of a number field"]]}
                    onChange={(v) =>
                        s((x) => {
                            if (v === "per") {
                                x.per = { field: numbers[0]?.id ?? "", rate: x.add ?? { low: 0, high: 0 } };
                                delete x.add;
                            } else {
                                x.add = x.per?.rate ?? { low: 0, high: 0 };
                                delete x.per;
                            }
                        })
                    }
                />,
                f.per ? (
                    <div key="per" className="grid gap-2">
                        <Choose name="Per unit of" value={f.per.field} options={[["", "Pick a number field"], ...numbers.map((n): [string, string] => [n.id, n.label || n.id])]} onChange={(v) => s((x) => void (x.per!.field = v))} />
                        <PairInput name="Rate per unit" value={f.per.rate} onChange={(p) => s((x) => void (x.per!.rate = p))} />
                    </div>
                ) : (
                    <PairInput key="add" name="Amount" value={f.add ?? { low: 0, high: 0 }} onChange={(p) => s((x) => void (x.add = p))} />
                ),
            );
        } else {
            const s = (fn: (x: ChoiceField) => void, prune = false) => set(fn as (x: never) => void, prune);
            body.push(
                <div key="disp" className="grid grid-cols-2 gap-2">
                    <Choose name="Shown as" value={f.display} options={[["buttons", "Buttons"], ["select", "Dropdown"]]} onChange={(v) => s((x) => void (x.display = v as "buttons" | "select"))} />
                    <Choose name="Default option" value={f.default || f.options[0]?.label || ""} options={f.options.map((o): [string, string] => [o.label, o.label || "(no label)"])} onChange={(v) => s((x) => void (x.default = v))} />
                </div>,
                ...f.options.map((o, oi) => {
                    const so = (fn: (x: CalcOption) => void, prune = false) => s((x) => fn(x.options[oi]), prune);
                    return (
                        <div key={`${oi}-${f.options.length}`} className={card}>
                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-caption-2 font-semibold text-grey">
                                    Option {oi + 1}
                                    {o.est && <Est />}
                                </span>
                                <button type="button" disabled={f.options.length <= 1} onClick={() => s((x) => void x.options.splice(oi, 1), true)} className={danger}>
                                    Remove option
                                </button>
                            </div>
                            <div className="grid gap-3">
                                <Text
                                    name="Option label"
                                    value={o.label}
                                    onChange={(v) =>
                                        edit((c) => {
                                            const fld = c.fields[i] as ChoiceField;
                                            const old = fld.options[oi].label;
                                            fld.options[oi].label = v;
                                            if (fld.default === old) fld.default = v;
                                            // Show-if rules that name this option follow the rename.
                                            for (const g of [...c.fields, ...(c.plan ? [c.plan] : [])]) if (g.showIf?.field === fld.id) g.showIf.in = g.showIf.in.map((x) => (x === old ? v : x));
                                        })
                                    }
                                />
                                <div className="flex flex-wrap gap-x-5 gap-y-1">
                                    <Check text="Estimate (shows an est. mark)" checked={!!o.est} onChange={(v) => so((x) => void (v ? (x.est = true) : delete x.est))} />
                                    <Check text="Ask for a quote (no price)" checked={!!o.quote} onChange={(v) => so((x) => void (v ? (x.quote = true) : delete x.quote))} />
                                </div>
                                <OptPair name="Amount added" value={o.add} start={{ low: 0, high: 0 }} onChange={(p) => so((x) => void (p ? (x.add = p) : delete x.add))} />
                                <OptPair name="Multiplier" value={o.times} start={{ low: 1, high: 1 }} onChange={(p) => so((x) => void (p ? (x.times = p) : delete x.times))} />
                                <OptPair name="Minimum" value={o.minimum} start={{ low: 0, high: 0 }} onChange={(p) => so((x) => void (p ? (x.minimum = p) : delete x.minimum))} />
                                {numbers.map((n) => (
                                    <OptPair
                                        key={n.id}
                                        name={`Rate for ${n.label || n.id}`}
                                        value={o.rates?.[n.id]}
                                        start={{ ...n.rate }}
                                        onChange={(p) =>
                                            so((x) => {
                                                const r = { ...(x.rates ?? {}) };
                                                if (p) r[n.id] = p;
                                                else delete r[n.id];
                                                if (Object.keys(r).length) x.rates = r;
                                                else delete x.rates;
                                            })
                                        }
                                    />
                                ))}
                                <Text name="Note shown when picked" value={o.note ?? ""} onChange={(v) => so((x) => void (v ? (x.note = v) : delete x.note))} />
                            </div>
                        </div>
                    );
                }),
                <button key="addopt" type="button" disabled={f.options.length >= MAX_OPTIONS} onClick={() => s((x) => void x.options.push({ label: `Option ${x.options.length + 1}` }))} className="btn-secondary h-9 justify-self-start">
                    Add option
                </button>,
            );
        }
        body.push(
            <ShowIfEditor key="show" cfg={cfg} selfId={f.id} self={f} value={f.showIf} onChange={(v) => set((x: CalcField) => void (v ? (x.showIf = v) : delete x.showIf))} />,
            <div key="act" className="flex flex-wrap gap-1 border-t border-grey-light pt-2 dark:border-grey-light/15">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className={small}>
                    Move up
                </button>
                <button type="button" disabled={i === cfg.fields.length - 1} onClick={() => move(i, 1)} className={small}>
                    Move down
                </button>
                <button type="button" onClick={() => edit((c) => void c.fields.splice(i, 1), true)} className={danger}>
                    Remove field
                </button>
            </div>,
        );
        return body;
    };

    const kind = (f: CalcField) => (f.type === "number" ? "Number" : f.type === "choice" ? "Choice" : "Extra");
    const plan = cfg.plan;
    const setPlan = (fn: (p: CalcPlan) => void, prune = false) => edit((c) => c.plan && fn(c.plan), prune);

    return (
        <div className="flex flex-col gap-6">
            <Section title="Text">
                <Text name="Title" value={cfg.title} onChange={(v) => edit((c) => void (c.title = v))} />
                <Text name="Intro (optional)" value={cfg.intro} onChange={(v) => edit((c) => void (c.intro = v))} />
                <Text name="Currency symbol" value={cfg.currency} onChange={(v) => edit((c) => void (c.currency = v))} />
            </Section>

            <Section title="Base amount and minimum">
                <p className="text-caption-2 text-grey">Every amount is a low and a high, so the result is always a range. Use the same number twice for a fixed price.</p>
                <PairInput name="Base amount" value={cfg.base} onChange={(p) => edit((c) => void (c.base = p))} />
                <PairInput name="Minimum" value={cfg.minimum} onChange={(p) => edit((c) => void (c.minimum = p))} />
            </Section>

            <Section title={`Fields (${cfg.fields.length})`}>
                {cfg.fields.map((f, i) => (
                    <details key={f.id || i} className={card} open={i === 0}>
                        <summary className="cursor-pointer text-caption-1 font-semibold text-black dark:text-white">
                            <span className="mr-2 text-caption-2 font-semibold uppercase text-grey">{kind(f)}</span>
                            {f.label || "(no label)"}
                            {f.type === "choice" && f.options.some((o) => o.est) && <Est />}
                            {f.showIf && <span className="ml-2 text-caption-2 font-normal text-grey">conditional</span>}
                        </summary>
                        <div className="mt-3 grid gap-3">{fieldBody(f, i)}</div>
                    </details>
                ))}
                <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={cfg.fields.length >= MAX_FIELDS} className="btn-secondary h-9" onClick={() => add({ id: nextId(cfg, "n"), type: "number", label: "New number", unit: "units", min: 0, max: 100, step: 1, default: 1, rate: { low: 0, high: 0 } })}>
                        Add number field
                    </button>
                    <button type="button" disabled={cfg.fields.length >= MAX_FIELDS} className="btn-secondary h-9" onClick={() => add({ id: nextId(cfg, "c"), type: "choice", label: "New choice", display: "buttons", default: "Option A", options: [{ label: "Option A" }, { label: "Option B" }] })}>
                        Add choice field
                    </button>
                    <button type="button" disabled={cfg.fields.length >= MAX_FIELDS} className="btn-secondary h-9" onClick={() => add({ id: nextId(cfg, "x"), type: "addon", label: "New extra", default: false, add: { low: 0, high: 0 } })}>
                        Add extra
                    </button>
                </div>
            </Section>

            <Section title="Plan (visits per year)">
                {!plan ? (
                    <button type="button" className="btn-secondary h-9 justify-self-start" onClick={() => edit((c) => void (c.plan = { label: "Plan", default: "One-time", options: [{ label: "One-time", visitsPerYear: 1 }] }))}>
                        Add a plan
                    </button>
                ) : (
                    <div className={`${card} grid gap-3`}>
                        <Text name="Plan label" value={plan.label} onChange={(v) => setPlan((p) => void (p.label = v))} />
                        <Choose
                            name="The visit price replaces the amount of"
                            value={plan.replaces ?? ""}
                            options={[["", "Everything: the visit price is the whole amount"], ...choices.map((c): [string, string] => [c.id, c.label || c.id])]}
                            onChange={(v) => setPlan((p) => void (v ? (p.replaces = v) : delete p.replaces))}
                        />
                        <Text name="Note shown with a visit price (optional)" value={plan.note ?? ""} onChange={(v) => setPlan((p) => void (v ? (p.note = v) : delete p.note))} />
                        <ShowIfEditor cfg={cfg} selfId="plan" value={plan.showIf} onChange={(v) => setPlan((p) => void (v ? (p.showIf = v) : delete p.showIf))} />
                        {plan.options.map((o, oi) => (
                            <div key={`${oi}-${plan.options.length}`} className={card}>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-caption-2 font-semibold text-grey">
                                        Plan option {oi + 1}
                                        {o.est && <Est />}
                                    </span>
                                    <button type="button" onClick={() => edit((c) => { c.plan!.options.splice(oi, 1); if (!c.plan!.options.length) delete c.plan; })} className={danger}>
                                        Remove plan option
                                    </button>
                                </div>
                                <div className="grid gap-3">
                                    <Text
                                        name="Plan option label"
                                        value={o.label}
                                        onChange={(v) =>
                                            setPlan((p) => {
                                                const old = p.options[oi].label;
                                                p.options[oi].label = v;
                                                if (p.default === old) p.default = v;
                                            })
                                        }
                                    />
                                    <label className="block">
                                        <span className={label}>Visits per year</span>
                                        <NumInput name="Visits per year" value={o.visitsPerYear} onChange={(n) => setPlan((p) => void (p.options[oi].visitsPerYear = n))} />
                                    </label>
                                    <Check text="Estimate (shows an est. mark)" checked={!!o.est} onChange={(v) => setPlan((p) => void (v ? (p.options[oi].est = true) : delete p.options[oi].est))} />
                                    <OptPair name="Price per visit" value={o.visit} start={{ low: 0, high: 0 }} onChange={(pr) => setPlan((p) => void (pr ? (p.options[oi].visit = pr) : delete p.options[oi].visit))} />
                                </div>
                            </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={plan.options.length >= MAX_PLAN_OPTIONS} className="btn-secondary h-9" onClick={() => setPlan((p) => void p.options.push({ label: `Plan ${p.options.length + 1}`, visitsPerYear: 2 }))}>
                                Add plan option
                            </button>
                            <button type="button" className={danger} onClick={() => edit((c) => void delete c.plan)}>
                                Remove plan
                            </button>
                        </div>
                    </div>
                )}
            </Section>

            <Section title="Result">
                <Text name="Result label" value={cfg.result.label} onChange={(v) => edit((c) => void (c.result.label = v))} />
                <Choose name="Unit" value={cfg.result.unit} options={[["total", "Total"], ["per visit", "Per visit"]]} onChange={(v) => edit((c) => void (c.result.unit = v as "total" | "per visit"))} />
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                    <Check text="Show the yearly line (needs a plan)" checked={cfg.result.showYearly} onChange={(v) => edit((c) => void (c.result.showYearly = v))} />
                    <Check text="Show how the price is worked out" checked={cfg.result.breakdown} onChange={(v) => edit((c) => void (c.result.breakdown = v))} />
                </div>
                <Text name="Note under the result (optional)" value={cfg.result.note} onChange={(v) => edit((c) => void (c.result.note = v))} />
                <Text name="Coverage line (optional)" value={cfg.result.coverage} onChange={(v) => edit((c) => void (c.result.coverage = v))} hint="For example what the estimate does and does not include." />
                <h4 className="text-caption-2 font-semibold text-grey">Advice lines</h4>
                {cfg.result.advice.map((a, i) => (
                    <div key={`${i}-${cfg.result.advice.length}`} className={`${card} grid gap-2`}>
                        <label className="block">
                            <span className={label}>When the high end is over</span>
                            <NumInput name="Advice amount" value={a.over} onChange={(n) => edit((c) => void (c.result.advice[i].over = n))} />
                        </label>
                        <Text name="Advice text" value={a.text} onChange={(v) => edit((c) => void (c.result.advice[i].text = v))} />
                        <button type="button" onClick={() => edit((c) => void c.result.advice.splice(i, 1))} className={`${danger} justify-self-start`}>
                            Remove advice line
                        </button>
                    </div>
                ))}
                <button type="button" disabled={cfg.result.advice.length >= MAX_ADVICE} className="btn-secondary h-9 justify-self-start" onClick={() => edit((c) => void c.result.advice.push({ over: 0, text: "" }))}>
                    Add advice line
                </button>
            </Section>
        </div>
    );
};

export default CalculatorBuilderEditor;
