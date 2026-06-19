"use client";

/**
 * Schema-driven field editor for the content editor. Renders one input per field
 * of the entry's content type — including nested and repeatable **components** —
 * so structured content (a service page, a landing page) is editable instead of
 * hiding in an invisible data blob. The rich-text "body" field is handled by the
 * TipTap canvas, the "Slug" field by the editor's dedicated slug input, and the
 * "title" field by the editor's title input; those three are skipped here.
 */

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Icon from "@/components/ui/Icon";
import Switch from "@/components/ui/Switch";
import { MediaField } from "@/components/ui/MediaPicker";
import RichTextField from "./RichTextField";
import { fieldLabel, type SchemaField } from "@/mocks/schema";

type Json = Record<string, unknown>;

const INPUT = "flow-input";

/** Strip tags/whitespace from rich-text HTML so it can preview on a collapsed header. */
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** A short, human preview of a component item's content — the first non-empty
 *  text-ish field — shown next to the title when a section is collapsed so authors
 *  can tell rows apart without expanding them. */
const itemSummary = (fields: SchemaField[], data: Json): string => {
    for (const f of fields) {
        if (f.type !== "Text" && f.type !== "URL" && f.type !== "Rich text") continue;
        const v = data[f.name];
        if (typeof v !== "string" || !v.trim()) continue;
        const text = f.type === "Rich text" ? stripHtml(v) : v.trim();
        if (text) return text.length > 90 ? `${text.slice(0, 90)}…` : text;
    }
    return "";
};

/** Alternating surface tint by nesting depth so stacked components stay legible
 *  instead of blurring into one another. */
const cardTint = (depth: number) =>
    depth % 2 === 0
        ? "bg-lavender-mist/30 dark:bg-dark-3/30"
        : "bg-white/70 dark:bg-dark-2/40";

/**
 * A collapsible component card: a clickable header (chevron + title + optional
 * collapsed-state preview) over an animated body. Used for every section and
 * nested section so deep structured content can be folded away while editing.
 */
const CollapsibleCard = ({
    title,
    index,
    preview,
    depth,
    open,
    onToggle,
    onRemove,
    removeLabel,
    children,
}: {
    title: string;
    index?: number;
    preview?: string;
    depth: number;
    open: boolean;
    onToggle: () => void;
    onRemove?: () => void;
    removeLabel?: string;
    children: ReactNode;
}) => {
    const reduce = useReducedMotion();
    return (
        <div className={`overflow-hidden rounded-2xl border border-grey-light dark:border-grey-light/10 ${cardTint(depth)}`}>
            <div className="flex items-center gap-1 pr-2">
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={open}
                    className="group flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left"
                >
                    <Icon
                        name="arrow-down"
                        className={`h-4 w-4 shrink-0 fill-grey transition-transform duration-200 group-hover:fill-primary ${open ? "rotate-0" : "-rotate-90"}`}
                    />
                    <span className="shrink-0 text-caption-1 font-semibold text-dark-1 dark:text-white">
                        {title}
                        {typeof index === "number" && <span className="ml-1 font-normal text-grey/60">#{index + 1}</span>}
                    </span>
                    {!open && preview && (
                        <span className="min-w-0 truncate text-caption-2 font-normal text-grey/70">— {preview}</span>
                    )}
                </button>
                {onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label={removeLabel}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-grey transition-colors hover:bg-error/10 hover:text-error"
                    >
                        <Icon className="h-4 w-4 fill-current" name="trash" />
                    </button>
                )}
            </div>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={reduce ? { duration: 0 } : { duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-grey-light/60 p-3 dark:border-grey-light/10">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const FieldControl = ({
    field,
    value,
    onChange,
    errors = {},
    errorPath = "",
    depth = 0,
}: {
    field: SchemaField;
    value: unknown;
    onChange: (v: unknown) => void;
    /** Field-keyed validation errors, threaded to nested component fields. */
    errors?: FieldErrors;
    /** This field's error path, used as the prefix for nested component fields. */
    errorPath?: string;
    /** Nesting depth, used to tint stacked component cards distinctly. */
    depth?: number;
}) => {
    switch (field.type) {
        case "Number":
            return (
                <input
                    type="number"
                    className={INPUT}
                    value={value === null || value === undefined ? "" : String(value)}
                    onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
                />
            );
        case "Boolean":
            return <Switch checked={!!value} onChange={onChange} aria-label={field.name} />;
        case "Date":
            return (
                <input
                    type="date"
                    className={INPUT}
                    value={typeof value === "string" ? value.slice(0, 10) : ""}
                    onChange={(e) => onChange(e.target.value)}
                />
            );
        case "Rich text":
            return (
                <RichTextField
                    value={typeof value === "string" ? value : ""}
                    onChange={onChange}
                    minH="8rem"
                />
            );
        case "Media":
            return <MediaField value={value} alt={fieldLabel(field)} onChange={onChange} />;
        case "Component":
            return <ComponentControl field={field} value={value} onChange={onChange} errors={errors} errorPath={errorPath} depth={depth} />;
        default:
            // Text / URL / Reference / Slug (when nested)
            return (
                <input
                    className={INPUT}
                    value={typeof value === "string" ? value : value === null || value === undefined ? "" : String(value)}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.type === "URL" ? "/path or https://…" : undefined}
                />
            );
    }
};

/** Field-keyed validation errors (path -> message), as returned by the API's
 *  validateEntryData. Keys are field paths (e.g. "SEO.Meta title"); we look up the
 *  message for a field by its path within the current group. */
export type FieldErrors = Record<string, string>;

/** A group of labelled fields editing a single object. `errorPrefix` mirrors the
 *  backend's path building so nested-component errors land under the right field. */
const FieldGroup = ({
    fields,
    data,
    onChange,
    errors = {},
    errorPrefix = "",
    depth = 0,
}: {
    fields: SchemaField[];
    data: Json;
    onChange: (next: Json) => void;
    errors?: FieldErrors;
    errorPrefix?: string;
    depth?: number;
}) => {
    const set = (name: string, v: unknown) => onChange({ ...data, [name]: v });
    return (
        <div className="flex min-w-0 flex-col gap-4">
            {fields.map((f) => {
                // Media, Rich text and Component render interactive content (picker
                // buttons, the TipTap editor, nested labelled fields); wrapping those
                // in a <label> nests labels / steals focus, so use a plain <div>.
                const Wrap = f.type === "Media" || f.type === "Rich text" || f.type === "Component" ? "div" : "label";
                const path = errorPrefix ? `${errorPrefix}.${f.name}` : f.name;
                const error = errors[path];
                return (
                    <Wrap key={f.id} className="flex min-w-0 flex-col gap-1.5">
                        <span className="flex items-center gap-1.5 text-caption-1 text-grey">
                            {fieldLabel(f)}
                            {f.required && <span className="text-error">*</span>}
                            {f.type === "Component" && (
                                <span className="text-caption-2 text-grey/70">
                                    {f.repeatable ? "repeatable component" : "component"}
                                </span>
                            )}
                        </span>
                        {f.description && <span className="-mt-0.5 text-caption-2 text-grey/80">{f.description}</span>}
                        <FieldControl field={f} value={data[f.name]} onChange={(v) => set(f.name, v)} errors={errors} errorPath={path} depth={depth} />
                        {error && <span className="text-caption-2 text-error">{error}</span>}
                    </Wrap>
                );
            })}
        </div>
    );
};

/** A repeatable list of component items, each a foldable card with a content
 *  preview when collapsed and a list-wide expand/collapse-all toggle. */
const RepeatableComponent = ({
    field,
    value,
    onChange,
    errors,
    errorPath,
    depth,
}: {
    field: SchemaField;
    value: unknown;
    onChange: (v: unknown) => void;
    errors: FieldErrors;
    errorPath: string;
    depth: number;
}) => {
    const sub = field.fields ?? [];
    const items: Json[] = Array.isArray(value) ? (value as Json[]) : [];
    // Collapsed rows are tracked by index; on removal we shift indices above the
    // gap down by one so the right rows stay folded after a delete.
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

    const replace = (i: number, next: Json) => onChange(items.map((x, j) => (j === i ? next : x)));
    const add = () => onChange([...items, {}]);
    const remove = (i: number) => {
        onChange(items.filter((_, j) => j !== i));
        setCollapsed((prev) => {
            const next = new Set<number>();
            prev.forEach((c) => {
                if (c < i) next.add(c);
                else if (c > i) next.add(c - 1);
            });
            return next;
        });
    };
    const toggle = (i: number) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });

    const allCollapsed = items.length > 0 && collapsed.size === items.length;
    const toggleAll = () =>
        setCollapsed(allCollapsed ? new Set() : new Set(items.map((_, i) => i)));

    return (
        <div className="flex flex-col gap-3">
            {items.length > 1 && (
                <div className="flex items-center justify-between px-0.5">
                    <span className="text-caption-2 text-grey/70">{items.length} items</span>
                    <button
                        type="button"
                        onClick={toggleAll}
                        className="text-caption-2 font-medium text-primary transition-colors hover:text-primary/80 dark:text-lilac"
                    >
                        {allCollapsed ? "Expand all" : "Collapse all"}
                    </button>
                </div>
            )}
            {items.map((it, i) => (
                <CollapsibleCard
                    key={i}
                    title={fieldLabel(field)}
                    index={i}
                    preview={itemSummary(sub, it)}
                    depth={depth}
                    open={!collapsed.has(i)}
                    onToggle={() => toggle(i)}
                    onRemove={() => remove(i)}
                    removeLabel={`Remove ${field.name} ${i + 1}`}
                >
                    <FieldGroup
                        fields={sub}
                        data={it}
                        onChange={(next) => replace(i, next)}
                        errors={errors}
                        errorPrefix={errorPath ? `${errorPath}[${i}]` : ""}
                        depth={depth + 1}
                    />
                </CollapsibleCard>
            ))}
            <button type="button" onClick={add} className="btn-secondary h-9 self-start px-3.5 text-caption-1">
                <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="plus" />
                Add {fieldLabel(field)}
            </button>
        </div>
    );
};

/** A component field: a nested object, or a repeatable list of objects. */
const ComponentControl = ({
    field,
    value,
    onChange,
    errors = {},
    errorPath = "",
    depth = 0,
}: {
    field: SchemaField;
    value: unknown;
    onChange: (v: unknown) => void;
    errors?: FieldErrors;
    errorPath?: string;
    depth?: number;
}) => {
    const sub = field.fields ?? [];

    if (field.repeatable) {
        return (
            <RepeatableComponent
                field={field}
                value={value}
                onChange={onChange}
                errors={errors}
                errorPath={errorPath}
                depth={depth}
            />
        );
    }

    const obj: Json = value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
    return (
        <SingleComponent field={field} obj={obj} sub={sub} onChange={onChange} errors={errors} errorPath={errorPath} depth={depth} />
    );
};

/** A single (non-repeatable) nested component, foldable like a repeatable item. */
const SingleComponent = ({
    field,
    obj,
    sub,
    onChange,
    errors,
    errorPath,
    depth,
}: {
    field: SchemaField;
    obj: Json;
    sub: SchemaField[];
    onChange: (v: unknown) => void;
    errors: FieldErrors;
    errorPath: string;
    depth: number;
}) => {
    const [open, setOpen] = useState(true);
    return (
        <CollapsibleCard
            title={fieldLabel(field)}
            preview={itemSummary(sub, obj)}
            depth={depth}
            open={open}
            onToggle={() => setOpen((v) => !v)}
        >
            <FieldGroup fields={sub} data={obj} onChange={onChange} errors={errors} errorPrefix={errorPath} depth={depth + 1} />
        </CollapsibleCard>
    );
};

/**
 * Top-level form for an entry's fields. Skips fields the editor handles elsewhere:
 * the rich-text body (TipTap canvas), the Slug (dedicated input) and the Title.
 */
const FieldsForm = ({
    fields,
    data,
    onChange,
    errors = {},
}: {
    fields: SchemaField[];
    data: Json;
    onChange: (next: Json) => void;
    /** Optional field-keyed validation errors (path -> message) from the API. Each
     *  message renders in red under its field. Defaults to none. */
    errors?: FieldErrors;
}) => {
    const shown = fields.filter(
        (f) => f.type !== "Rich text" && f.type !== "Slug" && f.name.trim().toLowerCase() !== "title",
    );
    if (!shown.length) return null;
    return <FieldGroup fields={shown} data={data} onChange={onChange} errors={errors} />;
};

export default FieldsForm;
