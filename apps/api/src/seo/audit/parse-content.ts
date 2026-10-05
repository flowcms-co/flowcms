/**
 * Parse a managed content entry into the structured PageInput the L1 detectors
 * consume. Content extraction is delegated to the shared, component-aware
 * `entryToCanonicalContent()` (apps/api/src/content/canonical-content.ts) so the
 * audit understands sections/components, not just a flat `data.body`.
 *
 * On a headless site the frontend builds the title, description, canonical and
 * JSON-LD, so when the page's live HTML is available (`ctx.live`) those come from
 * it. Entry fields are the fallback for workspaces with no site URL.
 */
import type { LiveFacts, PageInput } from "./audit-engine";
import {
    buildJsonLd,
    entryToCanonicalContent,
    str,
    stripTags,
    extractHeadings,
    extractImages,
    countInternalLinks,
    type AltLookup,
    type EntryLike,
} from "../../content/canonical-content";

// Re-exported so existing importers keep working.
export { str, stripTags, extractHeadings, extractImages, countInternalLinks };
export type { EntryLike };

export type ParseContext = {
    /** The page's real site path (entryPath), instead of "/" + slug. */
    path?: string;
    /** Asset-library alt text by image URL. */
    altFor?: AltLookup;
    /** The workspace has a site URL, so the live page is the source of truth. */
    hasSite?: boolean;
    /** What was read from the live page; null/absent when not fetched. */
    live?: LiveFacts | null;
    /** Titles of the entries this one references, by field name (lowercased), for
     *  filling {City}-style tokens. */
    refTitles?: Record<string, string>;
    /** A referenced (parent) entry has a description this page inherits. */
    parentHasDescription?: boolean;
};

/** Fill {Token} placeholders in a title/description template from the entry's own
 *  fields and the titles of the entries it references. Unknown tokens are left in. */
export function resolveTokens(tpl: string, data: Record<string, unknown>, refTitles: Record<string, string> = {}): string {
    const own = new Map(Object.entries(data).map(([k, v]) => [k.toLowerCase(), v]));
    return tpl.replace(/\{\{?\s*([\w.]+)\s*\}?\}/g, (m, key: string) => {
        const k = key.toLowerCase().split(".")[0];
        if (refTitles[k]) return refTitles[k];
        const v = own.get(k);
        return typeof v === "string" && v.trim() && !/^c[a-z0-9]{20,}$/.test(v) ? v : typeof v === "number" ? String(v) : m;
    });
}
const hasToken = (s: string) => /\{\{?\s*[\w.]+\s*\}?\}/.test(s);

/** Map a managed entry to a PageInput for L1 auditing. */
export function entryToPageInput(entry: EntryLike, ctx: ParseContext = {}): PageInput {
    const d = (entry.data ?? {}) as Record<string, unknown>;
    // A managed page's H1 is its title (the frontend renders it), so count the title
    // as the level-1 heading and only treat in-content headings as H2+ structure.
    const pageTitle = str(d.title) || str(entry.title);
    // Canonical content across body + components + dynamic-zone sections.
    const c = entryToCanonicalContent(entry, { altFor: ctx.altFor });
    const content = {
        url: ctx.path ?? (entry.slug ? `/${entry.slug}` : undefined),
        focusKeyword: str(d.focusKeyword) || undefined,
        headings: [
            ...(pageTitle ? [{ level: 1, text: pageTitle }] : []),
            ...c.headings,
        ],
        images: c.images,
        internalLinkCount: c.internalLinkCount,
        bodyText: c.plainText,
        wordCount: c.wordCount,
    };

    const live = ctx.live;
    if (live && live.status === 200) {
        return {
            ...content,
            metaTitle: live.title,
            metaDescription: live.description,
            // Inferred from a sample that could not tell how these are built: unknown,
            // so neither a length nor a "missing" finding is raised.
            titleTemplated: !!live.titleUnknown,
            descriptionInherited: !!live.descriptionUnknown,
            jsonLd: live.ldTypes.map((t) => ({ "@type": t })),
            tech: { canonical: live.canonical || null, noindex: live.noindex },
        };
    }

    const title = resolveTokens(str(d.metaTitle) || str(entry.title) || str(d.title), d, ctx.refTitles);
    const description = resolveTokens(str(d.metaDescription) || str(d.summary), d, ctx.refTitles);
    const robots = str(d.robots).toLowerCase();
    const jsonLdType = str(d.jsonLdType);
    if (ctx.hasSite) {
        // The site exists but this page could not be read: say so, and don't guess
        // at tags the frontend generates (canonical, JSON-LD, description).
        return {
            ...content,
            metaTitle: title,
            metaDescription: description,
            titleTemplated: hasToken(title),
            descriptionInherited: true,
            tech: { noindex: /noindex/.test(robots), unreachable: live?.status ?? 0 },
        };
    }
    return {
        ...content,
        metaTitle: title,
        metaDescription: hasToken(description) ? "" : description,
        titleTemplated: hasToken(title),
        descriptionInherited: hasToken(description) || (!description && !!ctx.parentHasDescription),
        // What the delivery API would serve: the entry's own type plus the JSON-LD
        // derived from its sections (FAQ, reviews, how-to).
        jsonLd: [...(jsonLdType ? [{ "@type": jsonLdType }] : []), ...buildJsonLd(c.structuredDataSpecs)],
        // Canonical: flag when the entry has none set (null), so the fix can add a
        // self-canonical. (An explicit canonical is set in the SEO panel.)
        tech: { canonical: d.canonical ? str(d.canonical) : null, noindex: /noindex/.test(robots) },
    };
}
