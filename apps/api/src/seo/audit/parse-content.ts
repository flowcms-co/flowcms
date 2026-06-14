/**
 * Parse a managed content entry into the structured PageInput the L1 detectors
 * consume. Content extraction is delegated to the shared, component-aware
 * `entryToCanonicalContent()` (apps/api/src/content/canonical-content.ts) so the
 * audit understands sections/components, not just a flat `data.body`. For crawled
 * external pages the crawler produces a PageInput directly (later wiring).
 */
import type { PageInput } from "./audit-engine";
import {
    entryToCanonicalContent,
    str,
    stripTags,
    extractHeadings,
    extractImages,
    countInternalLinks,
    type EntryLike,
} from "../../content/canonical-content";

// Re-exported so existing importers keep working.
export { str, stripTags, extractHeadings, extractImages, countInternalLinks };
export type { EntryLike };

/** Map a managed entry to a PageInput for L1 auditing. */
export function entryToPageInput(entry: EntryLike): PageInput {
    const d = (entry.data ?? {}) as Record<string, unknown>;
    const robots = str(d.robots).toLowerCase();
    // A managed page's H1 is its title (the frontend renders it), so count the title
    // as the level-1 heading and only treat in-content headings as H2+ structure.
    const pageTitle = str(d.title) || str(entry.title);
    // Canonical content across body + components + dynamic-zone sections.
    const c = entryToCanonicalContent(entry);
    // Canonical: flag when the entry has none set (null), so the fix can add a
    // self-canonical. (An explicit canonical is set in the SEO panel.)
    const canonical = d.canonical ? str(d.canonical) : null;
    const jsonLdType = str(d.jsonLdType);

    return {
        url: entry.slug ? `/${entry.slug}` : undefined,
        metaTitle: str(d.metaTitle) || str(entry.title) || str(d.title),
        metaDescription: str(d.metaDescription) || str(d.summary),
        focusKeyword: str(d.focusKeyword) || undefined,
        headings: [
            ...(pageTitle ? [{ level: 1, text: pageTitle }] : []),
            ...c.headings,
        ],
        images: c.images,
        internalLinkCount: c.internalLinkCount,
        bodyText: c.plainText,
        wordCount: c.wordCount,
        jsonLd: jsonLdType ? [{ "@type": jsonLdType }] : [],
        tech: { canonical, noindex: /noindex/.test(robots) },
    };
}
