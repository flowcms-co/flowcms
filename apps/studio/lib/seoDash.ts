import { syncAge, type AnalyticsStatus } from "./trafficMath";

/** One set of thresholds for the SEO score label, used by every card that shows it
 *  (the home SEO Health card and the SEO tab used to disagree at 78). */
export const ratingOf = (s: number): { label: string; color: string } =>
    s >= 90 ? { label: "Excellent", color: "#00B894" } : s >= 75 ? { label: "Good", color: "#00B894" } : s >= 50 ? { label: "Fair", color: "#F5A623" } : { label: "Needs work", color: "#E24B4A" };

export type Vital = { metric: string; value: string; target: string; status: string; source?: string; scored?: boolean };
export type SpeedDetail = { url?: string; strategy?: string; performance: number | null; metrics: Vital[] };
export type ScorePillar = { key: string; label: string; source: string; weight: number; score: number | null; live: boolean; note?: string; detail?: SpeedDetail | null };

/** What a pillar row shows. A pillar with no data is a dash with the reason, never 0. */
export const pillarText = (p: Pick<ScorePillar, "score" | "note">): { value: string; note: string | null } =>
    p.score == null ? { value: "—", note: p.note ?? "No data yet" } : { value: String(p.score), note: null };

/** One line explaining the Speed number: which page, which device, and that it is
 *  the Core Web Vitals rating, with the Lighthouse score beside it. */
export function speedExplainer(d: SpeedDetail | null | undefined): string | null {
    if (!d) return null;
    const where = [d.url?.replace(/^https?:\/\//, ""), d.strategy].filter(Boolean).join(", ");
    const lh = d.performance != null ? ` Lighthouse performance: ${d.performance}.` : "";
    return `Average of the Core Web Vitals ratings (good 100, needs work 60, poor 25)${where ? ` for ${where}` : ""}.${lh}`;
}

type IssueGroup = { severity: "high" | "med" | "low"; count: number };

/** Critical and warning totals from the Optimizer's own issue set, so the home card
 *  and the Optimizer always agree (dismissed findings included). */
export const issueCounts = (groups: IssueGroup[]): { critical: number; warnings: number } => ({
    critical: groups.filter((g) => g.severity === "high").reduce((s, g) => s + g.count, 0),
    warnings: groups.filter((g) => g.severity === "med").reduce((s, g) => s + g.count, 0),
});

export type ConnectorsStatus = { site?: string | null; pagespeed?: { connected?: boolean; needsKey?: boolean; lastRun?: string | null } };

/** The footer's data sources, from what is actually connected and when it last ran. */
export function dataSources(status: AnalyticsStatus | null, connectors: ConnectorsStatus | null, now = Date.now()): { label: string; state: string; on: boolean }[] {
    const analytics = (s: AnalyticsStatus["gsc"]) =>
        !s?.connected ? { state: s?.status === "ERROR" ? "connection failed" : "not connected", on: false } : { state: s.lastSync ? `synced ${syncAge(s.lastSync, now)}` : "not synced yet", on: !!s.lastSync };
    const site = connectors?.site ?? null;
    const ps = connectors?.pagespeed;
    return [
        { label: "Google Search Console", ...analytics(status?.gsc) },
        { label: "GA4", ...analytics(status?.ga4) },
        {
            label: "PageSpeed Insights",
            ...(!site ? { state: "no site URL", on: false } : ps?.needsKey ? { state: "needs an API key", on: false } : ps?.lastRun ? { state: `ran ${syncAge(ps.lastRun, now)}`, on: true } : { state: "not run yet", on: false }),
        },
        { label: "Site Crawler", ...(site ? { state: site.replace(/^https?:\/\//, ""), on: true } : { state: "no site URL", on: false }) },
    ];
}

/** Why the SEO score is missing, and where to go to fix it. "Run a scan" is only
 *  offered when a scan can actually produce a score. */
export function scoreCta(site: string | null | undefined, forbidden: boolean): { title: string; description: string; label?: string; href?: string } {
    if (forbidden) return { title: "No access", description: "You don't have access to this data." };
    if (!site) return { title: "Set your site URL", description: "The SEO score comes from a crawl of your live site, PageSpeed and Search Console. Add the site URL to start.", label: "Open settings", href: "/settings/workspace" };
    return { title: "No SEO score yet", description: "The first crawl and PageSpeed run are in progress or could not reach the site.", label: "Open the SEO dashboard", href: "/seo" };
}

export type Coverage = { checked: number; total: number; capped: boolean; by: "impressions" | "recency" };

/** "Checked N of M pages" for a check that does not look at every page, or null when
 *  it covered them all. Shown wherever that check's results appear, so a partial
 *  result is never read as a clean bill of health. */
export function coverageNote(what: string, c: Pick<Coverage, "checked" | "total"> & Partial<Coverage> | null | undefined): string | null {
    if (!c || !(c.total > c.checked)) return null;
    const how = c.by === "impressions" ? ", the pages with the most search impressions" : c.by === "recency" ? ", the most recently published" : "";
    return `${what}: checked ${c.checked.toLocaleString("en-US")} of ${c.total.toLocaleString("en-US")} pages${how}. The rest were not checked.`;
}

/** Schema Builder prompt: a type has a URL pattern (so its entries have pages) but
 *  the page flag is off, so the SEO audit would skip it. */
export const needsPageFlag = (t: { routePattern?: string | null; isPage?: boolean; pageType?: string }): boolean =>
    t.pageType !== "home" && !!t.routePattern?.trim() && t.isPage === false;

/** The page flag to store on save: the switch value once someone has set it by hand;
 *  otherwise nothing, so the type keeps following the default (and adding a URL
 *  pattern to a reference type turns it on). */
export const storedPageFlag = (t: { isPage?: boolean; isPageSet?: boolean }): boolean | undefined => (t.isPageSet ? t.isPage : undefined);

// ─── Audit runs, freshness and what was not verified ────────────────────────

export type RunState = { done: number; total: number; startedAt: string; mode?: string; paused?: boolean };
export type AuditPlan = { mode: string; total: number; toFetch: number; reuse: number; sampled: number; rps: number; maxRps: number; estimatedSeconds: number; live: boolean };
export type Freshness = { live: boolean; oldestFetchedAt: string | null; neverFetched: number; recheckDays: number; sampledTypes: { name: string; verified: number; total: number }[] };

const n = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

/** "about 25 minutes", "about 3 hours", "under a minute". */
export function duration(seconds: number): string {
    if (seconds < 60) return "under a minute";
    const m = Math.round(seconds / 60);
    if (m < 90) return `about ${plural(m, "minute")}`;
    const h = Math.round(seconds / 3600);
    return h < 48 ? `about ${plural(h, "hour")}` : `about ${plural(Math.round(h / 24), "day")}`;
}

/** What a run will do, shown before it starts. */
export function planSummary(p: AuditPlan): string {
    if (!p.live) return `${plural(p.total, "page")} will be audited from their content. Set the site URL in Settings to check the live pages too.`;
    if (p.toFetch === 0) return `Nothing has changed since the last check, so no pages will be fetched from your site. ${plural(p.total, "page")} will be re-checked from what was last fetched.`;
    const sampled = p.sampled ? ` ${plural(p.sampled, "page")} of large page types will be filled in from a sample, and fetched if the sample disagrees.` : "";
    return `${plural(p.toFetch, "page")} of ${n(p.total)} will be fetched from your site, ${duration(p.estimatedSeconds)} at the current ${p.rps} per second (it speeds up to ${p.maxRps} per second if the site allows, and slows down if it objects).${sampled} You can pause or cancel at any time.`;
}

/** The line shown while a run is in progress. */
export const runBanner = (r: RunState | null | undefined): string | null =>
    r ? `${r.paused ? "Audit paused" : "Audit in progress"}, ${n(r.done)} of ${n(r.total)} pages fetched. Results appear as pages are checked; pages not reached yet are left out.` : null;

/** "today", "3 days ago". */
export function daysAgo(iso: string, now = Date.now()): string {
    const d = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
    return d <= 0 ? "today" : `${plural(d, "day")} ago`;
}

/** Per-page freshness label: every page says when it was last fetched, and an
 *  inferred result says so. */
export function checkedLabel(p: { fetchedAt?: string | null; inferred?: boolean }, now = Date.now()): string | null {
    if (p.inferred) return "Inferred from a sample, not fetched";
    return p.fetchedAt ? `Last fetched ${daysAgo(p.fetchedAt, now)}` : null;
}

/** Everything the audit did not verify or deliberately left out, in plain lines.
 *  Shown on the Optimizer so a partial picture is never read as a clean one. */
export function auditNotes(
    d: {
        counts: { notChecked?: number; noindexed?: number; inferred?: number };
        coverage?: { duplicates: Coverage; links: Coverage };
        nonPageTypes?: { name: string; published: number; hasPattern: boolean }[];
        freshness?: Freshness;
    } | null,
    now = Date.now(),
): string[] {
    if (!d) return [];
    const { notChecked = 0, noindexed = 0, inferred = 0 } = d.counts;
    const f = d.freshness;
    return [
        f?.live && f.oldestFetchedAt ? `Oldest live check: ${daysAgo(f.oldestFetchedAt, now)}. Every page is re-checked in the background within ${plural(f.recheckDays, "day")}.` : null,
        notChecked > 0 ? `${plural(notChecked, "page")} not checked: the site answered "too many requests" or a server error. Not counted as clean; they will be retried.` : null,
        inferred > 0 ? `${plural(inferred, "page")} not fetched yet: their results are inferred from a sample of the same page type and are not counted as clean.` : null,
        ...(f?.sampledTypes ?? []).map((t) => `${t.name}: verified on ${n(t.verified)} of ${n(t.total)} pages. The rest are inferred from that sample until the background check reaches them.`),
        noindexed > 0 ? `${plural(noindexed, "page")} hidden from search (noindex). Not counted as issues, and left out of the title, description, readability, schema, duplicate and cannibalization checks.` : null,
        coverageNote("Duplicate content", d.coverage?.duplicates),
        coverageNote("Internal links", d.coverage?.links),
        ...(d.nonPageTypes ?? []).map((t) => `${t.name}: ${plural(t.published, "published entry is", "published entries are")} not audited because the type is not marked as pages${t.hasPattern ? " (it has a URL pattern, so this may be a mistake)" : ""}.`),
    ].filter((x): x is string => !!x);
}
