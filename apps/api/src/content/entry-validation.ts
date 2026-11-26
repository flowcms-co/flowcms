import { BadRequestException } from "@nestjs/common";
import { blocking, checkContentRules, elementProblems, issueErrors, publishBlockedMessage, valueFor, type ContentRules, type RuleIssue } from "@flowcms/shared";

/** A field definition as authored in the Schema Builder (stored in ContentType.schema). */
export type SchemaField = {
    id?: string;
    name: string;
    /** The label and helper text the editor shows; the content rules quote them in messages. */
    label?: string;
    description?: string;
    type: string;
    required?: boolean;
    /** Component fields can repeat (a list) and nest their own fields (inline). */
    repeatable?: boolean;
    fields?: SchemaField[];
    /** Component field referencing a reusable component (ContentType kind=COMPONENT) by apiId. */
    componentApiId?: string;
    /** DynamicZone: the component apiIds allowed in this ordered list of sections. */
    allowedComponents?: string[];
    /** Reference (relation) field: the id of the content type this points at. The
     *  entry stores the referenced entry id(s); the delivery API expands them. */
    referencedTypeId?: string;
    /** Polymorphic reference: content type ids this field may point at. When set, the
     *  relation can link any of these types; populated entries carry a `__type`. */
    referencedTypeIds?: string[];
    /** Reverse (mapped) side of a relation: the forward Reference field name on the
     *  owner type (`referencedTypeId`) that points back here. When set, this field is
     *  derived — never stored or validated — and the delivery API fills it by querying
     *  the join table for entries whose forward field links to this entry. */
    mappedByField?: string;
    /** Reference cardinality: false/undefined = one entry, true = many entries. */
    multiple?: boolean;
    /** Richer validation rules + custom messages. Length rules apply to text values;
     *  min/max to numbers; pattern is a regex source string. Only checked when a
     *  value is present (except required). */
    validation?: FieldValidation;
};

/** Per-field validation rules with optional custom messages. Mirrors the Schema
 *  Builder type in the studio (apps/studio/mocks/schema.ts). */
export type FieldValidation = {
    required?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    messages?: {
        required?: string;
        minLength?: string;
        maxLength?: string;
        min?: string;
        max?: string;
        pattern?: string;
        type?: string;
    };
};

/** Map of reusable-component apiId → its field defs (from kind=COMPONENT types). */
export type ComponentMap = Record<string, SchemaField[]>;

/** Type-check a present value. Lenient: only flags clearly-wrong types. A custom
 *  `validation.messages.type` overrides the default message. */
function typeError(field: SchemaField, value: unknown): string | null {
    const custom = field.validation?.messages?.type;
    switch (field.type) {
        case "Number":
            if (typeof value === "number") return null;
            if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return null;
            return custom ?? `“${field.name}” must be a number.`;
        case "Boolean":
            if (typeof value === "boolean") return null;
            if (value === "true" || value === "false") return null;
            return custom ?? `“${field.name}” must be true or false.`;
        case "Date":
            if (value instanceof Date) return null;
            if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return null;
            return custom ?? `“${field.name}” must be a valid date.`;
        case "URL":
            if (typeof value === "string" && /^https?:\/\/|^\//.test(value.trim())) return null;
            return custom ?? `“${field.name}” must be a URL.`;
        case "Reference":
            // A relation stores the referenced entry's id (single) or a list of ids
            // (multiple). The delivery API expands these into full entries.
            if (field.multiple) {
                if (Array.isArray(value) && value.every((x) => typeof x === "string")) return null;
                return custom ?? `“${field.name}” must be a list of references.`;
            }
            if (typeof value === "string") return null;
            return custom ?? `“${field.name}” must be a reference.`;
        default:
            return null; // Text / Rich text / Media / Component / Slug — accept as-is
    }
}

/** Enforce the richer validation rules (min/max length, min/max value, pattern)
 *  on a present value. Returns the first failing rule's message, or null. Custom
 *  messages from `validation.messages.*` win over the sensible defaults. */
function ruleError(field: SchemaField, value: unknown): string | null {
    const v = field.validation;
    if (!v) return null;
    const m = v.messages ?? {};

    // Length rules apply to string values (the common case for text fields).
    if (typeof value === "string") {
        const len = value.length;
        if (typeof v.minLength === "number" && len < v.minLength) {
            return m.minLength ?? `“${field.name}” must be at least ${v.minLength} characters.`;
        }
        if (typeof v.maxLength === "number" && len > v.maxLength) {
            return m.maxLength ?? `“${field.name}” must be at most ${v.maxLength} characters.`;
        }
        if (v.pattern) {
            try {
                if (!new RegExp(v.pattern).test(value)) {
                    return m.pattern ?? `“${field.name}” is not in the expected format.`;
                }
            } catch {
                // Invalid regex authored in the Schema Builder: skip rather than throw.
            }
        }
    }

    // Numeric min/max — accept numbers and numeric strings (matches typeError leniency).
    if (typeof v.min === "number" || typeof v.max === "number") {
        const num = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
        if (!Number.isNaN(num)) {
            if (typeof v.min === "number" && num < v.min) {
                return m.min ?? `“${field.name}” must be at least ${v.min}.`;
            }
            if (typeof v.max === "number" && num > v.max) {
                return m.max ?? `“${field.name}” must be at most ${v.max}.`;
            }
        }
    }

    return null;
}

/** The type's content rules: stored at `schema.contentRules`, read here so every caller passes them the same way. */
export function rulesOf(schema: unknown): ContentRules | null {
    const r = (schema as { contentRules?: unknown } | null)?.contentRules;
    return r && typeof r === "object" && !Array.isArray(r) && typeof (r as ContentRules).fields === "object" ? (r as ContentRules) : null;
}

export type ValidateOpts = {
    enforceRequired: boolean;
    slug?: string | null;
    components?: ComponentMap;
    /** The content type's formatting rules (`schema.contentRules`). */
    rules?: ContentRules | null;
    /** Block on failing hard rules. Defaults to `enforceRequired`: the moments an entry goes live. */
    enforceRules?: boolean;
};

/**
 * Validate an entry's data against its content type's fields.
 * - Required fields are enforced only when `enforceRequired` is true (i.e. when
 *   publishing / scheduling / approving) — drafts can be incomplete.
 * - The type's content rules block the same moments: a failing hard rule stops the
 *   entry going live. Warnings never block.
 * - "Slug" fields map to the entry's slug column (passed separately).
 * Throws BadRequestException with a field-keyed error map (and, for rule failures, the
 * structured `issues`) on failure.
 */
export function validateEntryData(fields: SchemaField[], data: Record<string, unknown>, opts: ValidateOpts): void {
    const errors: Record<string, string> = {};
    validateFields(fields, data, opts, errors, "", true);
    // Elements inside rich text are checked at the moments an entry goes live, whether or not the type has rules.
    if (opts.enforceRules ?? opts.enforceRequired) {
        for (const r of richValues(fields, data, opts.components, "")) {
            const bad = elementProblems(r.html);
            if (bad.length) errors[r.path] = errors[r.path] ? `${errors[r.path]} ${bad.join(" ")}` : bad.join(" ");
        }
    }
    const hard = opts.rules && (opts.enforceRules ?? opts.enforceRequired) ? blocking(checkContentRules(opts.rules, fields, opts.components ?? {}, data)) : [];
    if (hard.length > 0) {
        // A rule problem reads better than a bare required/type message on the same path.
        const ruleErrors = issueErrors(hard);
        for (const [path, text] of Object.entries(ruleErrors)) errors[path] = errors[path] ? `${errors[path]} ${text}` : text;
        throw new BadRequestException({ message: publishBlockedMessage(Object.keys(errors).length), errors, issues: hard });
    }
    if (Object.keys(errors).length > 0) {
        throw new BadRequestException({ message: "Validation failed.", errors });
    }
}

/** Every rule problem in the data, hard and soft, without throwing. Returned with saves so people and agents see what is left to fix. */
export function contentWarnings(fields: SchemaField[], data: Record<string, unknown>, rules: ContentRules | null | undefined, components?: ComponentMap): RuleIssue[] {
    const out = rules ? checkContentRules(rules, fields, components ?? {}, data) : [];
    // A draft only warns about its elements; publishing blocks (see validateEntryData).
    for (const r of richValues(fields, data, components, "")) {
        for (const message of elementProblems(r.html)) {
            out.push({ path: r.path, pattern: r.path, location: r.path, rule: "allow", level: "warn", message, text: `${r.path}: ${message}` });
        }
    }
    return out;
}

/** Every Rich text value in the data (top level and inside components and dynamic zones), with its data path. */
function richValues(fields: SchemaField[], data: Record<string, unknown>, components: ComponentMap | undefined, prefix: string): { path: string; html: string }[] {
    const out: { path: string; html: string }[] = [];
    for (const field of fields) {
        if (!field?.name || !field.type) continue;
        const value = valueFor(data, field.name);
        const path = prefix ? `${prefix}.${field.name}` : field.name;
        if (field.type === "Rich text") {
            if (typeof value === "string" && value.includes("data-flow-element")) out.push({ path, html: value });
        } else if (field.type === "Component") {
            const sub = resolveFields(field, components);
            const items = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
            items.forEach((it, i) => {
                if (it && typeof it === "object") out.push(...richValues(sub, it as Record<string, unknown>, components, Array.isArray(value) ? `${path}[${i}]` : path));
            });
        } else if (field.type === "DynamicZone" && Array.isArray(value)) {
            value.forEach((it, i) => {
                const comp = it && typeof it === "object" ? (it as Record<string, unknown>).__component : undefined;
                if (typeof comp === "string" && components?.[comp]) out.push(...richValues(components[comp], it as Record<string, unknown>, components, `${path}[${i}]`));
            });
        }
    }
    return out;
}

/** Resolve a Component field's sub-fields: a library reference resolves via the
 *  component map; otherwise its inline `fields`. */
function resolveFields(field: SchemaField, components?: ComponentMap): SchemaField[] {
    if (field.componentApiId && components?.[field.componentApiId]) return components[field.componentApiId];
    return field.fields ?? [];
}

/** Recursively validate a set of fields against a data object. `topLevel` allows
 *  the Slug field (which maps to the entry's slug column) only at the entry root. */
function validateFields(
    fields: SchemaField[],
    data: Record<string, unknown>,
    opts: ValidateOpts,
    errors: Record<string, string>,
    prefix: string,
    topLevel: boolean,
): void {
    for (const field of fields) {
        if (!field?.name || !field.type) continue;
        // Reverse relation fields hold no stored value — they're derived from the
        // other side's links at delivery time — so they're never validated or stored.
        if (field.type === "Reference" && field.mappedByField) continue;
        const path = prefix ? `${prefix}.${field.name}` : field.name;
        const isSlug = field.type === "Slug";

        // Required-presence check (only enforced on publish/schedule/approve). An
        // empty list (e.g. no tags selected, no repeatable items) counts as absent.
        if (opts.enforceRequired && field.required) {
            const raw = valueFor(data, field.name);
            const present = isSlug && topLevel
                ? !!(opts.slug && opts.slug.trim())
                : raw !== undefined && !(Array.isArray(raw) && raw.length === 0);
            if (!present) {
                errors[path] = field.validation?.messages?.required ?? `“${field.name}” is required.`;
                continue;
            }
        }

        if (isSlug) continue; // slug lives in its own column (top level) or is a plain string (nested)

        const value = valueFor(data, field.name);
        if (value === undefined) continue;

        if (field.type === "Component") {
            const sub = resolveFields(field, opts.components);
            if (field.repeatable) {
                if (Array.isArray(value)) {
                    value.forEach((it, i) => {
                        if (it && typeof it === "object" && !Array.isArray(it)) validateFields(sub, it as Record<string, unknown>, opts, errors, `${path}[${i}]`, false);
                    });
                }
            } else if (value && typeof value === "object" && !Array.isArray(value)) {
                validateFields(sub, value as Record<string, unknown>, opts, errors, path, false);
            }
            continue;
        }

        if (field.type === "DynamicZone") {
            if (!Array.isArray(value)) continue;
            value.forEach((it, i) => {
                if (!it || typeof it !== "object" || Array.isArray(it)) return;
                const comp = (it as Record<string, unknown>).__component;
                if (typeof comp !== "string") return;
                if (field.allowedComponents?.length && !field.allowedComponents.includes(comp)) {
                    errors[`${path}[${i}]`] = `“${comp}” isn't an allowed section here.`;
                    return;
                }
                const sub = opts.components?.[comp];
                if (sub) validateFields(sub, it as Record<string, unknown>, opts, errors, `${path}[${i}]`, false);
            });
            continue;
        }

        const err = typeError(field, value);
        if (err) {
            errors[path] = err;
            continue;
        }

        const rule = ruleError(field, value);
        if (rule) errors[path] = rule;
    }
}

/** Pull the fields array out of a ContentType.schema JSON blob. */
export function fieldsOf(schema: unknown): SchemaField[] {
    const fields = (schema as { fields?: unknown })?.fields;
    return Array.isArray(fields) ? (fields as SchemaField[]) : [];
}
