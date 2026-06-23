/**
 * Maps a content type + entry slug to the path the entry lives at on the public
 * site. The prefix is the content type's own identifier, so naming a type
 * "services" serves its entries at `/services/<slug>`, "blogs" at `/blogs/<slug>`,
 * and so on (model each site section as its own type). A type named
 * home / homepage / index is the site root: its entry is served at `/` with no
 * slug appended. Shared by the delivery API, outbound webhooks and the
 * live-preview URL builder so every surface agrees on the path.
 *
 * A content type's page type (schema.pageType, see PAGE_TYPES in the studio) takes
 * precedence over name heuristics: "home" is the slug-less root (`/`), "static"
 * types serve their entries at root-level slugs (`/about-us`, `/legal`) with no
 * prefix, and "blog" / "service" types are prefixed collections (`/<apiId>/<slug>`).
 *
 * The prefix comes from `apiId` (the slugified type name), not the auto-derived
 * `pluralApiId`: users name a type after the URL segment they want (e.g. "blogs"),
 * and the auto-pluraliser would otherwise double it ("blogs" -> "blogss").
 */

type TypeIds = {
    apiId?: string | null;
    pluralApiId?: string | null;
    name?: string | null;
    /** Explicit page-type preset (column, if present) — takes precedence over the
     *  name-based heuristics below. */
    pageType?: string | null;
    /** Stored schema JSON; the page type is persisted at schema.pageType, and a
     *  reference type's custom URL template at schema.routePattern. */
    schema?: unknown;
    /** Custom URL template for a "reference" page type, e.g. "/blogs/tags/{slug}".
     *  Read from a column if present, else from schema.routePattern. */
    routePattern?: string | null;
};

/** Content-type identifiers that resolve to the site root (no slug appended).
 *  Deliberately excludes "landing": "Landing Page" is a common *collection* type,
 *  and routing every entry in it to "/" would be wrong. Stick to unambiguous
 *  homepage names. Used only for legacy types that predate the explicit page type. */
const HOME_IDS = new Set(["home", "homepage", "index", "root", "frontpage", "front-page"]);

const PAGE_TYPE_KEYS = new Set(["blog", "service", "home", "static", "reference"]);

/** The explicit page type for a content type: "blog" | "service" | "home" |
 *  "static" | "reference", or null when unset (legacy types). Read from a `pageType`
 *  column if one exists, otherwise from the persisted schema JSON (schema.pageType). */
function pageTypeOf(t: TypeIds): string | null {
    const fromCol = typeof t.pageType === "string" ? t.pageType : undefined;
    const schema = t.schema && typeof t.schema === "object" ? (t.schema as { pageType?: unknown }) : undefined;
    const fromSchema = typeof schema?.pageType === "string" ? schema.pageType : undefined;
    const pt = (fromCol ?? fromSchema)?.toLowerCase();
    return pt && PAGE_TYPE_KEYS.has(pt) ? pt : null;
}

/** Whether a type is a "reference" page (e.g. tags, cities) — a collection whose
 *  public URL is a custom template rather than the fixed /<apiId>/<slug> shape. */
export function isReferenceType(t: TypeIds): boolean {
    return pageTypeOf(t) === "reference";
}

/** The custom URL template for a reference type ("/blogs/tags/{slug}"), or "". Read
 *  from a `routePattern` column if present, else from schema.routePattern. */
function routePatternOf(t: TypeIds): string {
    const fromCol = typeof t.routePattern === "string" ? t.routePattern : undefined;
    const schema = t.schema && typeof t.schema === "object" ? (t.schema as { routePattern?: unknown }) : undefined;
    const fromSchema = typeof schema?.routePattern === "string" ? schema.routePattern : undefined;
    return (fromCol ?? fromSchema ?? "").trim();
}

/** Build a reference type's path from its template + the entry slug/locale. A
 *  template with {slug}/{locale} placeholders is filled; one without is treated as a
 *  prefix and the slug is appended. Double slashes collapse and trailing ones trim,
 *  so an empty slug yields the collection root ("/blogs/tags"). */
function buildReferencePath(pattern: string, slug?: string | null, locale?: string | null): string {
    const s = (slug ?? "").replace(/^\/+/, "");
    let p = pattern.trim();
    if (!p.startsWith("/")) p = `/${p}`;
    const map: Record<string, string> = { slug: s, locale: locale ?? "" };
    if (/\{(slug|locale)\}/.test(p)) {
        p = p.replace(/\{(\w+)\}/g, (_, k: string) => map[k] ?? "");
    } else {
        p = s ? `${p.replace(/\/+$/, "")}/${s}` : p;
    }
    p = p.replace(/\/{2,}/g, "/").replace(/(.)\/+$/, "$1");
    return p || "/";
}

const slugify = (s: string): string =>
    s
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

/** Whether a content type represents the site homepage (root, slug-less). An
 *  explicit page type wins: "home" is the root; any other preset is never the home.
 *  Legacy types (no preset) fall back to name-based detection. */
export function isHomeType(t: TypeIds): boolean {
    const pt = pageTypeOf(t);
    if (pt !== null) return pt === "home";
    return [t.apiId, t.pluralApiId, t.name]
        .filter(Boolean)
        .map((s) => slugify(String(s)))
        .some((s) => HOME_IDS.has(s));
}

/** Whether a type's entries live at root-level slugs (/about-us, /legal) with no
 *  type prefix — i.e. a "static" page collection. */
export function isRootSlugType(t: TypeIds): boolean {
    return pageTypeOf(t) === "static";
}

/** The URL path segment a type's entries live under (e.g. "services", "blogs"), or
 *  "" for the homepage and for static (root-slug) types. Taken from the type's
 *  apiId / name. */
export function routePrefixForType(t: TypeIds): string {
    if (isHomeType(t) || isRootSlugType(t)) return "";
    // A reference type's prefix is the static part of its template (before {slug}).
    if (isReferenceType(t)) {
        const pattern = routePatternOf(t);
        if (pattern) return pattern.split("{")[0].replace(/^\/+|\/+$/g, "");
    }
    return slugify(String(t.apiId || t.name || t.pluralApiId || ""));
}

/** The site-relative path for an entry: "/services/<slug>", "/" (homepage),
 *  "/<slug>" (static), or a reference type's custom template path
 *  ("/blogs/tags/common-problems"). A reference type with no template falls back to
 *  the prefixed-collection shape so it's never broken. */
export function entryPath(t: TypeIds, slug?: string | null, opts?: { locale?: string | null }): string {
    if (isHomeType(t)) return "/";
    if (isReferenceType(t)) {
        const pattern = routePatternOf(t);
        if (pattern) return buildReferencePath(pattern, slug, opts?.locale);
    }
    const prefix = routePrefixForType(t);
    const s = (slug ?? "").replace(/^\/+/, "");
    if (!prefix) return s ? `/${s}` : "/";
    return s ? `/${prefix}/${s}` : `/${prefix}`;
}

/** Join a site base URL (e.g. https://example.com) with an entry's site path.
 *  Trailing slashes on the base are trimmed; the homepage resolves to the base. */
export function entryUrl(base: string, t: TypeIds, slug?: string | null, opts?: { locale?: string | null }): string {
    const root = base.replace(/\/+$/, "");
    const path = entryPath(t, slug, opts);
    return path === "/" ? root || "/" : `${root}${path}`;
}
