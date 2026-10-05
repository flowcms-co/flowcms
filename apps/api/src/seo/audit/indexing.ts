/**
 * Rules for pages that are deliberately kept out of search, and for which schema a
 * page is expected to carry. Pure: no Nest/Prisma/network.
 */
import type { RenderedFinding } from "./audit-engine";

/** Bump when detectors change what they report, so rows written by older rules are
 *  discarded instead of shown as current. Stored as a prefix of the row's hash. */
export const RULES_VERSION = "r2";
export const withRules = (hash: string) => `${RULES_VERSION}:${hash}`;
export const isCurrentRules = (stored: string) => stored === "" || stored.startsWith(`${RULES_VERSION}:`);

const trimSlash = (p: string) => p.replace(/(.)\/+$/, "$1");
/** Site paths from absolute or relative URLs, trailing slash removed. */
export const toPaths = (urls: string[]): string[] =>
    urls.flatMap((u) => {
        try {
            return [trimSlash(new URL(u, "https://x.invalid").pathname)];
        } catch {
            return [];
        }
    });

export type RankSignals = { sitemap: Set<string>; impressions: Map<string, number>; nav: Set<string> };

/** Why a noindexed page looks like it should rank, or null when nothing says so.
 *  A noindex is only worth a warning when the site contradicts it: the page is in
 *  the sitemap, already gets search impressions, or is linked from the navigation. */
export function rankSignal(path: string | null | undefined, s: RankSignals): string | null {
    if (!path) return null;
    const p = trimSlash(path);
    if (s.sitemap.has(p)) return "It is noindex but listed in the sitemap.";
    if ((s.impressions.get(p) ?? 0) > 0) return "It is noindex but still gets search impressions.";
    if (s.nav.has(p)) return "It is noindex but linked from the site navigation.";
    return null;
}

/** Checks that say nothing useful about a page search engines are told to skip:
 *  it cannot rank, so its title length, description, readability and schema do not
 *  matter (and it cannot cannibalize or duplicate another page in search). */
const SKIPPED_WHEN_NOINDEX = /^(META_|SCHEMA_|READABILITY_)/;

/** A noindexed page's findings: the noindex itself is kept only as a warning when
 *  `signal` says the page should rank, and the ranking-only checks are dropped. */
export function noindexFindings(findings: RenderedFinding[], signal: string | null): RenderedFinding[] {
    return findings.flatMap((f) => {
        if (f.code === "TECH_NOINDEX") return signal ? [{ ...f, fixHint: `${signal} Remove noindex if this page should rank, or mark noindex as intended for its content type.` }] : [];
        return SKIPPED_WHEN_NOINDEX.test(f.code) ? [] : [f];
    });
}

const ARTICLE_TYPES = new Set(["article", "blogposting", "newsarticle"]);
export const hasArticle = (types: Set<string>) => [...types].some((t) => ARTICLE_TYPES.has(t));

/** Whether pages of a content type are articles (so Article schema is expected):
 *  a "blog" page type, or a legacy type with no page type whose JSON-LD type is an
 *  article one. Service, static, home and reference pages are not. */
export function expectsArticle(t: { pageType?: string | null; jsonLd?: string | null }): boolean {
    const pt = (t.pageType ?? "").toLowerCase();
    if (pt) return pt === "blog";
    return ARTICLE_TYPES.has((t.jsonLd ?? "").toLowerCase());
}

/** Anchors inside <nav> and <header> on a page: the site navigation's link targets. */
export function navHrefs(html: string): string[] {
    const blocks = html.match(/<(nav|header)\b[\s\S]*?<\/\1>/gi) ?? [];
    return blocks.flatMap((b) => [...b.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)].map((m) => m[1]));
}
