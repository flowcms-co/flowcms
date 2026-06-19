/**
 * Fields that are structural / SEO metadata / identifiers, not on-page content you
 * point at while editing a live page. They are hidden from the field mapper and never
 * sent as editable bindings to the live editor:
 *
 *   - the entry's Slug and (page-level) Title
 *   - anything under an SEO / meta / Open Graph / Twitter group (meta title, meta
 *     description, canonical, OG image, robots, JSON-LD, …) — i.e. <meta>/head tags
 *     that have no relevance in visual editing
 *   - any id / uuid / guid / key (e.g. "items.0.id", "userId", "block_key")
 *
 * Nested content headings (e.g. "heroSection.title", "faqSection.title") stay
 * editable: those are visible page content, not metadata.
 */

// A path segment naming a metadata container — its whole subtree is hidden.
const META_CONTAINER = new Set(["seo", "meta", "metadata", "opengraph", "og", "twitter", "metatags", "metatag", "headtags", "schemaorg", "jsonld", "structureddata"]);

// Leaf field names that are SEO / meta tags even when not under a container.
const META_LEAF = new Set([
    "slug",
    "metatitle", "metadescription", "metakeywords", "metarobots", "metaimage",
    "seotitle", "seodescription", "pagetitle",
    "ogtitle", "ogdescription", "ogimage", "ogurl", "ogtype",
    "twittercard", "twittertitle", "twitterdescription", "twitterimage",
    "canonical", "canonicalurl", "robots", "keywords", "noindex", "nofollow",
    "jsonld", "structureddata", "schema",
]);

const ID_EXACT = new Set(["id", "_id", "uid", "_uid", "uuid", "guid", "key", "_key"]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ""); // "Meta title" -> "metatitle"

/** A field path the mapper and live editor should hide. `path` is a dot/array path
 *  whose last segment is the field name (e.g. "SEO.Meta title", "items.0.id"). */
export function isHiddenFieldPath(path: string): boolean {
    const segs = path.split(".");
    // Inside any metadata container (SEO / Open Graph / meta / …) → hidden.
    if (segs.some((s) => META_CONTAINER.has(norm(s)))) return true;

    const leaf = (segs[segs.length - 1] ?? "").trim();
    const nleaf = norm(leaf);
    if (META_LEAF.has(nleaf)) return true;
    // camelCase / snake_case meta leaf: metaTitle, meta_description (not "metal").
    if (/^meta[A-Z_]/.test(leaf)) return true;
    // Page-level Title only (top-level, no dot); keep nested content headings.
    if (nleaf === "title" && !path.includes(".")) return true;
    // Identifiers: exact (id, uuid, _key…) or camelCase / underscored suffix
    // (userId, blockUuid, item_key) — but not innocent words like "grid" or "valid".
    if (ID_EXACT.has(leaf.toLowerCase())) return true;
    if (/(id|uuid|guid|key)$/i.test(leaf) && /[A-Z_]/.test(leaf)) return true;
    return false;
}
