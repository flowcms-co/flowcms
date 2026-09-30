import { api } from "@/lib/api";

/** Filters understood by GET /entries/page. Lists are comma-separated. */
export type EntryPageQuery = {
    q?: string;
    typeId?: string;
    /** Database statuses, e.g. "DRAFT,ARCHIVED". */
    status?: string;
    /** A user id, "me", or "none" for unassigned. */
    author?: string;
    locale?: string;
    ids?: string;
    /** ISO dates: entries scheduled (else published) in [from, to). */
    from?: string;
    to?: string;
    /** "content" leaves out reference types. */
    scope?: "content";
    sort?: string;
    dir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
    facets?: boolean;
};

export type EntryPage<T> = {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    /** Entries per database status across the unfiltered view, plus `total`. With `facets`. */
    stats?: Record<string, number>;
    /** Everyone who has content in the unfiltered view. With `facets`. */
    authors?: { id: string; name: string }[];
};

/** One page of entries. The server searches, filters, sorts and pages, so this costs
 *  the same in a workspace of fifty entries or fifty thousand. */
export function fetchEntryPage<T>(query: EntryPageQuery = {}): Promise<EntryPage<T>> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === "" || v === false) continue;
        qs.set(k, v === true ? "1" : String(v));
    }
    return api<EntryPage<T>>(`/entries/page?${qs.toString()}`);
}

/** The id of every entry matching `query` (paging and sorting are ignored), for
 *  "select all" across pages. */
export function fetchEntryIds(query: EntryPageQuery = {}): Promise<string[]> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === "" || typeof v === "boolean" || k === "page" || k === "pageSize") continue;
        qs.set(k, String(v));
    }
    return api<{ ids: string[] }>(`/entries/page/ids?${qs.toString()}`).then((r) => r.ids);
}

/**
 * Entries WITH their bodies, newest first, for screens that read page text
 * (quality scans, the originality corpus). Bodies are heavy, so the set is capped
 * at `max`; `total` says how many matched so the screen can say what it covered.
 * `onProgress` fires after each batch of up to 500.
 */
export async function fetchEntryBodies<T extends { id: string }>(
    query: { status?: string; typeId?: string },
    max: number,
    onProgress?: (loaded: number, total: number) => void,
): Promise<{ items: T[]; total: number }> {
    const { total } = await fetchEntryPage<T>({ ...query, pageSize: 1 });
    const items: T[] = [];
    const want = Math.min(max, total);
    while (items.length < want) {
        const qs = new URLSearchParams({ limit: String(Math.min(PAGE, want - items.length)), offset: String(items.length) });
        for (const [k, v] of Object.entries(query)) if (v) qs.set(k, v);
        const rows = await api<T[]>(`/entries?${qs.toString()}`);
        if (!rows.length) break;
        items.push(...rows);
        onProgress?.(items.length, total);
    }
    return { items, total };
}

const PAGE = 500; // the API's largest page
const MAX_PAGES = 40; // 20,000 rows: a runaway guard for screens that want a whole set

/**
 * Every entry matching `query`, for screens that lay out a bounded set at once (the
 * publish queue, one calendar month). Give it a filter that bounds the set; screens
 * that browse all content page through fetchEntryPage instead.
 */
export async function fetchAllEntries<T>(query: EntryPageQuery = {}): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await fetchEntryPage<T>({ ...query, page, pageSize: PAGE });
        out.push(...res.items);
        if (out.length >= res.total || res.items.length === 0) break;
    }
    return out;
}
