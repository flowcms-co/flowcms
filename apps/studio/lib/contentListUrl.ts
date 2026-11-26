/** sessionStorage key holding the last All-content list URL (filters, sort, page),
 *  written by ContentTable so the editor's back button returns to the same view. */
export const CONTENT_LIST_URL_KEY = "flowcms:content-list-url";

/** The view params a content list keeps in the URL. `tab` belongs to the Reference page, not the list. */
export const LIST_VIEW_KEYS = ["q", "type", "status", "by", "locale", "sort", "dir", "page"] as const;

/**
 * The list's URL after its view changes: only the list's own params are touched, so `tab` (and
 * anything else on the URL) survives. Defaults are left out. A locked list has no `type` filter.
 */
export function listUrl(pathname: string, search: string, view: Record<(typeof LIST_VIEW_KEYS)[number], string>, defaults: Partial<Record<keyof typeof view, string>>, locked: boolean): string {
    const params = new URLSearchParams(search);
    for (const k of LIST_VIEW_KEYS) {
        const v = locked && k === "type" ? "" : view[k];
        if (v && v !== (defaults[k] ?? "")) params.set(k, v);
        else params.delete(k);
    }
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
}

/** Scroll position of a list, saved per list URL when a row is opened and restored once on the way back. */
export const CONTENT_SCROLL_KEY = "flowcms:content-list-scroll";
