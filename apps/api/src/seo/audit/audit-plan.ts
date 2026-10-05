/**
 * Deciding what an audit run has to fetch. The live site is requested at a polite
 * rate, so the way to scale is to fetch fewer pages: only those whose inputs
 * changed, a rotating sample of a large page type, and the pages that can rank
 * first. Pure: no Nest/Prisma/network.
 */
import type { LiveFacts } from "./audit-engine";

export type RunMode = "changed" | "full" | "sample";
/** A page type with more pages than this to fetch is checked by sample. */
export const SAMPLE_OVER = 200;
/** Pages fetched per sampled type per run (the stalest ones, so it rotates). */
export const SAMPLE_SIZE = 50;

export type PlanPage = { id: string; path: string; typeId: string; changedAt: Date; publishedAt: Date | null };
export type PlanRow = { fetchedAt: Date | null; noindex?: boolean; notChecked?: boolean; inferred?: boolean };
export type Action = "fetch" | "reuse" | "infer";

/** Whether a page must be requested again in a "changed" run: it was never
 *  fetched, the last attempt was refused, something it is built from changed since
 *  (the entry, an entry it references, its content type, a component it uses), or
 *  the sitemap says the page changed. */
export function needsFetch(page: PlanPage, row: PlanRow | undefined, lastmod?: Date): boolean {
    if (!row?.fetchedAt || row.notChecked) return true;
    if (page.changedAt > row.fetchedAt) return true;
    return !!lastmod && lastmod > row.fetchedAt;
}

/**
 * What to do with each page:
 *  - "fetch": request the live page.
 *  - "reuse": nothing it is built from changed; re-run the checks on the stored
 *    page facts, no request.
 *  - "infer": one of many pages of a type checked by sample this run; filled in
 *    from the sample if the sample agrees, fetched if it does not.
 * `full` fetches everything. `sample` (a site deploy) treats every page as changed.
 */
export function planRun(pages: PlanPage[], rows: Map<string, PlanRow>, opts: { mode: RunMode; lastmod?: Map<string, Date>; hasSite: boolean }): Map<string, Action> {
    const out = new Map<string, Action>();
    if (!opts.hasSite) {
        // No site URL: nothing to request, every page is audited from its entry.
        for (const p of pages) out.set(p.id, "reuse");
        return out;
    }
    const byType = new Map<string, PlanPage[]>();
    for (const p of pages) {
        const fetch = opts.mode !== "changed" || needsFetch(p, rows.get(p.id), opts.lastmod?.get(p.path));
        out.set(p.id, fetch ? "fetch" : "reuse");
        if (fetch) byType.set(p.typeId, [...(byType.get(p.typeId) ?? []), p]);
    }
    if (opts.mode === "full") return out;
    const over = opts.mode === "sample" ? SAMPLE_SIZE : SAMPLE_OVER;
    for (const list of byType.values()) {
        if (list.length <= over) continue;
        // Stalest first (never fetched before anything else), so each run samples
        // different pages and the whole type gets verified over time.
        const at = (p: PlanPage) => rows.get(p.id)?.fetchedAt?.getTime() ?? 0;
        const ordered = [...list].sort((a, b) => at(a) - at(b) || (a.id < b.id ? -1 : 1));
        for (const p of ordered.slice(SAMPLE_SIZE)) out.set(p.id, "infer");
    }
    return out;
}

/** Fetch order: pages that can rank first, the most-seen of them first; pages the
 *  site keeps out of search last. Results for what matters arrive in the first minutes. */
export function fetchOrder<T extends PlanPage>(pages: T[], rows: Map<string, PlanRow>, impressions: Map<string, number>): T[] {
    const noindex = (p: T) => (rows.get(p.id)?.noindex ? 1 : 0);
    const imp = (p: T) => impressions.get(p.path) ?? 0;
    return [...pages].sort(
        (a, b) => noindex(a) - noindex(b) || imp(b) - imp(a) || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) || (a.id < b.id ? -1 : 1),
    );
}

export type Sampled = { live: LiveFacts; entryTitle: string; entryDescription: string };
/** What a consistent sample says about a page type's template. */
export type Template = {
    ldTypes: string[];
    hasCanonical: boolean;
    noindex: boolean;
    /** The rendered title is `prefix + entry title + suffix` on every sampled page. */
    title: { prefix: string; suffix: string } | null;
    /** The rendered description is the entry's own on every sampled page. */
    descriptionFromEntry: boolean;
};

/**
 * The template-level facts a sample agrees on, or null when it disagrees: pages of
 * one type that differ in which JSON-LD types they carry, whether they have a
 * canonical, whether they are noindex, or that did not all return 200. A
 * disagreeing sample proves nothing about the pages not fetched, so the caller
 * then checks every page of the type.
 */
export function templateOf(sample: Sampled[]): Template | null {
    if (!sample.length || sample.some((s) => s.live.status !== 200)) return null;
    const key = (l: LiveFacts) => `${[...l.ldTypes].sort().join(",")}|${!!l.canonical}|${l.noindex}`;
    const first = sample[0].live;
    if (sample.some((s) => key(s.live) !== key(first))) return null;

    const wrap = (s: Sampled) => {
        const i = s.entryTitle ? s.live.title.indexOf(s.entryTitle) : -1;
        return i < 0 ? null : { prefix: s.live.title.slice(0, i), suffix: s.live.title.slice(i + s.entryTitle.length) };
    };
    const w = wrap(sample[0]);
    const title = w && sample.every((s) => s.live.title === w.prefix + s.entryTitle + w.suffix) ? w : null;
    return {
        ldTypes: [...first.ldTypes].sort(),
        hasCanonical: !!first.canonical,
        noindex: first.noindex,
        title,
        descriptionFromEntry: sample.every((s) => !!s.entryDescription && s.live.description === s.entryDescription),
    };
}

/** Page facts for a page that was not fetched, inferred from its type's sample.
 *  Labelled as inferred; what the sample cannot tell (a title the template does
 *  not build from the entry) is left unknown rather than guessed. */
export function inferLive(t: Template, page: { entryTitle: string; entryDescription: string; url: string }, sample: { size: number; total: number }): LiveFacts {
    return {
        status: 200,
        title: t.title ? t.title.prefix + page.entryTitle + t.title.suffix : page.entryTitle,
        titleUnknown: !t.title,
        description: t.descriptionFromEntry ? page.entryDescription : "",
        descriptionUnknown: !t.descriptionFromEntry,
        canonical: t.hasCanonical ? page.url : "",
        noindex: t.noindex,
        ldTypes: t.ldTypes,
        inferred: { sample: sample.size, total: sample.total },
    };
}

/** Roughly how long fetching `n` pages takes at `rps` requests per second. */
export const estimateSeconds = (n: number, rps: number) => Math.ceil(n / Math.max(rps, 0.1));
