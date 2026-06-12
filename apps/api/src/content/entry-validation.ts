import { BadRequestException } from "@nestjs/common";

/** A field definition as authored in the Schema Builder (stored in ContentType.schema). */
export type SchemaField = {
    id?: string;
    name: string;
    type: string;
    required?: boolean;
};

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
    opts: { enforceRequired: boolean; slug?: string | null },
): void {
    const errors: Record<string, string> = {};

    for (const field of fields) {
        if (!field?.name || !field.type) continue;
        const isSlug = field.type === "Slug";

        if (opts.enforceRequired && field.required) {
            const present = isSlug ? !!(opts.slug && opts.slug.trim()) : isPresent(data, field.name);
            if (!present) {
                errors[field.name] = `“${field.name}” is required.`;
                continue;
            }
        }

        if (!isSlug) {
            const value = valueFor(data, field.name);
            if (value !== undefined) {
                const err = typeError(field, value);
                if (err) errors[field.name] = err;
            }
        }
    }

    if (Object.keys(errors).length > 0) {
        throw new BadRequestException({ message: "Validation failed.", errors });
    }
}

/** Pull the fields array out of a ContentType.schema JSON blob. */
export function fieldsOf(schema: unknown): SchemaField[] {
    const fields = (schema as { fields?: unknown })?.fields;
    return Array.isArray(fields) ? (fields as SchemaField[]) : [];
}
