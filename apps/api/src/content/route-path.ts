/**
 * Maps a content type + entry slug to the path the entry lives at on the public
 * site. The prefix is the content type's own identifier, so naming a type
 * "services" serves its entries at `/services/<slug>`, "blogs" at `/blogs/<slug>`,
 * and so on (model each site section as its own type). A type named
 * home / homepage / index is the site root: its entry is served at `/` with no
 * slug appended. Shared by the delivery API, outbound webhooks and the
 * live-preview URL builder so every surface agrees on the path.
 *
 * The prefix comes from `apiId` (the slugified type name), not the auto-derived
 * `pluralApiId`: users name a type after the URL segment they want (e.g. "blogs"),
 * and the auto-pluraliser would otherwise double it ("blogs" -> "blogss").
 */

type TypeIds = { apiId?: string | null; pluralApiId?: string | null; name?: string | null };

/** Content-type identifiers that resolve to the site root (no slug appended).
 *  Deliberately excludes "landing": "Landing Page" is a common *collection* type,
 *  and routing every entry in it to "/" would be wrong. Stick to unambiguous
 *  homepage names. */
const HOME_IDS = new Set(["home", "homepage", "index", "root", "frontpage", "front-page"]);

const slugify = (s: string): string =>
    s
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

/** Whether a content type represents the site homepage (root, slug-less). */
export function isHomeType(t: TypeIds): boolean {
    return [t.apiId, t.pluralApiId, t.name]
        .filter(Boolean)
        .map((s) => slugify(String(s)))
        .some((s) => HOME_IDS.has(s));
}

/** The URL path segment a type's entries live under (e.g. "services", "blogs"),
 *  or "" for the homepage type. Taken from the type's apiId / name. */
export function routePrefixForType(t: TypeIds): string {
    if (isHomeType(t)) return "";
    return slugify(String(t.apiId || t.name || t.pluralApiId || ""));
}

/** The site-relative path for an entry: "/services/<slug>", "/" (homepage), or
 *  "/<slug>" when the type has no resolvable prefix. */
export function entryPath(t: TypeIds, slug?: string | null): string {
    if (isHomeType(t)) return "/";
    const prefix = routePrefixForType(t);
    const s = (slug ?? "").replace(/^\/+/, "");
    if (!prefix) return s ? `/${s}` : "/";
    return s ? `/${prefix}/${s}` : `/${prefix}`;
}

/** Join a site base URL (e.g. https://example.com) with an entry's site path.
 *  Trailing slashes on the base are trimmed; the homepage resolves to the base. */
export function entryUrl(base: string, t: TypeIds, slug?: string | null): string {
    const root = base.replace(/\/+$/, "");
    const path = entryPath(t, slug);
    return path === "/" ? root || "/" : `${root}${path}`;
}
