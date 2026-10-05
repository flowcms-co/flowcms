/**
 * Pure helpers behind the SEO dashboard numbers (no Nest/Prisma/network), so the
 * period maths, the PageSpeed parsing and the crawl seeding are unit-testable.
 */

const DAY = 86_400_000;
type Daily = { date: Date; value: number };

/** Split daily rows into the last `days` days and the `days` before that. */
export function splitWindow<T extends { date: Date }>(rows: T[], days: number, now = Date.now()): { current: T[]; previous: T[] } {
    const start = now - days * DAY;
    const prevStart = start - days * DAY;
    return {
        current: rows.filter((r) => r.date.getTime() >= start),
        previous: rows.filter((r) => r.date.getTime() >= prevStart && r.date.getTime() < start),
    };
}

const sum = (a: Daily[]) => a.reduce((x, y) => x + y.value, 0);

/** Percent change vs the previous period; null when there is nothing to compare. */
export function pctChange(current: number, previous: number): number | null {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** CTR as clicks / impressions (percent), not a mean of daily CTRs. */
export const weightedCtr = (clicks: Daily[], impressions: Daily[]): number => {
    const i = sum(impressions);
    return i > 0 ? (sum(clicks) / i) * 100 : 0;
};

/** Average position weighted by each day's impressions (a day with 2 impressions
 *  should not count as much as a day with 2,000). Falls back to a plain mean. */
export function weightedPosition(position: Daily[], impressions: Daily[]): number {
    const impByDay = new Map(impressions.map((r) => [r.date.getTime(), r.value]));
    let w = 0;
    let acc = 0;
    for (const p of position) {
        const i = impByDay.get(p.date.getTime()) ?? 0;
        w += i;
        acc += p.value * i;
    }
    if (w > 0) return acc / w;
    return position.length ? sum(position) / position.length : 0;
}

// ─── PageSpeed Insights ─────────────────────────────────────────────────────

export type VitalStatus = "good" | "warning" | "poor" | "none";
export type Vital = { metric: string; value: string; target: string; status: VitalStatus; source: "field" | "lab"; scored: boolean };
export type PsiResult = {
    url: string;
    strategy: "mobile" | "desktop";
    fetchedAt: string;
    /** Lighthouse performance score, 0-100 (lab). */
    performance: number | null;
    vitals: Vital[];
    opportunities: { code: string; title: string; savingsMs: number }[];
    /** Set instead of the above when the run failed. */
    error?: string;
    needsKey?: boolean;
};

const r1 = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const bucket = (v: number, good: number, poor: number): VitalStatus => (v <= good ? "good" : v <= poor ? "warning" : "poor");

const OPP_MAP: { audits: string[]; code: string }[] = [
    { audits: ["render-blocking-resources"], code: "PERF_RENDER_BLOCKING" },
    { audits: ["uses-optimized-images", "modern-image-formats", "offscreen-images", "uses-responsive-images"], code: "PERF_IMAGE_OPT" },
    { audits: ["unminified-css", "unminified-javascript", "unused-css-rules", "unused-javascript"], code: "PERF_UNMINIFIED" },
    { audits: ["uses-text-compression"], code: "PERF_TEXT_COMPRESSION" },
    { audits: ["total-byte-weight"], code: "PERF_TOTAL_WEIGHT" },
];

/**
 * Turn a PageSpeed Insights response into our per-URL result. Field (CrUX) values
 * win; LCP and CLS fall back to the lab run. INP has no lab equivalent: without
 * field data it is reported as "No field data" and left out of the Speed score.
 * Total Blocking Time is shown as its own, clearly-labelled lab metric (not scored).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google's untyped PageSpeed response
export function parsePsi(url: string, strategy: "mobile" | "desktop", data: any, now = new Date()): PsiResult {
    const crux = data?.loadingExperience?.metrics ?? {};
    const lh = data?.lighthouseResult?.audits ?? {};
    const field = (k: string): number | undefined => crux?.[k]?.percentile;
    const perf = data?.lighthouseResult?.categories?.performance?.score;

    const vitals: Vital[] = [];
    const lcpField = field("LARGEST_CONTENTFUL_PAINT_MS");
    const lcp = lcpField ?? lh["largest-contentful-paint"]?.numericValue;
    if (lcp != null) vitals.push({ metric: "LCP", value: `${r1(lcp / 1000)}s`, target: "< 2.5s", status: bucket(lcp, 2500, 4000), source: lcpField != null ? "field" : "lab", scored: true });

    const inp = field("INTERACTION_TO_NEXT_PAINT");
    vitals.push(
        inp != null
            ? { metric: "INP", value: `${Math.round(inp)}ms`, target: "< 200ms", status: bucket(inp, 200, 500), source: "field", scored: true }
            : { metric: "INP", value: "No field data", target: "< 200ms", status: "none", source: "field", scored: false },
    );

    const clsField = field("CUMULATIVE_LAYOUT_SHIFT_SCORE");
    const cls = clsField != null ? clsField / 100 : lh["cumulative-layout-shift"]?.numericValue;
    if (cls != null) vitals.push({ metric: "CLS", value: `${r1(cls, 2)}`, target: "< 0.1", status: bucket(cls, 0.1, 0.25), source: clsField != null ? "field" : "lab", scored: true });

    const tbt = lh["total-blocking-time"]?.numericValue;
    if (tbt != null) vitals.push({ metric: "TBT (lab)", value: `${Math.round(tbt)}ms`, target: "< 200ms", status: bucket(tbt, 200, 600), source: "lab", scored: false });

    const opportunities: PsiResult["opportunities"] = [];
    for (const { audits, code } of OPP_MAP) {
        let savings = 0;
        let title = "";
        for (const a of audits) {
            const audit = lh[a];
            if (!audit) continue;
            const score = typeof audit.score === "number" ? audit.score : 1;
            const ms = audit.details?.overallSavingsMs ?? audit.numericValue ?? 0;
            if (score < 0.9 && (ms > 0 || code === "PERF_UNMINIFIED" || code === "PERF_TEXT_COMPRESSION")) {
                savings = Math.max(savings, Math.round(ms));
                title = title || (audit.title ?? "");
            }
        }
        if (title) opportunities.push({ code, title, savingsMs: savings });
    }

    return { url, strategy, fetchedAt: now.toISOString(), performance: typeof perf === "number" ? Math.round(perf * 100) : null, vitals, opportunities };
}

/** The PageSpeed Insights request URL (page URL and API key both encoded). */
export const psiUrl = (url: string, strategy: "mobile" | "desktop", key?: string) =>
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?category=performance&strategy=${strategy}&url=${encodeURIComponent(url)}${key ? `&key=${encodeURIComponent(key)}` : ""}`;

const CWV_PTS: Record<string, number> = { good: 100, warning: 60, poor: 25 };

/** The Speed pillar: mean of the Core Web Vitals buckets (good 100, needs work 60,
 *  poor 25) over the metrics that have a real measurement. Not the Lighthouse score. */
export function speedScore(vitals?: { status: string; scored?: boolean }[]): number | null {
    const scored = (vitals ?? []).filter((v) => v.scored !== false && v.status in CWV_PTS);
    return scored.length ? Math.round(scored.reduce((s, v) => s + CWV_PTS[v.status], 0) / scored.length) : null;
}

/** Plain-language reason for a missing PageSpeed result. */
export function psiReason(reason: string | undefined, needsKey?: boolean): string {
    if (needsKey) return "Google's shared PageSpeed quota is used up. Add your own PageSpeed Insights API key in Settings, Integrations.";
    if (!reason || reason === "pending") return "The first PageSpeed run is in progress.";
    if (reason === "no-site") return "Set the site URL in Settings to run PageSpeed.";
    if (reason === "psi-timeout") return "PageSpeed Insights did not answer in time.";
    const http = /^psi-(\d+)$/.exec(reason);
    if (http) return `PageSpeed Insights returned HTTP ${http[1]}.`;
    return "PageSpeed Insights could not be reached.";
}

// ─── Crawler ────────────────────────────────────────────────────────────────

/** <loc> URLs in a sitemap (or sitemap index). */
export const sitemapLocs = (xml: string): string[] =>
    [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));

/** <loc> with its <lastmod>, for URLs whose sitemap entry carries one. */
export const sitemapLastmods = (xml: string): { loc: string; lastmod: Date }[] =>
    [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].flatMap((m) => {
        const loc = sitemapLocs(m[1])[0];
        const at = Date.parse(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i.exec(m[1])?.[1] ?? "");
        return loc && !Number.isNaN(at) ? [{ loc, lastmod: new Date(at) }] : [];
    });

/** Which URLs to crawl: the homepage, then the highest-value known pages from each
 *  source in turn (Search Console, one page per content type, the sitemap, every
 *  mapped page), same host only, de-duplicated, capped. */
export function crawlSeeds(site: string, sources: string[][], max: number): string[] {
    let host: string;
    try {
        host = new URL(site).hostname;
    } catch {
        return [];
    }
    const norm = (u: string) => u.replace(/#.*$/, "").replace(/\/+$/, "") || u;
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (u: string) => {
        try {
            if (new URL(u).hostname !== host) return; // SSRF guard: same-host only
        } catch {
            return;
        }
        const k = norm(u);
        if (seen.has(k) || out.length >= max) return;
        seen.add(k);
        out.push(u);
    };
    add(site);
    // Round-robin so no single source (a 5,000-URL sitemap) crowds out the others.
    const longest = Math.max(0, ...sources.map((s) => s.length));
    for (let i = 0; i < longest && out.length < max; i++) for (const s of sources) if (i < s.length) add(s[i]);
    return out;
}

/** Share one in-flight promise per key, so concurrent callers (the score and the
 *  issues endpoints on one dashboard load) trigger the work once. */
export function singleFlight() {
    const inflight = new Map<string, Promise<unknown>>();
    return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
        const hit = inflight.get(key) as Promise<T> | undefined;
        if (hit) return hit;
        const p = fn().finally(() => inflight.delete(key));
        inflight.set(key, p);
        return p;
    };
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
    const out = new Array<R>(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) {
                const i = next++;
                out[i] = await fn(items[i], i);
            }
        }),
    );
    return out;
}

/** The last `days` days and the equal period before it. The previous period is
 *  empty when the stored history does not reach back far enough to cover it, so a
 *  half-covered period is never compared against a full one. */
export function periods<T extends { date: Date }>(rows: T[], days: number, now = Date.now()): { current: T[]; previous: T[] } {
    const { current, previous } = splitWindow(rows, days, now);
    const covered = rows.length > 0 && rows[0].date.getTime() <= now - 2 * days * DAY + DAY;
    return { current, previous: covered ? previous : [] };
}
