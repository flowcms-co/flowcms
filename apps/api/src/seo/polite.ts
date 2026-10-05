/**
 * Polite fetching of a customer's live site: a per-host gate whose rate adapts to
 * the site. It starts at the workspace's configured rate, speeds up gradually
 * while responses stay healthy, halves on any 429/503, honours Retry-After and
 * stays under advertised RateLimit headers, and never exceeds the workspace
 * maximum. Time is injected so the behaviour is testable without waiting.
 * Pure: no Nest/Prisma/network.
 */

export type Clock = { now(): number; sleep(ms: number): Promise<void> };
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Requests per second: where a host starts, and the most it may ever be sent. */
export type Rate = { start: number; max: number };
export const DEFAULT_RATE: Rate = { start: 1, max: 10 };
const MIN_RPS = 0.1;
/** A workspace's requests-per-second setting, clamped to a sane range. */
export const clampRps = (v: unknown, fallback = DEFAULT_RATE.start): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(10, Math.max(MIN_RPS, n)) : fallback;
};

/** A response that says "not now" rather than something about the page: rate
 *  limited, a server error, or no response at all. Never a page finding. */
export const isTransient = (status: number) => status === 429 || status >= 500 || status === 0;

/** Retry-After (seconds, or an HTTP date) as milliseconds from `now`. */
export function retryAfterMs(header: string | null | undefined, now: number): number | undefined {
    if (!header) return undefined;
    const s = Number(header);
    if (Number.isFinite(s)) return Math.max(0, s * 1000);
    const at = Date.parse(header);
    return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** What the site says it will still accept: requests left, and when that resets. */
export type RateLimit = { remaining: number; resetMs: number };

/** Read `RateLimit-*` / `X-RateLimit-*` response headers (and the combined
 *  `RateLimit: remaining=…, reset=…` form). Reset is seconds from now, or an epoch. */
export function rateLimitOf(get: (name: string) => string | null | undefined, now: number): RateLimit | undefined {
    const combined = get("ratelimit") ?? "";
    const pick = (name: string) => get(`ratelimit-${name}`) ?? get(`x-ratelimit-${name}`) ?? new RegExp(`${name}=(\\d+)`).exec(combined)?.[1];
    const remaining = Number(pick("remaining"));
    const reset = Number(pick("reset"));
    if (!Number.isFinite(remaining) || !Number.isFinite(reset) || pick("remaining") == null || pick("reset") == null) return undefined;
    const resetMs = reset > 1e9 ? Math.max(0, reset * 1000 - now) : reset * 1000;
    return { remaining, resetMs };
}

const BACKOFF_BASE_MS = 5_000;
/** Longest single pause. A host asking for more than this is left for a later run. */
export const MAX_PAUSE_MS = 10 * 60_000;
/** Speed up by this much after this many healthy responses in a row. */
const STEP_RPS = 0.5;
const STEP_EVERY = 10;

export class HostGate {
    private readonly nextAt = new Map<string, number>();
    private readonly streak = new Map<string, number>();
    private readonly rps = new Map<string, number>();
    private readonly healthy = new Map<string, number>();
    constructor(private readonly clock: Clock = realClock) {}

    /** The rate currently used for a host. */
    rateOf(host: string, rate: Rate = DEFAULT_RATE): number {
        return Math.min(rate.max, this.rps.get(host) ?? Math.min(rate.start, rate.max));
    }

    /** Wait for this host's next free slot, and reserve the one after it. */
    async take(host: string, rate: Rate = DEFAULT_RATE): Promise<void> {
        const now = this.clock.now();
        const at = Math.max(now, this.nextAt.get(host) ?? 0);
        this.nextAt.set(host, at + 1000 / this.rateOf(host, rate));
        if (at > now) await this.clock.sleep(at - now);
    }

    /** The host said slow down: halve its rate and hold every later request to it
     *  for Retry-After, or 5s, 10s, 20s… (doubling per consecutive refusal) when it
     *  gave none. Returns the pause applied. */
    backoff(host: string, retryAfter?: number, rate: Rate = DEFAULT_RATE): number {
        const n = this.streak.get(host) ?? 0;
        this.streak.set(host, n + 1);
        this.healthy.set(host, 0);
        this.rps.set(host, Math.max(MIN_RPS, this.rateOf(host, rate) / 2));
        const pause = Math.min(MAX_PAUSE_MS, retryAfter ?? BACKOFF_BASE_MS * 2 ** n);
        this.nextAt.set(host, Math.max(this.nextAt.get(host) ?? 0, this.clock.now() + pause));
        return pause;
    }

    /** A healthy response: the back-off streak is over, and after enough of them in
     *  a row the rate steps up, never past the workspace maximum. */
    ok(host: string, rate: Rate = DEFAULT_RATE): void {
        this.streak.delete(host);
        const n = (this.healthy.get(host) ?? 0) + 1;
        this.healthy.set(host, n);
        if (n % STEP_EVERY === 0) this.rps.set(host, Math.min(rate.max, this.rateOf(host, rate) + STEP_RPS));
    }

    /** Stay under what the site advertises: spread the remaining requests over the
     *  time until the window resets (with headroom), or wait for the reset when
     *  none are left. */
    limit(host: string, rl: RateLimit, rate: Rate = DEFAULT_RATE): void {
        if (rl.remaining <= 0) {
            this.nextAt.set(host, Math.max(this.nextAt.get(host) ?? 0, this.clock.now() + Math.min(MAX_PAUSE_MS, rl.resetMs)));
            return;
        }
        if (rl.resetMs <= 0) return;
        const ceiling = (rl.remaining / (rl.resetMs / 1000)) * 0.8;
        if (ceiling < this.rateOf(host, rate)) this.rps.set(host, Math.max(MIN_RPS, ceiling));
    }
}

/** One request through the gate: wait for the slot, fetch, and tell the gate how it
 *  went so the next request to that host is spaced or held accordingly. */
export async function politeRequest<T extends { status: number; retryAfter?: number; rateLimit?: RateLimit }>(gate: HostGate, host: string, rate: Rate, doFetch: () => Promise<T>): Promise<T> {
    await gate.take(host, rate);
    const res = await doFetch();
    if (res.status === 429 || res.status === 503) gate.backoff(host, res.retryAfter, rate);
    else if (res.status !== 0) gate.ok(host, rate);
    if (res.rateLimit) gate.limit(host, res.rateLimit, rate);
    return res;
}
