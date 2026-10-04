/** Pure period math for the analytics overview and the daily sync schedule. */

export const DAY_MS = 86_400_000;
/** Days of history each sync pulls; the studio caps its period options at this. */
export const SYNC_DAYS = 90;

export type Snap = { source: string; metric: string; dimension: string | null; dimensionValue: string | null; value: number; date: Date };
type Pt = { date: string; value: number };
export type Totals = { clicks: number; impressions: number; ctr: number; position: number; sessions: number; pageviews: number };

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const sum = (rows: { value: number }[]) => rows.reduce((a, b) => a + b.value, 0);

/** Totals for one window. CTR is clicks / impressions and position is weighted by
 *  impressions, so a 2-impression day can't move the average like a 2,000 one. */
export function totalsOf(s: Record<"clicks" | "impressions" | "position" | "sessions" | "pageviews", Pt[]>): Totals {
    const clicks = sum(s.clicks);
    const impressions = sum(s.impressions);
    const impByDate = new Map(s.impressions.map((p) => [p.date, p.value]));
    const weighted = s.position.reduce((a, p) => a + p.value * (impByDate.get(p.date) ?? 0), 0);
    const position = impressions > 0 ? weighted / impressions : s.position.length ? sum(s.position) / s.position.length : 0;
    return { clicks, impressions, ctr: impressions > 0 ? (clicks / impressions) * 100 : 0, position, sessions: sum(s.sessions), pageviews: sum(s.pageviews) };
}

/**
 * The selected period and the equal period before it, per source. Each source's
 * window ends on its own latest synced day (Search Console lags a few days behind
 * GA4), so both periods cover the same number of calendar days. `previous` is null
 * when the earlier period has no rows (nothing to compare against).
 */
export function buildOverview(snaps: Snap[], days: number) {
    const daily = (source: string, metric: string) =>
        snaps
            .filter((s) => s.source === source && s.metric === metric && !s.dimension)
            .sort((a, b) => a.date.getTime() - b.date.getTime());
    const endOf = (rows: Snap[]) => (rows.length ? rows[rows.length - 1].date.getTime() : null);
    const ends = { gsc: endOf(daily("gsc", "clicks")), ga4: endOf(daily("ga4", "sessions")) };
    if (ends.gsc == null && ends.ga4 == null) return null;

    const slice = (source: "gsc" | "ga4", metric: string, back: number): Pt[] => {
        const end = ends[source];
        if (end == null) return [];
        const hi = end - back * days * DAY_MS;
        const lo = hi - days * DAY_MS;
        return daily(source, metric)
            .filter((s) => s.date.getTime() > lo && s.date.getTime() <= hi)
            .map((s) => ({ date: ymd(s.date), value: s.value }));
    };
    const window = (back: number) => ({
        clicks: slice("gsc", "clicks", back),
        impressions: slice("gsc", "impressions", back),
        position: slice("gsc", "position", back),
        sessions: slice("ga4", "sessions", back),
        pageviews: slice("ga4", "pageviews", back),
    });
    const cur = window(0);
    const prev = window(1);
    const hasPrev = Object.values(prev).some((a) => a.length > 0);
    const top = (dimension: string) =>
        snaps
            .filter((s) => s.source === "gsc" && s.dimension === dimension && s.metric === "clicks")
            .sort((a, b) => b.value - a.value)
            .slice(0, 10)
            .map((s) => ({ label: s.dimensionValue ?? "", clicks: s.value }));

    return {
        totals: totalsOf(cur),
        previous: hasPrev ? totalsOf(prev) : null,
        series: { clicks: cur.clicks, impressions: cur.impressions, sessions: cur.sessions },
        asOf: { gsc: ends.gsc != null ? ymd(new Date(ends.gsc)) : null, ga4: ends.ga4 != null ? ymd(new Date(ends.ga4)) : null },
        topQueries: top("query"),
        topPages: top("page"),
    };
}

/** Whether a source is due for its daily sync (never synced, or 24h+ ago). */
export function isSyncDue(lastSyncAt: string | Date | null | undefined, now: number): boolean {
    if (!lastSyncAt) return true;
    const t = new Date(lastSyncAt).getTime();
    return Number.isNaN(t) || now - t >= DAY_MS;
}
