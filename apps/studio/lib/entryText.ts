/** Entry keys that are settings or metadata, never page copy. */
const META = new Set(["title", "slug", "summary", "excerpt", "metatitle", "metadescription", "focuskeyword", "canonical", "robots", "jsonld", "jsonldtype", "locale", "author", "status"]);

const isUrlish = (s: string) => /^(https?:\/\/|\/|data:|mailto:|tel:|#)/i.test(s) || !/\s/.test(s);

/**
 * All readable text of an entry, whatever its content type calls its fields:
 * every rich-text and multi-word text value at any depth (components, sections),
 * tags stripped. Skips metadata keys, URLs and single-token values (ids, enums).
 */
export function entryText(data: unknown): string {
    const out: string[] = [];
    const walk = (v: unknown, key = "") => {
        if (typeof v === "string") {
            const s = v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            if (s && !isUrlish(s)) out.push(s);
        } else if (Array.isArray(v)) {
            v.forEach((x) => walk(x));
        } else if (v && typeof v === "object") {
            for (const [k, x] of Object.entries(v)) if (!k.startsWith("__") && !(key === "" && META.has(k.toLowerCase()))) walk(x, k);
        }
    };
    if (data && typeof data === "object" && !Array.isArray(data)) {
        for (const [k, x] of Object.entries(data)) if (!k.startsWith("__") && !META.has(k.toLowerCase())) walk(x, k);
    }
    return out.join(" ");
}
