import type { SchemaField } from "./entry-validation";

/**
 * Component fields hold either one object (single) or a list of objects
 * (repeatable). Data written through the API can hold the other shape than the
 * schema says, and the editor then shows one empty block for a stored list. These
 * helpers stop that mismatch from destroying content.
 */

/** True for nothing at all: null, "", [], {}, or an object/array holding only such values. */
export function isEmptyValue(v: unknown): boolean {
    if (v == null || v === "") return true;
    if (Array.isArray(v)) return v.every(isEmptyValue);
    if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(isEmptyValue);
    return false;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * `incoming` with every Component field put back to its stored value when the
 * submitted value is empty and has the other shape (an empty object over a stored
 * list, or an empty list over a stored object). That is what an editor that could
 * not show the stored value sends; a real edit is never empty, so it still wins.
 */
export function keepStoredShape(fields: SchemaField[], stored: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
    if (!isObject(stored)) return incoming;
    const out = { ...incoming };
    for (const f of fields) {
        if (f.type !== "Component" || !(f.name in out)) continue;
        const was = stored[f.name];
        const now = out[f.name];
        if (isEmptyValue(now) && !isEmptyValue(was) && Array.isArray(was) !== Array.isArray(now)) out[f.name] = was;
        else if (f.fields?.length && isObject(now) && isObject(was)) out[f.name] = keepStoredShape(f.fields, was, now);
    }
    return out;
}

/** Did any Component field switch between single and repeatable? Matched by id, else by name. */
export function repeatableFlipped(oldFields: SchemaField[] | undefined, newFields: SchemaField[] | undefined): boolean {
    if (!oldFields?.length || !newFields?.length) return false;
    const byId = new Map(oldFields.filter((f) => f.id).map((f) => [f.id, f]));
    const byName = new Map(oldFields.map((f) => [f.name, f]));
    return newFields.some((f) => {
        const old = f.type === "Component" ? (f.id && byId.get(f.id)) || byName.get(f.name) : undefined;
        return !!old && !!old.repeatable !== !!f.repeatable;
    });
}

/**
 * Entry data re-shaped for Component fields whose `repeatable` flag changed in the
 * Schema Builder: a single block becomes a one-item list, and a list becomes its
 * first block (with a warning when more were stored). Fields are matched by id,
 * else by name. Returns the same object when nothing changed.
 */
export function migrateRepeatable(
    oldFields: SchemaField[] | undefined,
    newFields: SchemaField[] | undefined,
    data: unknown,
): { data: unknown; changed: boolean; warnings: string[] } {
    const warnings: string[] = [];
    if (!isObject(data) || !oldFields?.length || !newFields?.length) return { data, changed: false, warnings };
    const byId = new Map(oldFields.filter((f) => f.id).map((f) => [f.id, f]));
    const byName = new Map(oldFields.map((f) => [f.name, f]));
    let changed = false;
    const out = { ...data };
    for (const f of newFields) {
        if (f.type !== "Component") continue;
        const old = (f.id && byId.get(f.id)) || byName.get(f.name);
        if (!old || !!old.repeatable === !!f.repeatable) continue;
        const v = out[f.name];
        if (f.repeatable && isObject(v)) {
            out[f.name] = isEmptyValue(v) ? [] : [v];
            changed = true;
        } else if (!f.repeatable && Array.isArray(v)) {
            out[f.name] = v[0] ?? {};
            if (v.length > 1) warnings.push(`${f.name}: kept the first of ${v.length} blocks; the rest are gone from the entry (still in its version history).`);
            changed = true;
        }
    }
    return { data: changed ? out : data, changed, warnings };
}
