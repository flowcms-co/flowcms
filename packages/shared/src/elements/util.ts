/** HTML-escape a value for text or a quoted attribute. */
export const esc = (v: unknown): string =>
    String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

/** A trimmed string, whatever came in. */
export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/**
 * JSON for the data-values attribute. `< > & '` are written as JSON unicode escapes, so the
 * attribute holds no character that an HTML serialiser, a tag-matching regex or the tidy pass
 * could treat as markup. Only `"` remains, and it is always entity-escaped in the attribute.
 */
export const safeJson = (v: unknown): string =>
    JSON.stringify(v).replace(/[<>&']/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
