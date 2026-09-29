/** String helpers shared by the API and Studio. Pure functions, no Node APIs,
 *  so this module is safe to import from client-side code via
 *  `@flowcms/shared/strings` (avoids the crypto-bearing main barrel). */

/** URL-safe slug: lowercase, non-alphanumeric runs collapsed to "-", edges
 *  trimmed. `max` truncates (without leaving a trailing dash); `fallback` is
 *  returned when the input yields an empty slug. */
export function slugify(s: string, opts?: { max?: number; fallback?: string }): string {
    let slug = s
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (opts?.max) slug = slug.slice(0, opts.max).replace(/-+$/g, "");
    return slug || opts?.fallback || "";
}

/** Plain text from an HTML fragment: drops script/style blocks and tags,
 *  decodes common entities, collapses whitespace. */
export function stripTags(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
        .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
}

/** Escape &, <, >, " for safe interpolation into HTML. */
export function escapeHtml(s: string): string {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/** Whether a field name reads as alt text: "Alt text", "Image alt", "heroAlt",
 *  "alt_text"; not "Alternative" or "Salt". */
export function isAltFieldName(name: string): boolean {
    // Split camel humps and separators into words, then look for the word "alt".
    return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).some((w) => w.toLowerCase() === "alt");
}

/** The alt-text field paired with a Media field among its sibling fields: a Text
 *  field named after the image ("Hero image alt"), or the only alt field beside the
 *  only image field (the built-in Image component: "Image" + "Alt text"). */
export function pairedAltField(fields: { name: string; type: string }[], media: { name: string }): string | undefined {
    const alts = fields.filter((f) => f.type === "Text" && isAltFieldName(f.name));
    const named = alts.find((a) => a.name.toLowerCase().startsWith(media.name.toLowerCase()));
    if (named) return named.name;
    return fields.filter((f) => f.type === "Media").length === 1 && alts.length === 1 ? alts[0].name : undefined;
}
