/** Pure helpers behind the traffic cards (Search performance, This week's progress). */

export type SourceStatus = { connected?: boolean; status?: string; lastSync?: string | null; rows?: number };
export type AnalyticsStatus = { gsc?: SourceStatus; ga4?: SourceStatus };

/** Rolling periods, each within the 90 days a sync holds. */
export const PERIODS: { id: string; label: string; days: number }[] = [
    { id: "7d", label: "Last 7 days", days: 7 },
    { id: "30d", label: "Last 30 days", days: 30 },
    { id: "90d", label: "Last 90 days", days: 90 },
];

/** % change from the previous period, or null when there is nothing to compare with. */
export const pctDelta = (prev: number | null | undefined, cur: number): number | null =>
    prev != null && prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

/** Sum a daily series into at most `n` equal buckets, labelled by each bucket's first day (MM-DD). */
export function bucketSum(points: { date: string; value: number }[], n = 6): { x: string; value: number }[] {
    const size = Math.max(1, Math.ceil(points.length / n));
    const out: { x: string; value: number }[] = [];
    for (let i = 0; i < points.length; i += size) {
        out.push({ x: points[i].date.slice(5), value: points.slice(i, i + size).reduce((a, p) => a + p.value, 0) });
    }
    return out;
}

/** A Y axis that fits the data: plain numbers for small sites, K / M above that. */
export function niceScale(peak: number): { div: number; unit: string; max: number; ticks: number[] } {
    const [div, unit] = peak >= 1_000_000 ? [1_000_000, "M"] : peak >= 10_000 ? [1000, "K"] : [1, ""];
    const p = peak / div;
    const raw = p / 4; // aim for about four steps
    const mag = raw > 0 ? 10 ** Math.floor(Math.log10(raw)) : 1;
    let step = [1, 2, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? 10 * mag;
    if (div === 1) step = Math.max(1, Math.round(step)); // whole clicks, never 0.5
    const max = p > 0 ? Math.ceil(p / step) * step : 4 * step;
    return { div, unit, max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => +(i * step).toFixed(2)) };
}

const STALE_MS = 3 * 86_400_000; // the daily sync keeps data fresher than this

/** Why a traffic card has nothing (or nothing current) to show. */
export function trafficState(status: AnalyticsStatus | undefined, hasData: boolean, now = Date.now()): "ok" | "not-connected" | "no-data" | "stale" {
    const sources = [status?.gsc, status?.ga4].filter((s): s is SourceStatus => !!s && (!!s.connected || s.status === "ERROR"));
    if (!sources.length) return "not-connected";
    if (!hasData) return "no-data";
    const last = Math.max(...sources.map((s) => (s.lastSync ? new Date(s.lastSync).getTime() : 0)));
    return now - last > STALE_MS ? "stale" : "ok";
}

/** The honest badge text for a connected card with no rows. */
export function emptyReason(status: AnalyticsStatus | undefined): string {
    const { gsc, ga4 } = status ?? {};
    if (gsc?.status === "ERROR" || ga4?.status === "ERROR") return "Sync failed, check the connection";
    if (!gsc?.connected && !ga4?.connected) return "Not connected";
    if (!gsc?.lastSync && !ga4?.lastSync) return "Connected, not synced yet";
    if (ga4?.connected && !gsc?.connected) return "No GA4 hits received, check the tag is installed";
    return "Connected, no data yet (new property)";
}

/** "3 days ago" style age for a last-sync timestamp. */
export function syncAge(lastSync: string | null | undefined, now = Date.now()): string {
    if (!lastSync) return "never";
    const h = Math.floor((now - new Date(lastSync).getTime()) / 3_600_000);
    if (h < 1) return "less than an hour ago";
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    const d = Math.floor(h / 24);
    return `${d} day${d === 1 ? "" : "s"} ago`;
}
