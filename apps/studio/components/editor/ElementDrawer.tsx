"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { flowBind, flowCalc, renderElement, type BuilderConfig, type ElementField, type ElementTemplate } from "@flowcms/shared/elements";
import Icon from "@/components/ui/Icon";
import { useElementStyles } from "@/lib/elements";
import CalculatorBuilderEditor from "./CalculatorBuilderEditor";

type Row = Record<string, string>;
type Values = Record<string, unknown>;

const label = "mb-1 block text-caption-2 font-semibold text-black dark:text-white";

/** The fill form for one element, with a live preview. Saves only when the person chooses to. */
const ElementDrawer = ({
    template,
    initial,
    editing,
    sandbox = false,
    onSave,
    onClose,
}: {
    template: ElementTemplate;
    initial: Values;
    editing: boolean;
    /** Try the fields only: nothing is inserted or saved. */
    sandbox?: boolean;
    onSave: (values: Values) => void;
    onClose: () => void;
}) => {
    useElementStyles();
    const [values, setValues] = useState<Values>(initial);
    const set = (key: string, v: unknown) => setValues((cur) => ({ ...cur, [key]: v }));
    const problems = useMemo(() => template.validate(values), [template, values]);
    const preview = useMemo(() => renderElement(template.id, values), [template.id, values]);
    // The calculator builder has its own editor (the generic fields only go one level deep).
    const builder = template.id === "calculator" && values.preset === "builder";
    const previewRef = useRef<HTMLDivElement>(null);
    // Make the builder preview live with the same compute the published page runs. A new preview is new markup, so it binds again.
    useEffect(() => {
        if (builder && previewRef.current) flowBind(previewRef.current, flowCalc);
    }, [builder, preview]);

    const field = (f: ElementField) => {
        if (f.type === "text" || f.type === "number") {
            const hint = f.hint ? <span className="mt-1 block text-caption-2 text-grey">{f.hint}</span> : null;
            const val = String(values[f.key] ?? "");
            return (
                <label key={f.key} className="block">
                    <span className={label}>{f.label}</span>
                    {f.type === "text" && f.long ? (
                        <textarea className="flow-input" rows={5} value={val} onChange={(e) => set(f.key, e.target.value)} />
                    ) : (
                        <input className="flow-input" type={f.type === "number" ? "number" : "text"} step={f.type === "number" ? "any" : undefined} inputMode={f.type === "number" ? "decimal" : undefined} value={val} onChange={(e) => set(f.key, e.target.value)} />
                    )}
                    {hint}
                </label>
            );
        }
        if (f.type === "choice")
            return (
                <fieldset key={f.key}>
                    <legend className={label}>{f.label}</legend>
                    <div className="flex gap-1.5">
                        {f.options.map((o) => (
                            <button
                                key={o.value}
                                type="button"
                                aria-pressed={values[f.key] === o.value}
                                onClick={() => set(f.key, o.value)}
                                className={`h-9 rounded-lg border px-4 text-caption-1 font-semibold transition-colors ${values[f.key] === o.value ? "border-primary bg-primary/10 text-primary dark:text-lilac" : "border-grey-light text-grey hover:border-primary dark:border-grey-light/15"}`}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                </fieldset>
            );
        const rows = (Array.isArray(values[f.key]) ? values[f.key] : []) as Row[];
        const setRow = (i: number, key: string, v: string) => set(f.key, rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
        return (
            <fieldset key={f.key}>
                <legend className={label}>
                    {f.label} ({rows.length} added, {f.min} to {f.max} allowed)
                </legend>
                <div className="flex flex-col gap-3">
                    {rows.map((r, i) => (
                        <div key={i} className="rounded-xl border border-grey-light p-3 dark:border-grey-light/15">
                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-caption-2 font-semibold text-grey">
                                    {f.itemLabel[0].toUpperCase() + f.itemLabel.slice(1)} {i + 1}
                                </span>
                                <button type="button" onClick={() => set(f.key, rows.filter((_, j) => j !== i))} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-caption-2 font-semibold text-grey transition-colors hover:bg-lavender-mist hover:text-error dark:hover:bg-dark-3">
                                    <Icon className="h-3.5 w-3.5 fill-current" name="trash" />
                                    Remove {f.itemLabel}
                                </button>
                            </div>
                            <div className="grid gap-2">
                                {f.columns.map((c) => (
                                    <label key={c.key} className="block">
                                        <span className="mb-0.5 block text-caption-2 text-grey">{c.label}</span>
                                        {c.long ? (
                                            <textarea className="flow-input" rows={2} value={r[c.key] ?? ""} onChange={(e) => setRow(i, c.key, e.target.value)} />
                                        ) : (
                                            <input className="flow-input" value={r[c.key] ?? ""} onChange={(e) => setRow(i, c.key, e.target.value)} />
                                        )}
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    disabled={rows.length >= f.max}
                    onClick={() => set(f.key, [...rows, Object.fromEntries(f.columns.map((c) => [c.key, ""]))])}
                    className="btn-secondary mt-3 h-9"
                >
                    Add {f.itemLabel}
                </button>
            </fieldset>
        );
    };

    return (
        <Transition appear show as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child as={Fragment} enter="ease-out duration-150" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>
                <div className="fixed inset-y-0 right-0 flex w-full max-w-[64rem]">
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="translate-x-8 opacity-0" enterTo="translate-x-0 opacity-100" leave="ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <Dialog.Panel className="flex h-full w-full flex-col bg-white shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                            <div className="flex items-center justify-between border-b border-grey-light px-6 py-4 dark:border-grey-light/15">
                                <div>
                                    <Dialog.Title className="text-h6 text-black dark:text-white">
                                        {sandbox ? "Try" : editing ? "Edit" : "Insert"} {template.name}
                                    </Dialog.Title>
                                    <p className="text-caption-2 text-grey">{template.description}</p>
                                </div>
                                <button type="button" onClick={onClose} aria-label="Close" className="btn-circle h-9 w-9 dark:bg-dark-3">
                                    <Icon className="h-4 w-4 fill-grey" name="close" />
                                </button>
                            </div>
                            <div className={`grid min-h-0 flex-1 gap-0 overflow-y-auto ${builder ? "md:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"} md:overflow-hidden`}>
                                <div className="flex flex-col gap-5 p-6 md:overflow-y-auto">
                                    {builder ? <CalculatorBuilderEditor value={values.config} onChange={(c: BuilderConfig) => set("config", c)} /> : template.fields.map(field)}
                                </div>
                                <div className="border-t border-grey-light bg-lavender-mist/40 p-6 dark:border-grey-light/15 dark:bg-dark-3/40 md:overflow-y-auto md:border-l md:border-t-0">
                                    <p className="mb-3 text-caption-2 font-semibold text-grey">Live preview</p>
                                    <div ref={previewRef} dangerouslySetInnerHTML={{ __html: preview }} />
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-grey-light px-6 py-4 dark:border-grey-light/15">
                                <p className="min-w-0 flex-1 text-caption-2 text-grey" aria-live="polite">
                                    {sandbox ? "Sandbox: nothing you type here is saved. " : ""}
                                    {problems.length ? `${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""} You can save it now, but it blocks publishing until fixed.` : "Ready to publish."}
                                </p>
                                <div className="flex gap-2">
                                    <button type="button" onClick={onClose} className="btn-secondary">
                                        {sandbox ? "Close" : "Cancel"}
                                    </button>
                                    {!sandbox && (
                                        <button type="button" onClick={() => onSave(values)} className="btn-primary">
                                            {editing ? "Save element" : "Insert element"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </Dialog.Panel>
                    </Transition.Child>
                </div>
            </Dialog>
        </Transition>
    );
};

export default ElementDrawer;
