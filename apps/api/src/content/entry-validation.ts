import { BadRequestException } from "@nestjs/common";

/** A field definition as authored in the Schema Builder (stored in ContentType.schema). */
export type SchemaField = {
    id?: string;
    name: string;
    type: string;
    required?: boolean;
    /** Component fields can repeat (a list) and nest their own fields (inline). */
    repeatable?: boolean;
    fields?: SchemaField[];
    /** Component field referencing a reusable component (ContentType kind=COMPONENT) by apiId. */
    componentApiId?: string;
    /** DynamicZone: the component apiIds allowed in this ordered list of sections. */
    allowedComponents?: string[];
};

/** Map of reusable-component apiId → its field defs (from kind=COMPONENT types). */
export type ComponentMap = Record<string, SchemaField[]>;

/**
 * Candidate data keys for a field. The Schema Builder stores a human field name
 * ("Cover image"); entry data may key it as "cover image", "coverImage",
 * "cover_image" or "cover". We accept any of these so validation is lenient about
 * the exact key while still enforcing presence + type.
 */
function candidateKeys(name: string): string[] {
    const lower = name.trim().toLowerCase();
    const parts = lower.split(/\s+/);
    const camel = parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");
    const snake = parts.join("_");
    const first = parts[0];
    return [...new Set([name, lower, camel, snake, first])];
}

function valueFor(data: Record<string, unknown>, name: string): unknown {
    for (const k of candidateKeys(name)) {
        if (k in data && data[k] !== undefined && data[k] !== null && data[k] !== "") return data[k];
    }
    return undefined;
}

const isPresent = (data: Record<string, unknown>, name: string) => valueFor(data, name) !== undefined;

/** Type-check a present value. Lenient: only flags clearly-wrong types. */
function typeError(field: SchemaField, value: unknown): string | null {
    switch (field.type) {
        case "Number":
            if (typeof value === "number") return null;
            if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return null;
            return `“${field.name}” must be a number.`;
        case "Boolean":
            if (typeof value === "boolean") return null;
            if (value === "true" || value === "false") return null;
            return `“${field.name}” must be true or false.`;
        case "Date":
            if (value instanceof Date) return null;
            if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return null;
            return `“${field.name}” must be a valid date.`;
        case "URL":
            if (typeof value === "string" && /^https?:\/\/|^\//.test(value.trim())) return null;
            return `“${field.name}” must be a URL.`;
        default:
            return null; // Text / Rich text / Media / Reference / Component / Slug — accept as-is
    }
}

/**
 * Validate an entry's data against its content type's fields.
 * - Required fields are enforced only when `enforceRequired` is true (i.e. when
 *   publishing / scheduling / approving) — drafts can be incomplete.
 * - "Slug" fields map to the entry's slug column (passed separately).
 * Throws BadRequestException with a field-keyed error map on failure.
 */
export function validateEntryData(
    fields: SchemaField[],
    data: Record<string, unknown>,
    opts: { enforceRequired: boolean; slug?: string | null; components?: ComponentMap },
): void {
    const errors: Record<string, string> = {};
    validateFields(fields, data, opts, errors, "", true);
    if (Object.keys(errors).length > 0) {
        throw new BadRequestException({ message: "Validation failed.", errors });
    }
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
    opts: { enforceRequired: boolean; slug?: string | null; components?: ComponentMap },
    errors: Record<string, string>,
    prefix: string,
    topLevel: boolean,
): void {
    for (const field of fields) {
        if (!field?.name || !field.type) continue;
        const path = prefix ? `${prefix}.${field.name}` : field.name;
        const isSlug = field.type === "Slug";

        // Required-presence check (only enforced on publish/schedule/approve).
        if (opts.enforceRequired && field.required) {
            const present = isSlug && topLevel ? !!(opts.slug && opts.slug.trim()) : isPresent(data, field.name);
            if (!present) {
                errors[path] = `“${field.name}” is required.`;
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
        if (err) errors[path] = err;
    }
}

/** Pull the fields array out of a ContentType.schema JSON blob. */
export function fieldsOf(schema: unknown): SchemaField[] {
    const fields = (schema as { fields?: unknown })?.fields;
    return Array.isArray(fields) ? (fields as SchemaField[]) : [];
}
