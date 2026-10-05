/**
 * Keeping stored rich text as it was written. A visual editor re-serialises HTML
 * its own way (a paragraph inside every list item, `&amp;` for `&`, a trailing
 * empty paragraph), so "open and save" would rewrite content nobody edited. These
 * helpers put back the original bytes for everything the user did not change, and
 * deal with link attributes. Pure string work: no DOM, so the API can use it too.
 */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Split HTML into its top-level blocks, as written (bytes untouched). Text between
 *  blocks is its own piece; whitespace-only text is dropped. */
export function splitBlocks(html: string): string[] {
    const out: string[] = [];
    const tag = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
    let depth = 0;
    let start = 0;
    let m: RegExpExecArray | null;
    const push = (s: string) => {
        if (s.trim()) out.push(s.trim());
    };
    while ((m = tag.exec(html))) {
        if (!m[2]) continue; // a comment
        const name = m[2].toLowerCase();
        const closing = m[1] === "/";
        const selfClosed = m[3] === "/" || VOID.has(name);
        if (depth === 0 && !closing) {
            push(html.slice(start, m.index)); // loose text before this block
            start = m.index;
        }
        if (closing) depth = Math.max(0, depth - 1);
        else if (!selfClosed) depth++;
        if (depth === 0) {
            push(html.slice(start, tag.lastIndex));
            start = tag.lastIndex;
        }
    }
    push(html.slice(start));
    return out;
}

const EMPTY_P = /^<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>$/i;

/** The editor's output without what it adds on its own: the trailing empty
 *  paragraph, and (unless the content already used them) the paragraph it wraps
 *  around every plain list item. */
export function tidyHtml(html: string, keepListParagraphs = false): string {
    const blocks = splitBlocks(html);
    while (blocks.length && EMPTY_P.test(blocks[blocks.length - 1])) blocks.pop();
    const joined = blocks.join("");
    if (keepListParagraphs) return joined;
    // <li><p>text</p></li> -> <li>text</li>, only for items that hold one paragraph and nothing else.
    return joined.replace(/<li>\s*<p>((?:(?!<\/?(?:p|li|ul|ol)\b)[\s\S])*?)<\/p>\s*<\/li>/gi, "<li>$1</li>");
}

/**
 * What to store after an edit session on a rich text value.
 *  - `original`: the stored HTML as loaded.
 *  - `baseline`: what the editor made of it on load (its normalised form).
 *  - `current`: what the editor holds now.
 * Unchanged content returns `original` exactly. After a real edit, every top-level
 * block the user did not touch keeps its original bytes, and only changed blocks
 * are taken from the editor (tidied).
 */
export function preserveHtml(original: string, baseline: string, current: string): string {
    const keepLi = /<li>\s*<p[\s>]/i.test(original);
    const tidy = (h: string) => tidyHtml(h, keepLi);
    if (tidy(current) === tidy(baseline)) return original;

    const orig = splitBlocks(original);
    const base = splitBlocks(tidyHtml(baseline, true));
    const cur = splitBlocks(tidyHtml(current, true));
    // The editor keeps top-level blocks one-to-one; if it did not (unusual markup),
    // nothing can be mapped back, so store its tidied output.
    if (orig.length !== base.length) return tidy(current);

    // Each normalised block -> the original bytes it came from (queued, for repeats).
    const from = new Map<string, string[]>();
    base.forEach((b, i) => from.set(b, [...(from.get(b) ?? []), orig[i]]));
    const sep = original.includes(">\n<") ? "\n" : "";
    return cur.map((c) => from.get(c)?.shift() ?? tidy(c)).join(sep);
}

// ─── Links ──────────────────────────────────────────────────────────────────

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(1).find((v) => v !== undefined);

/** Whether a link stays on the site: a relative URL, a fragment, or an absolute URL
 *  on the site's own host. mailto:, tel: and other hosts are not internal. */
export function isInternalHref(href: string, siteHost?: string | null): boolean {
    const h = href.trim();
    if (!h || /^(mailto:|tel:|sms:|javascript:|data:)/i.test(h)) return false;
    if (!/^([a-z][a-z0-9+.-]*:)?\/\//i.test(h)) return true; // relative path, ?query or #fragment
    if (!siteHost) return false;
    try {
        const strip = (x: string) => x.toLowerCase().replace(/^www\./, "");
        return strip(new URL(h.startsWith("//") ? `https:${h}` : h).hostname) === strip(siteHost.replace(/^https?:\/\//i, "").split("/")[0]);
    } catch {
        return false;
    }
}

/** Internal links that carry rel="nofollow": they tell search engines not to follow
 *  the site's own links, which cuts the page out of internal linking. */
export function internalNofollowLinks(html: string, siteHost?: string | null): string[] {
    const out: string[] = [];
    for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
        const href = attr(m[0], "href");
        if (href && isInternalHref(href, siteHost) && /\bnofollow\b/i.test(attr(m[0], "rel") ?? "")) out.push(href);
    }
    return out;
}

/** Remove nofollow (and the new-tab target the editor used to add with it) from
 *  internal links. External links are left exactly as they are. */
export function fixInternalLinks(html: string, siteHost?: string | null): string {
    return html.replace(/<a\b[^>]*>/gi, (tag) => {
        const href = attr(tag, "href");
        if (!href || !isInternalHref(href, siteHost) || !/\bnofollow\b/i.test(attr(tag, "rel") ?? "")) return tag;
        return tag.replace(/\s(?:rel|target)\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
    });
}

/** HTML reduced to what it says, ignoring how an editor happened to write it: the
 *  link target/rel an old editor added, paragraphs inside list items, empty
 *  paragraphs, `&amp;` versus `&`, and whitespace between tags. Two values with the
 *  same canonical form differ only by editor normalisation. */
export function canonicalHtml(html: string): string {
    return splitBlocks(
        html
            .replace(/<a\b[^>]*>/gi, (tag) => tag.replace(/\s(?:rel|target)\s*=\s*(?:"[^"]*"|'[^']*')/gi, ""))
            .replace(/<li>\s*<p>((?:(?!<\/?(?:p|li|ul|ol)\b)[\s\S])*?)<\/p>\s*<\/li>/gi, "<li>$1</li>")
            .replace(/&amp;/g, "&")
            .replace(/>\s+</g, "><"),
    )
        .filter((b) => !EMPTY_P.test(b))
        .join("");
}

/** Whether two entry data objects differ only by rich-text normalisation: every
 *  string compared by its canonical form, everything else exactly. */
export function sameContent(a: unknown, b: unknown): boolean {
    if (typeof a === "string" && typeof b === "string") return a === b || canonicalHtml(a) === canonicalHtml(b);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameContent(x, b[i]));
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        return [...keys].every((k) => sameContent((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
    }
    // An absent field and an empty one say the same thing.
    const empty = (v: unknown) => v === undefined || v === null || v === "";
    return a === b || (empty(a) && empty(b));
}

/** `list` with the item at `from` moved to `to` (out-of-range moves return it unchanged). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
    const next = list.slice();
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
}
