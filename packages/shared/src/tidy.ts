/**
 * Quiet clean-up of accidental formatting: stray spaces, empty paragraphs, pasted
 * styles. It only ever changes whitespace, empty blocks and styling, never words.
 * Pure string work (no DOM), so the studio and the API run the same code.
 */

export type TidyCounts = {
    /** Leading, trailing and doubled spaces removed. */
    spaces: number;
    /** Non-breaking spaces turned into normal ones (or dropped at an edge). */
    nbsp: number;
    /** Tabs, zero-width and other unusual space characters normalised. */
    odd: number;
    /** Empty paragraphs removed. */
    emptyBlocks: number;
    /** Trailing or repeated line breaks removed. */
    breaks: number;
    /** Runs of blank lines collapsed. */
    blankLines: number;
    /** Trailing colons removed from headings. */
    colons: number;
    /** Pasted inline styles and font tags removed. */
    styles: number;
};

export const emptyCounts = (): TidyCounts => ({ spaces: 0, nbsp: 0, odd: 0, emptyBlocks: 0, breaks: 0, blankLines: 0, colons: 0, styles: 0 });

export const addCounts = (a: TidyCounts, b: TidyCounts): TidyCounts => {
    const out = emptyCounts();
    for (const k of Object.keys(out) as (keyof TidyCounts)[]) out[k] = a[k] + b[k];
    return out;
};

export const totalCount = (c: TidyCounts): number => Object.values(c).reduce((n, v) => n + v, 0);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Tidied 3 extra spaces and 1 empty paragraph", or null when nothing changed. */
export function tidyNote(c: TidyCounts): string | null {
    const parts: string[] = [];
    if (c.spaces) parts.push(plural(c.spaces, "extra space"));
    if (c.nbsp) parts.push(plural(c.nbsp, "stray hard space"));
    if (c.odd) parts.push(plural(c.odd, "odd space character"));
    if (c.emptyBlocks) parts.push(plural(c.emptyBlocks, "empty paragraph"));
    if (c.breaks) parts.push(plural(c.breaks, "extra line break"));
    if (c.blankLines) parts.push(plural(c.blankLines, "extra blank line"));
    if (c.colons) parts.push(plural(c.colons, "trailing colon"));
    if (c.styles) parts.push(plural(c.styles, "pasted style", "pasted styles"));
    if (!parts.length) return null;
    const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
    return `Tidied ${list}`;
}

const NBSP = /\u00A0|&nbsp;|&#160;|&#xa0;/gi;
const ODD_SPACE = /[\u2000-\u200A\u202F\u205F\u3000]/g;
// Not U+200C/U+200D: joiners hold emoji sequences and some scripts together, removing them changes words.
const ZERO_WIDTH = /[\u200B\u2060\uFEFF]/g;

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

/** Spaces, tabs and odd space characters in `s`, normalised to plain spaces. */
function normaliseSpaces(s: string, c: TidyCounts): string {
    c.nbsp += count(s, NBSP);
    c.odd += count(s, ODD_SPACE) + count(s, ZERO_WIDTH) + count(s, /\t/g);
    return s.replace(NBSP, " ").replace(ODD_SPACE, " ").replace(ZERO_WIDTH, "").replace(/\t/g, " ");
}

/**
 * Tidy a plain text value (a heading, a title, a short text field).
 * `live` keeps what a person still typing needs (a single trailing space, a colon
 * they are about to follow with more text) and only fixes what is certainly wrong.
 * `stripColon` removes a trailing colon, for headings.
 */
export function tidyText(value: string, opts: { live?: boolean; stripColon?: boolean } = {}): { value: string; counts: TidyCounts } {
    const c = emptyCounts();
    let s = value.replace(/\r\n?/g, "\n").replace(/[\u2028\u2029]/g, "\n");
    s = normaliseSpaces(s, c);
    // Blank lines: three or more newlines in a row become one blank line.
    s = s.replace(/\n{3,}/g, (m) => {
        c.blankLines += m.length - 2;
        return "\n\n";
    });
    // Spaces around a line break, then doubled spaces.
    s = s.replace(/ *\n */g, (m) => {
        c.spaces += m.length - 1;
        return "\n";
    });
    s = s.replace(/ {2,}/g, (m) => {
        c.spaces += m.length - 1;
        return " ";
    });
    if (opts.live) {
        // Typing: a space at the very start is never wanted; one at the end is a pause.
        const lead = s.length - s.replace(/^[ \n]+/, "").length;
        c.spaces += lead;
        return { value: s.slice(lead), counts: c };
    }
    const trimmed = s.trim();
    c.spaces += s.length - trimmed.length;
    s = trimmed;
    if (opts.stripColon) {
        const next = s.replace(/\s*[:\uFF1A]+$/, "");
        if (next !== s) {
            c.colons += 1;
            s = next;
        }
    }
    return { value: s, counts: c };
}

const TEXT_SEGMENT = /(<[^>]*>)/;
const BLOCK_TAGS = "p|h[1-6]|li|blockquote|td|th";
const INLINE_TAGS = "strong|b|em|i|u|s|a|mark|code|sub|sup";

/**
 * Tidy a rich text (HTML) value. Inline `style` attributes (pasted fonts, colours, sizes) are
 * removed unless `keepStyles` is set: the editor's own text alignment and colour are stored as
 * styles, so a field that is free to use them keeps them.
 */
export function tidyRich(html: string, opts: { keepStyles?: boolean } = {}): { value: string; counts: TidyCounts } {
    const c = emptyCounts();
    let s = html;
    if (!s.trim()) return { value: s, counts: c };

    // A Google Docs wrapper: <b id="docs-internal-guid-..." style="font-weight:normal"> around everything.
    s = s.replace(/<b\s[^>]*id=["']docs-internal-guid[^"']*["'][^>]*>([\s\S]*)<\/b>/i, (_m, inner: string) => {
        c.styles += 1;
        return inner;
    });
    // Pasted inline styles, font tags and the spans that carried them.
    if (!opts.keepStyles) {
        s = s.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi, () => {
            c.styles += 1;
            return "";
        });
    }
    s = s.replace(/<\/?font\b[^>]*>/gi, (m) => {
        if (!m.startsWith("</")) c.styles += 1;
        return "";
    });
    for (let prev = ""; prev !== s; ) {
        prev = s;
        s = s.replace(/<span>((?:(?!<span)[\s\S])*?)<\/span>/gi, "$1");
    }

    // Text between tags: odd spaces, doubled spaces, and runs of blank lines between blocks.
    let inPre = false;
    s = s
        .split(TEXT_SEGMENT)
        .map((seg) => {
            if (seg.startsWith("<")) {
                if (/^<pre\b/i.test(seg)) inPre = true;
                else if (/^<\/pre>/i.test(seg)) inPre = false;
                return seg;
            }
            if (inPre || !seg) return seg;
            if (!seg.trim()) {
                // Whitespace only, between two tags.
                const nl = count(seg, /\n/g);
                if (nl > 1) {
                    c.blankLines += nl - 1;
                    return "\n";
                }
                return seg;
            }
            let t = normaliseSpaces(seg, c);
            t = t.replace(/[ ]{2,}/g, (m) => {
                c.spaces += m.length - 1;
                return " ";
            });
            return t;
        })
        .join("");

    // Empty paragraphs (nothing, spaces, line breaks, or empty formatting only).
    s = s.replace(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi, (m, inner: string) => {
        if (/<(?:img|iframe|video|hr|table)\b/i.test(inner)) return m;
        const text = inner.replace(/<[^>]*>/g, "").replace(NBSP, " ").trim();
        if (text) return m;
        c.emptyBlocks += 1;
        return "";
    });

    // Trailing line breaks, and three or more in a row.
    s = s.replace(new RegExp(`(?:\\s*<br\\s*/?>)+\\s*((?:</(?:${INLINE_TAGS})>)*</(?:${BLOCK_TAGS})>)`, "gi"), (m, close: string) => {
        c.breaks += count(m, /<br/gi);
        return close;
    });
    s = s.replace(/(?:<br\s*\/?>\s*){3,}/gi, (m) => {
        c.breaks += count(m, /<br/gi) - 2;
        return "<br><br>";
    });

    // Spaces at the start and end of a block.
    s = s.replace(new RegExp(`(<(?:${BLOCK_TAGS})(?:\\s[^>]*)?>(?:<(?:${INLINE_TAGS})(?:\\s[^>]*)?>)*)[ \\t\\n]+`, "gi"), (_m, open: string) => {
        c.spaces += _m.length - open.length;
        return open;
    });
    s = s.replace(new RegExp(`[ \\t\\n]+((?:</(?:${INLINE_TAGS})>)*</(?:${BLOCK_TAGS})>)`, "gi"), (m, close: string) => {
        c.spaces += m.length - close.length;
        return close;
    });

    return { value: s, counts: c };
}

// ─── Paste filter ───────────────────────────────────────────────────────────

const MARK_TAGS: Record<string, string[]> = {
    bold: ["strong", "b"],
    italic: ["em", "i"],
    underline: ["u"],
    strike: ["s", "strike", "del"],
    code: ["code"],
    highlight: ["mark"],
    subscript: ["sub"],
    superscript: ["sup"],
    link: ["a"],
};

/**
 * Pasted HTML reduced to what a field allows. Blocks that are not allowed become
 * plain paragraphs (their text is kept), marks that are not allowed are unwrapped.
 * `allow` uses the same names as the rule config: paragraph, heading, bulletList,
 * orderedList, blockquote, table, image, codeBlock, rule, bold, italic, link, ...
 */
export function filterPastedHtml(html: string, allow: readonly string[]): string {
    const ok = new Set(allow);
    let s = tidyRich(html).value;
    // Editors and browsers wrap a paste in <html><body>, with fragment comments.
    s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?(?:html|head|body|meta|style|script)\b[^>]*>/gi, "");
    if (!ok.has("heading")) s = s.replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi, "<p>$1</p>");
    if (!ok.has("table")) {
        s = s.replace(/<\/?(?:table|thead|tbody|tfoot|tr|colgroup|col)\b[^>]*>/gi, "");
        s = s.replace(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi, "<p>$1</p>");
    }
    if (!ok.has("blockquote")) s = s.replace(/<\/?blockquote\b[^>]*>/gi, "");
    if (!ok.has("codeBlock")) s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner: string) => `<p>${inner.replace(/<\/?code\b[^>]*>/gi, "")}</p>`);
    if (!ok.has("rule")) s = s.replace(/<hr\b[^>]*>/gi, "");
    if (!ok.has("image")) s = s.replace(/<img\b[^>]*>/gi, "");
    // Lists: each item becomes a paragraph, or an ordered list becomes a bullet list.
    const listToParagraphs = (_m: string, inner: string) => inner.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_x, li: string) => `<p>${li.replace(/<\/?p\b[^>]*>/gi, "")}</p>`);
    if (!ok.has("orderedList")) {
        s = ok.has("bulletList") ? s.replace(/<(\/?)ol\b/gi, "<$1ul") : s.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, listToParagraphs);
    }
    if (!ok.has("bulletList")) s = s.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, listToParagraphs);
    for (const [token, tags] of Object.entries(MARK_TAGS)) {
        if (ok.has(token)) continue;
        for (const t of tags) s = s.replace(new RegExp(`</?${t}\\b[^>]*>`, "gi"), "");
    }
    return tidyRich(s).value;
}
