"use client";

/**
 * Schema-driven field editor for the content editor. Renders one input per field
 * of the entry's content type — including nested and repeatable **components** —
 * so structured content (a service page, a landing page) is editable instead of
 * hiding in an invisible data blob. The rich-text "body" field is handled by the
 * TipTap canvas, the "Slug" field by the editor's dedicated slug input, and the
 * "title" field by the editor's title input; those three are skipped here.
 */

import Icon from "@/components/ui/Icon";
import Switch from "@/components/ui/Switch";
import { MediaField } from "@/components/ui/MediaPicker";
import RichTextField from "./RichTextField";
import { fieldLabel, type SchemaField } from "@/mocks/schema";

type Json = Record<string, unknown>;

const INPUT = "flow-input";

export const FieldControl = ({
    field,
    value,
    onChange,
    errors = {},
    errorPath = "",
}: {
    field: SchemaField;
    value: unknown;
    onChange: (v: unknown) => void;
    /** Field-keyed validation errors, threaded to nested component fields. */
    errors?: FieldErrors;
    /** This field's error path, used as the prefix for nested component fields. */
    errorPath?: string;
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
            return <ComponentControl field={field} value={value} onChange={onChange} errors={errors} errorPath={errorPath} />;
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
}: {
    fields: SchemaField[];
    data: Json;
    onChange: (next: Json) => void;
    errors?: FieldErrors;
    errorPrefix?: string;
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
                        <FieldControl field={f} value={data[f.name]} onChange={(v) => set(f.name, v)} errors={errors} errorPath={path} />
                        {error && <span className="text-caption-2 text-error">{error}</span>}
                    </Wrap>
                );
            })}
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
}: {
    field: SchemaField;
    value: unknown;
    onChange: (v: unknown) => void;
    errors?: FieldErrors;
    errorPath?: string;
}) => {
    const sub = field.fields ?? [];

    if (field.repeatable) {
        const items: Json[] = Array.isArray(value) ? (value as Json[]) : [];
        const replace = (i: number, next: Json) => onChange(items.map((x, j) => (j === i ? next : x)));
        const add = () => onChange([...items, {}]);
        const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
        return (
            <div className="flex flex-col gap-3">
                {items.map((it, i) => (
                    <div key={i} className="rounded-2xl border border-grey-light bg-lavender-mist/30 p-3 dark:border-grey-light/10 dark:bg-dark-3/30">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-caption-2 font-medium text-grey">
                                {fieldLabel(field)} #{i + 1}
                            </span>
                            <button
                                type="button"
                                onClick={() => remove(i)}
                                aria-label={`Remove ${field.name} ${i + 1}`}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-grey transition-colors hover:bg-error/10 hover:text-error"
                            >
                                <Icon className="h-4 w-4 fill-current" name="trash" />
                            </button>
                        </div>
                        <FieldGroup fields={sub} data={it} onChange={(next) => replace(i, next)} errors={errors} errorPrefix={errorPath ? `${errorPath}[${i}]` : ""} />
                    </div>
                ))}
                <button type="button" onClick={add} className="btn-secondary h-9 self-start px-3.5 text-caption-1">
                    <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="plus" />
                    Add {fieldLabel(field)}
                </button>
            </div>
        );
    }

    const obj: Json = value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
    return (
        <div className="rounded-2xl border border-grey-light bg-lavender-mist/30 p-3 dark:border-grey-light/10 dark:bg-dark-3/30">
            <FieldGroup fields={sub} data={obj} onChange={onChange} errors={errors} errorPrefix={errorPath} />
        </div>
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
