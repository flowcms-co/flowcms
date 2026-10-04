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
