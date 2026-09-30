/** Content-editor rules shared by the studio (and its tests). Pure functions, no
 *  Node APIs, so it is safe to import client-side via `@flowcms/shared/editor`. */

import { pluralize } from "./strings";

type Field = { name: string; type: string; required?: boolean; mappedByField?: string };

const key = (f: Field) => f.name.trim().toLowerCase();

/** Body HTML that holds nothing: "", whitespace, or empty paragraphs ("<p></p>"). */
export function isEmptyBody(v: unknown): boolean {
    if (typeof v !== "string") return true;
    return /^(\s|<p>\s*(<br\s*\/?>)?\s*<\/p>)*$/i.test(v);
}

/** Whether the editor shows the Body (rich text) editor: the type has a top-level
 *  Rich text field named "body", is flagged as a free-form page, or the entry already
 *  holds real body content (so older content never becomes uneditable). A type with
 *  no fields gets no Body editor unless it asks for one. */
export function showsBodyEditor(type: { fields: Field[]; freeFormBody?: boolean } | undefined, data: Record<string, unknown>): boolean {
    const hasBodyField = !!type?.fields.some((f) => f.type === "Rich text" && key(f) === "body");
    return !!type?.freeFormBody || hasBodyField || !isEmptyBody(data.body);
}

/** Lowercase plural noun for a content type name: "Tag" → "tags", "City" → "cities". */
export function typeNoun(name: string): string {
    return pluralize(name.trim().toLowerCase());
}

/** Reference picker placeholder. Single-target fields name their type; polymorphic
 *  ones stay generic. `empty` = the target type has no entries at all. */
export function refPlaceholder(targetNames: string[], empty: boolean): string {
    if (targetNames.length !== 1) return empty ? "No entries to link yet" : "Search entries…";
    const noun = typeNoun(targetNames[0]);
    return empty ? `No ${noun} yet` : `Search ${noun}…`;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Show an option's "/slug" line only to tell apart options that share a label. */
export function showSlugLine(label: string, slug: string | null, labels: string[]): boolean {
    return !!slug && labels.filter((l) => norm(l) === norm(label)).length > 1;
}

/** Offer "Create <type> "<text>"" as the picker's last option: typed text that no
 *  label matches exactly, on a single-target field, for a user who may create. The
 *  caller also asks the server for an exact match first (see GET /entries/match). */
export function offerCreate(query: string, labels: string[], targetCount: number, canCreate: boolean): boolean {
    const q = norm(query);
    return !!q && targetCount === 1 && canCreate && !labels.some((l) => norm(l) === q);
}

export type EnterChoice = { kind: "pick"; index: number } | { kind: "create" } | null;

/** What Enter does in the picker, whose rows are `labels` plus the create row (when
 *  offered) last. A highlighted row wins; otherwise an exact label match is picked,
 *  and only then is a new entry created. Enter never creates over an exact match. */
export function enterChoice(labels: string[], active: number, query: string, createOffered: boolean): EnterChoice {
    if (active >= 0 && active < labels.length) return { kind: "pick", index: active };
    const exact = labels.findIndex((l) => norm(l) === norm(query));
    if (exact >= 0) return { kind: "pick", index: exact };
    if (createOffered && (active === labels.length || active < 0)) return { kind: "create" };
    return null;
}

/** Data for an entry created from typed text: every required Text field (besides
 *  the title and slug, which are sent on their own) is filled with the text. Returns
 *  null when a required field can't be filled from text alone, so the caller opens
 *  the full editor instead. */
export function quickCreateData(fields: Field[], text: string): Record<string, unknown> | null {
    const t = text.trim();
    const data: Record<string, unknown> = {};
    for (const f of fields) {
        if (!f.required || f.mappedByField || f.type === "Slug" || key(f) === "title") continue;
        if (f.type !== "Text") return null;
        data[f.name] = t;
    }
    return data;
}
