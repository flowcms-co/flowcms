/**
 * Naming rules for machine identifiers (content-type / component API IDs and field
 * keys). Both must be camelCase and unique within their scope. These helpers are
 * the single source of truth the studio mirrors so a key is coerced the same way
 * whichever surface authors it.
 */

/** Coerce any human string into a camelCase identifier.
 *  "Cover image" / "cover_image" / "cover-image" / "OG image" → "coverImage" / "ogImage". */
export function toCamelCase(input: string): string {
    const words = String(input ?? "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // split camel humps so "blogPost" stays two words
        .replace(/[^A-Za-z0-9]+/g, " ") // any separator (space, _, -, …) → space
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) return "";
    return words.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join("");
}

/** Content-type API IDs double as public URL path segments (site.com/<pluralApiId>/…),
 *  so they stay lowercase rather than camelCase, while remaining valid identifiers
 *  (letters/digits only, no separators) for the REST/GraphQL layer. "Blog Post" →
 *  "blogpost", "services" → "services". Use this for content TYPES; components and
 *  field keys use {@link toCamelCase}. */
export function toLowerId(input: string): string {
    return toCamelCase(input).toLowerCase();
}

type AnyField = { name?: string; fields?: AnyField[]; [k: string]: unknown };

/** Recursively coerce every field name to camelCase and make sibling names unique
 *  (a clash gets a numeric suffix: coverImage, coverImage2, …). Inline component
 *  sub-fields are normalized within their own sibling scope. Returns new objects;
 *  the input is not mutated. */
export function normalizeFieldNames(fields: AnyField[] | undefined): AnyField[] {
    if (!Array.isArray(fields)) return [];
    const used = new Set<string>();
    return fields.map((f) => {
        const base = toCamelCase(String(f?.name ?? "")) || "field";
        let name = base;
        let n = 2;
        while (used.has(name)) name = `${base}${n++}`;
        used.add(name);
        const next: AnyField = { ...f, name };
        if (Array.isArray(f?.fields)) next.fields = normalizeFieldNames(f.fields);
        return next;
    });
}

/** Like {@link normalizeFieldNames}, but also returns a `remap` that rewrites a
 *  data object's keys (recursively, through Component sub-fields and repeatable
 *  item arrays) to the coerced field names. Use it when the data was authored
 *  against the original keys (imports, templates) so the stored entry data stays
 *  aligned with its now-camelCased schema. Keys with no matching field are kept. */
export function normalizeFieldsWithData(fields: AnyField[] | undefined): {
    fields: AnyField[];
    remap: (data: unknown) => unknown;
} {
    const list = Array.isArray(fields) ? fields : [];
    const used = new Set<string>();
    const steps: { oldKey: string; newKey: string; child?: (data: unknown) => unknown }[] = [];
    const outFields = list.map((f) => {
        const base = toCamelCase(String(f?.name ?? "")) || "field";
        let name = base;
        let n = 2;
        while (used.has(name)) name = `${base}${n++}`;
        used.add(name);
        const next: AnyField = { ...f, name };
        let child: ((data: unknown) => unknown) | undefined;
        if (Array.isArray(f?.fields)) {
            const r = normalizeFieldsWithData(f.fields);
            next.fields = r.fields;
            child = r.remap;
        }
        steps.push({ oldKey: String(f?.name ?? ""), newKey: name, child });
        return next;
    });
    const remap = (data: unknown): unknown => {
        if (!data || typeof data !== "object" || Array.isArray(data)) return data;
        const src = data as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        const handled = new Set<string>();
        for (const s of steps) {
            if (!(s.oldKey in src)) continue;
            handled.add(s.oldKey);
            const v = src[s.oldKey];
            out[s.newKey] = s.child ? (Array.isArray(v) ? v.map(s.child) : s.child(v)) : v;
        }
        for (const k of Object.keys(src)) if (!handled.has(k)) out[k] = src[k];
        return out;
    };
    return { fields: outFields, remap };
}

/** Normalize the `fields` array inside a stored content-type schema blob, leaving
 *  the rest of the schema (icon, color, jsonLd, …) untouched. */
export function normalizeSchemaFields<T extends { fields?: AnyField[] } | Record<string, unknown>>(schema: T): T {
    if (!schema || typeof schema !== "object") return schema;
    const s = schema as { fields?: AnyField[] };
    if (!Array.isArray(s.fields)) return schema;
    return { ...schema, fields: normalizeFieldNames(s.fields) };
}
