/**
 * Small pure checks the content rules share: counting words, reading links, city
 * placeholders and label paragraphs. No DOM, no state.
 */

export const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** Every link in an HTML value, with its address, its words, and whether it sits inside a list item. */
export function linksIn(html: string): { href: string; text: string; inList: boolean }[] {
    const out: { href: string; text: string; inList: boolean }[] = [];
    // Walk tags in order, tracking how deep inside <li> we are.
    const tag = /<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g;
    let li = 0;
    let open: { href: string; start: number; inList: boolean } | null = null;
    let m: RegExpExecArray | null;
    while ((m = tag.exec(html))) {
        const name = m[2].toLowerCase();
        if (name === "li") li = Math.max(0, li + (m[1] ? -1 : 1));
        else if (name === "a" && !m[1]) open = { href: /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3])?.slice(1).find((v) => v !== undefined) ?? "", start: tag.lastIndex, inList: li > 0 };
        else if (name === "a" && m[1] && open) {
            out.push({ href: open.href, text: html.slice(open.start, m.index).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(), inList: open.inList });
            open = null;
        }
    }
    return out;
}

/** The first paragraph that is only a label: all of it bold, or a short line ending with a colon. */
export function labelParagraph(paragraphsHtml: string[], kinds: { bold: boolean; colon: boolean } = { bold: true, colon: true }): string | null {
    for (const p of paragraphsHtml) {
        const inner = p.replace(/^<p\b[^>]*>|<\/p>$/gi, "").trim();
        const text = inner.replace(/<[^>]*>/g, "").replace(/&nbsp;| /g, " ").trim();
        if (!text) continue;
        const allBold = !inner.replace(/<(strong|b)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]*>/g, "").replace(/&nbsp;|\u00A0/g, " ").trim();
        if ((kinds.bold && allBold) || (kinds.colon && /[:\uFF1A]$/.test(text))) return text;
    }
    return null;
}

const CITY_WORDS = new Set(["City", "State", "STATEABV", "CityCode"]);

export type CityProblem = { kind: "unknown" | "nofallback" | "comma" | "count" | "brace"; token: string };

/**
 * Check the `{City:Near You}` placeholders in a plain text value. Words allowed before the colon:
 * City, State, STATEABV, CityCode (a comma list). The fallback after the colon must exist and
 * hold no comma or second colon. `{CityCount}` is only for the field that says so.
 */
export function cityProblem(text: string, allowCount: boolean): CityProblem | null {
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "}") return { kind: "brace", token: "}" };
        if (text[i] !== "{") continue;
        const end = text.indexOf("}", i);
        if (end < 0) return { kind: "brace", token: text.slice(i, i + 20) };
        const token = text.slice(i, end + 1);
        const inner = text.slice(i + 1, end);
        if (/^CityCount$/.test(inner)) {
            if (!allowCount) return { kind: "count", token };
        } else {
            const colon = inner.indexOf(":");
            const head = (colon < 0 ? inner : inner.slice(0, colon)).split(",").map((s) => s.trim());
            if (!head.every((h) => CITY_WORDS.has(h))) return { kind: "unknown", token };
            const fallback = colon < 0 ? "" : inner.slice(colon + 1);
            if (!fallback.trim()) return { kind: "nofallback", token };
            if (/[,:]/.test(fallback)) return { kind: "comma", token };
        }
        i = end;
    }
    return null;
}
