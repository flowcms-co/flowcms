import { escapeHtml, pairedAltField } from "@flowcms/shared";
import type { ComponentMap, SchemaField } from "./entry-validation";

type Json = Record<string, unknown>;
/** Asset alt text for an image URL, or undefined when it isn't a library image with alt. */
export type AltLookup = (url: string) => string | undefined;

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const filled = (v: unknown) => typeof v === "string" && v.trim() !== "";

/** Give library images in an HTML string the asset's alt text where theirs is
 *  missing or empty. Existing non-empty alts are never touched. */
export function fillImgAlts(html: string, altFor: AltLookup): string {
    return html.replace(/<img\b[^>]*>/gi, (tag) => {
        const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
        const alt = altFor(src?.[1] ?? src?.[2] ?? "");
        if (!alt) return tag;
        const has = /\salt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
        if (has && filled(has[1] ?? has[2])) return tag;
        const attr = ` alt="${escapeHtml(alt)}"`;
        return has ? tag.replace(has[0], attr) : tag.replace(/^<img\b/i, `<img${attr}`);
    });
}

/** Fill one object's fields (recursing into components and sections). Returns the
 *  same reference when nothing changed, so callers can cheaply detect a no-op. */
function fillObject(fields: SchemaField[], obj: Json, components: ComponentMap, altFor: AltLookup): Json {
    let out = obj;
    const put = (k: string, v: unknown) => {
        if (out === obj) out = { ...obj };
        out[k] = v;
    };
    const items = (arr: unknown[], subOf: (it: Json) => SchemaField[]) => {
        let changed = false;
        const next = arr.map((it) => {
            if (!isObj(it)) return it;
            const n = fillObject(subOf(it), it, components, altFor);
            if (n !== it) changed = true;
            return n;
        });
        return changed ? next : arr;
    };

    for (const f of fields) {
        const v = obj[f.name];
        if (f.type === "Media") {
            const altName = pairedAltField(fields, f);
            const alt = typeof v === "string" ? altFor(v) : undefined;
            if (altName && alt && !filled(obj[altName])) put(altName, alt);
        } else if (f.type === "Rich text" && typeof v === "string") {
            const html = fillImgAlts(v, altFor);
            if (html !== v) put(f.name, html);
        } else if (f.type === "Component") {
            const sub = f.componentApiId ? components[f.componentApiId] ?? [] : f.fields ?? [];
            const next = Array.isArray(v) ? items(v, () => sub) : isObj(v) ? fillObject(sub, v, components, altFor) : v;
            if (next !== v) put(f.name, next);
        } else if (f.type === "DynamicZone" && Array.isArray(v)) {
            const next = items(v, (it) => (typeof it.__component === "string" ? components[it.__component] ?? [] : []));
            if (next !== v) put(f.name, next);
        }
    }
    return out;
}

/**
 * The top-level entry values to change so every library image on the page carries
 * the asset's alt text where the page has none: paired alt fields next to image
 * fields, and <img> tags in rich text and the editor body (`data.body`, which has no
 * schema field). Empty object when nothing needs filling. Never overwrites alt text
 * an author wrote.
 */
export function altBackfillPatch(fields: SchemaField[], data: Json, components: ComponentMap, altFor: AltLookup): Json {
    let next = fillObject(fields, data, components, altFor);
    if (typeof next.body === "string" && !fields.some((f) => f.name === "body")) {
        const body = fillImgAlts(next.body, altFor);
        if (body !== next.body) next = { ...next, body };
    }
    const patch: Json = {};
    for (const k of Object.keys(next)) if (next[k] !== data[k]) patch[k] = next[k];
    return patch;
}
