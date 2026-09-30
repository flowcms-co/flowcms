import { slugify } from "@flowcms/shared";
import type { SchemaField } from "./entry-validation";

/**
 * Placeholders for slug patterns, URL patterns and preview URLs, e.g.
 * "{service.slug}-{city.slug}" or "/{service.slug}/{city.slug}".
 *   {field}        a field of the entry itself (its text, or a number)
 *   {ref.slug}     the slug of the entry a Reference field points at
 *   {ref.title}    that entry's title
 * The fixed placeholders {slug} {id} {type} {locale} {status} {path} are filled by
 * whoever builds the final URL.
 */
export const PLACEHOLDER = /\{([\w.]+)\}/g;

export const placeholdersIn = (pattern: string): string[] => [...new Set([...pattern.matchAll(PLACEHOLDER)].map((m) => m[1]))];

/** `pattern` with every {key} replaced from `values`; a key with no value becomes "". */
export const fillPattern = (pattern: string, values: Record<string, string>): string =>
    pattern.replace(PLACEHOLDER, (_, k: string) => values[k] ?? "");

/** Which placeholders `resolvePlaceholders` can fill: the entry's own fields and
 *  {ref.slug} / {ref.title} of its Reference fields. */
const text = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const firstId = (v: unknown): string | null => (Array.isArray(v) ? (typeof v[0] === "string" ? v[0] : null) : typeof v === "string" && v ? v : null);

/**
 * Values for `keys` from the entry's data. `findEntry` looks up a referenced entry
 * by id (null when it doesn't exist). Keys that can't be resolved are left out.
 */
export async function resolvePlaceholders(
    fields: SchemaField[],
    data: Record<string, unknown>,
    keys: string[],
    findEntry: (id: string) => Promise<{ slug: string | null; title: string } | null>,
): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const byName = new Map(fields.map((f) => [f.name, f]));
    const refs = new Map<string, Promise<{ slug: string | null; title: string } | null>>();
    for (const key of keys) {
        const [name, prop] = key.split(".");
        if (!prop) {
            const v = text(data[name]);
            if (v) out[key] = v;
            continue;
        }
        const f = byName.get(name);
        if (f?.type !== "Reference" || (prop !== "slug" && prop !== "title")) continue;
        const id = firstId(data[name]);
        if (!id) continue;
        if (!refs.has(id)) refs.set(id, findEntry(id));
        const ref = await refs.get(id);
        const v = ref ? (prop === "slug" ? ref.slug ?? "" : ref.title) : "";
        if (v) out[key] = v;
    }
    return out;
}

/** The slug a pattern produces, or "" when a placeholder has no value yet (a
 *  reference not picked), so a half-built slug is never written. */
export function slugFromPattern(pattern: string, values: Record<string, string>): string {
    const keys = placeholdersIn(pattern);
    if (keys.some((k) => !values[k])) return "";
    return slugify(fillPattern(pattern, values));
}
