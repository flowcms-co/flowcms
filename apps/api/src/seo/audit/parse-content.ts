/**
 * Parse a managed content entry into the structured PageInput the L1 detectors
 * consume. Pure + dependency-free (regex over the TipTap HTML we control). For
 * crawled external pages the crawler produces a PageInput directly (later wiring).
 */
import type { PageInput } from "./audit-engine";

export interface EntryLike {
    id: string;
    title?: string | null;
    slug?: string | null;
    data?: Record<string, unknown> | null;
}

function str(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function stripTags(html: string): string {
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

function attr(tag: string, name: string): string | undefined {
    const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
    return m ? m[1] : undefined;
}

function extractHeadings(html: string): { level: number; text: string }[] {
    const out: { level: number; text: string }[] = [];
    const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) out.push({ level: Number(m[1]), text: stripTags(m[2]) });
    return out;
}

function extractImages(html: string): { src: string; alt?: string | null }[] {
    const out: { src: string; alt?: string | null }[] = [];
    const re = /<img\b[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) out.push({ src: attr(m[0], "src") ?? "", alt: attr(m[0], "alt") ?? null });
    return out;
}

function countInternalLinks(html: string): number {
    let n = 0;
    const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
        const href = m[1];
        if (href.startsWith("/") || href.startsWith("#") === false && /^[a-z0-9./?_-]+$/i.test(href) && !/^https?:/i.test(href)) n++;
    }
    return n;
}

/** Map a managed entry to a PageInput for L1 auditing. */
export function entryToPageInput(entry: EntryLike): PageInput {
    const d = (entry.data ?? {}) as Record<string, unknown>;
    const body = str(d.body);
    const bodyText = stripTags(body);
    const robots = str(d.robots).toLowerCase();
    // A managed page's H1 is its title (the frontend renders it), so count the title
    // as the level-1 heading and only treat in-body headings as H2+ structure.
    const pageTitle = str(d.title) || str(entry.title);
    const headings = [
        ...(pageTitle ? [{ level: 1, text: pageTitle }] : []),
        ...extractHeadings(body),
    ];
    // Canonical: flag when the entry has none set (null), so the fix can add a
    // self-canonical. (An explicit canonical is set in the SEO panel.)
    const canonical = d.canonical ? str(d.canonical) : null;
    const jsonLdType = str(d.jsonLdType);

    return {
        url: entry.slug ? `/${entry.slug}` : undefined,
        metaTitle: str(d.metaTitle) || str(entry.title) || str(d.title),
        metaDescription: str(d.metaDescription) || str(d.summary),
        focusKeyword: str(d.focusKeyword) || undefined,
        headings,
        images: extractImages(body),
        internalLinkCount: countInternalLinks(body),
        bodyText,
        wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
        jsonLd: jsonLdType ? [{ "@type": jsonLdType }] : [],
        tech: { canonical, noindex: /noindex/.test(robots) },
    };
}
