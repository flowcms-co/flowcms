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
