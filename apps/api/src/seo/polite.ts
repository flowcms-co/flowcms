/**
 * Polite fetching of a customer's live site: a per-host gate whose rate adapts to
 * the site. It starts at the workspace's configured rate and climbs slowly while
 * responses stay healthy. Most limits are per-minute windows that give no warning
 * until they are spent, so the first refusal teaches the gate where the limit is:
 * it remembers a ceiling below that rate and never probes past it again. It
 * honours Retry-After and advertised RateLimit headers, and never exceeds the
 * workspace maximum. Time is injected so the behaviour is testable without waiting.
 * Pure: no Nest/Prisma/network.
 */

export type Clock = { now(): number; sleep(ms: number): Promise<void> };
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** How a site may be requested. */
export type Rate = {
    /** Requests per second a host starts at. */
    start: number;
    /** The most it may ever be sent. */
    max: number;
    /** Ceilings learned on earlier runs, by host: start below them, don't probe again. */
    learned?: Record<string, number>;
    /** Called when a host's ceiling is learned or lowered, so it can be stored. */
    onLearn?: (host: string, rps: number) => void;
    /** Changes when what was learned no longer applies (a new maximum, a different
     *  fetch path): the host's learned state is then dropped. */
    epoch?: string;
    /** Checked while waiting: true abandons the wait (a cancelled run). */
    stop?: () => boolean | Promise<boolean>;
    /** Secret path prefix live fetches go through (see fetchTarget). Never logged. */
    prefix?: string;
};
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

/** A wait was abandoned because the run was cancelled. */
export class Stopped extends Error {
    constructor() {
        super("stopped");
    }
}

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

/** Most limits count requests per minute: wait one window out when the site gives
 *  no Retry-After, and go a full window without a refusal before speeding up. */
export const WINDOW_MS = 60_000;
/** Refusals this close together are one event: the requests already in flight
 *  when the window ran out. One halving, one pause. */
const EVENT_MS = 10_000;
/** Longest single pause. A host asking for more than this is left for a later run. */
export const MAX_PAUSE_MS = 10 * 60_000;
/** Speed up by 10% after this many healthy responses in a row. */
const STEP = 1.1;
const STEP_EVERY = 30;
/** After a refusal at rate r, never go above this share of r again. */
const CEILING = 0.7;
/** How often a wait checks whether the run was cancelled. */
const SLICE_MS = 500;

type HostState = { nextAt: number; rps?: number; healthy: number; ceiling?: number; refusedAt?: number; pausedUntil?: number; epoch?: string };

export class HostGate {
    private readonly hosts = new Map<string, HostState>();
    constructor(private readonly clock: Clock = realClock) {}

    private state(host: string, rate: Rate): HostState {
        let s = this.hosts.get(host);
        // A new maximum or fetch path: what was learned about this host is void.
        if (!s || s.epoch !== rate.epoch) this.hosts.set(host, (s = { nextAt: 0, healthy: 0, epoch: rate.epoch }));
        return s;
    }

    /** The ceiling learned for a host (this run or an earlier one), if any. */
    ceilingOf(host: string, rate: Rate = DEFAULT_RATE): number | undefined {
        return this.state(host, rate).ceiling ?? rate.learned?.[host];
    }

    /** The rate currently used for a host. */
    rateOf(host: string, rate: Rate = DEFAULT_RATE): number {
        const cap = Math.min(rate.max, this.ceilingOf(host, rate) ?? Infinity);
        return Math.max(MIN_RPS, Math.min(cap, this.state(host, rate).rps ?? rate.start));
    }

    /** When requests to this host resume, while it is being held after a refusal. */
    pausedUntil(host: string, rate: Rate = DEFAULT_RATE): number | null {
        const until = this.state(host, rate).pausedUntil ?? 0;
        return until > this.clock.now() ? until : null;
    }

    /** Wait for this host's next free slot, and reserve the one after it. The wait
     *  is taken in short slices, so a cancelled run stops within a second even in
     *  the middle of a long pause (throws Stopped). */
    async take(host: string, rate: Rate = DEFAULT_RATE): Promise<void> {
        const s = this.state(host, rate);
        const now = this.clock.now();
        const at = Math.max(now, s.nextAt);
        s.nextAt = at + 1000 / this.rateOf(host, rate);
        for (let left = at - now; left > 0; left = at - this.clock.now()) {
            if (await rate.stop?.()) throw new Stopped();
            await this.clock.sleep(Math.min(SLICE_MS, left));
        }
        if (await rate.stop?.()) throw new Stopped();
    }

    /** The host said slow down. The first refusal of an event halves the rate,
     *  sets the ceiling to 70% of the rate that was refused, and holds every later
     *  request for Retry-After, or for one window when it gave none. Further
     *  refusals within the same few seconds are the same event: they only extend
     *  the hold if the site asks for longer. Returns the pause applied. */
    backoff(host: string, retryAfter?: number, rate: Rate = DEFAULT_RATE): number {
        const s = this.state(host, rate);
        const now = this.clock.now();
        const pause = Math.min(MAX_PAUSE_MS, retryAfter ?? WINDOW_MS);
        const sameEvent = s.refusedAt !== undefined && now - s.refusedAt < EVENT_MS;
        if (!sameEvent) {
            const refused = this.rateOf(host, rate);
            s.refusedAt = now;
            s.healthy = 0;
            s.ceiling = Math.max(MIN_RPS, Math.min(this.ceilingOf(host, rate) ?? Infinity, refused * CEILING));
            s.rps = Math.max(MIN_RPS, refused / 2);
            rate.onLearn?.(host, s.ceiling);
        }
        s.pausedUntil = Math.max(s.pausedUntil ?? 0, now + pause);
        s.nextAt = Math.max(s.nextAt, s.pausedUntil);
        return pause;
    }

    /** A healthy response. After enough of them in a row, and a full window since
     *  the last refusal, the rate steps up 10%: never past the learned ceiling or
     *  the workspace maximum. */
    ok(host: string, rate: Rate = DEFAULT_RATE): void {
        const s = this.state(host, rate);
        if (++s.healthy % STEP_EVERY !== 0) return;
        if (s.refusedAt !== undefined && this.clock.now() - s.refusedAt < WINDOW_MS) return;
        s.rps = this.rateOf(host, rate) * STEP;
    }

    /** Stay under what the site advertises: spread the remaining requests over the
     *  time until the window resets (with headroom), or wait for the reset when
     *  none are left. */
    limit(host: string, rl: RateLimit, rate: Rate = DEFAULT_RATE): void {
        const s = this.state(host, rate);
        if (rl.remaining <= 0) {
            s.pausedUntil = Math.max(s.pausedUntil ?? 0, this.clock.now() + Math.min(MAX_PAUSE_MS, rl.resetMs));
            s.nextAt = Math.max(s.nextAt, s.pausedUntil);
            return;
        }
        if (rl.resetMs <= 0) return;
        const ceiling = (rl.remaining / (rl.resetMs / 1000)) * 0.8;
        if (ceiling < this.rateOf(host, rate)) s.rps = Math.max(MIN_RPS, ceiling);
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

// ─── Audit fetch prefix ─────────────────────────────────────────────────────

/** A valid audit fetch prefix: starts with "/", path characters only, no trailing
 *  slash, no query string, fragment or whitespace. */
export const isFetchPrefix = (v: string) => /^(\/[A-Za-z0-9._~-]+)+$/.test(v);

/** What to show for a stored prefix: its first segment, with the key masked. */
export const maskPrefix = (prefix: string) => `/${prefix.split("/")[1] ?? ""}/••••`;

/**
 * The URL actually requested for a page: `origin + prefix + path + query`. Some
 * hosts can only exempt a path from their visitor rate limit, not a client, so the
 * site serves the same pages under a keyed path. The page's identity everywhere
 * else stays its real URL.
 */
export function fetchTarget(realUrl: string, prefix?: string): string {
    if (!prefix) return realUrl;
    const u = new URL(realUrl);
    u.pathname = `${prefix}${u.pathname}`;
    return u.toString();
}

/** The real URL behind a URL the site answered with (a redirect Location): the
 *  prefix removed when it is there, untouched when the redirect left it. */
export function realUrl(url: string, prefix?: string): string {
    if (!prefix) return url;
    const u = new URL(url);
    if (u.pathname !== prefix && !u.pathname.startsWith(`${prefix}/`)) return url;
    u.pathname = u.pathname.slice(prefix.length) || "/";
    return u.toString();
}
