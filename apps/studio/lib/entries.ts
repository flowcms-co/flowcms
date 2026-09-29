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
