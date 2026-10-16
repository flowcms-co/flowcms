import { sameContent } from "@flowcms/shared";

export type FieldChange = {
    /** Dotted path of the changed value: `title`, `sections[2].heading`, `guides`. */
    path: string;
    before: unknown;
    after: unknown;
    /** The two values say the same thing; only a rich text editor's formatting differs. */
    formattingOnly: boolean;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * What a pending draft changes, field by field. Objects are compared key by key
 * and lists of the same length item by item, so one edited section reports as
 * `sections[2].heading` rather than the whole list; a list whose length changed
 * (an item added, removed) reports as one change.
 */
export function draftDiff(live: unknown, draft: unknown, path = ""): FieldChange[] {
    if (JSON.stringify(live ?? null) === JSON.stringify(draft ?? null)) return [];
    if (isObj(live) && isObj(draft)) {
        return [...new Set([...Object.keys(live), ...Object.keys(draft)])].flatMap((k) => draftDiff(live[k], draft[k], path ? `${path}.${k}` : k));
    }
    if (Array.isArray(live) && Array.isArray(draft) && live.length === draft.length) {
        return live.flatMap((v, i) => draftDiff(v, draft[i], `${path}[${i}]`));
    }
    return [{ path, before: live ?? null, after: draft ?? null, formattingOnly: sameContent(live, draft) }];
}

/** Split a diff path (`sections[2].heading`) into keys: ["sections", 2, "heading"]. */
export function pathKeys(path: string): (string | number)[] {
    const keys: (string | number)[] = [];
    for (const part of path.split(".")) {
        const m = part.match(/^([^[\]]*)((?:\[\d+\])*)$/);
        if (!m) throw new Error(`Bad field path: ${path}`);
        if (m[1]) keys.push(m[1]);
        for (const i of m[2].matchAll(/\[(\d+)\]/g)) keys.push(Number(i[1]));
    }
    return keys.filter((k) => k !== "");
}

/**
 * `base` with the values at `paths` taken from `source`: restoring one field or
 * component (`faq`, `sections[2]`) from an old version and keeping the rest as it
 * is. A path missing from `source` is removed from the result.
 */
export function pickPaths(base: unknown, source: unknown, paths: string[]): Record<string, unknown> {
    const out = structuredClone((base ?? {}) as Record<string, unknown>);
    for (const path of paths) {
        const keys = pathKeys(path);
        if (!keys.length) continue;
        let from: unknown = source;
        for (const k of keys) from = from == null ? undefined : (from as Record<string | number, unknown>)[k];
        let to = out as Record<string | number, unknown>;
        for (const [i, k] of keys.slice(0, -1).entries()) {
            if (to[k] == null || typeof to[k] !== "object") to[k] = typeof keys[i + 1] === "number" ? [] : {};
            to = to[k] as Record<string | number, unknown>;
        }
        const last = keys[keys.length - 1];
        if (from === undefined) {
            if (Array.isArray(to) && typeof last === "number") to.splice(last, 1);
            else delete to[last];
        } else to[last] = structuredClone(from);
    }
    return out;
}
