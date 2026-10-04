/**
 * Polite fetching of a customer's live site: a per-host rate gate (one request
 * every `intervalMs`), with back-off when the host says slow down (429 / 5xx,
 * honouring Retry-After). Time is injected so the behaviour is testable without
 * waiting. Pure: no Nest/Prisma/network.
 */

export type Clock = { now(): number; sleep(ms: number): Promise<void> };
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Default crawl rate: one request per second per host. */
export const DEFAULT_RPS = 1;
/** A workspace's requests-per-second setting, clamped to a sane range. */
export const clampRps = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(10, Math.max(0.1, n)) : DEFAULT_RPS;
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

const BACKOFF_BASE_MS = 5_000;
/** Longest single pause. A host asking for more than this is left for a later run. */
export const MAX_PAUSE_MS = 10 * 60_000;

export class HostGate {
    private readonly nextAt = new Map<string, number>();
    private readonly streak = new Map<string, number>();
    constructor(private readonly clock: Clock = realClock) {}

    /** Wait for this host's next free slot, and reserve the one after it. */
    async take(host: string, intervalMs: number): Promise<void> {
        const now = this.clock.now();
        const at = Math.max(now, this.nextAt.get(host) ?? 0);
        this.nextAt.set(host, at + intervalMs);
        if (at > now) await this.clock.sleep(at - now);
    }

    /** The host said slow down: hold every later request to it for Retry-After, or
     *  5s, 10s, 20s… (doubling per consecutive refusal) when it gave none. Returns
     *  the pause applied. */
    backoff(host: string, retryAfter?: number): number {
        const n = this.streak.get(host) ?? 0;
        this.streak.set(host, n + 1);
        const pause = Math.min(MAX_PAUSE_MS, retryAfter ?? BACKOFF_BASE_MS * 2 ** n);
        this.nextAt.set(host, Math.max(this.nextAt.get(host) ?? 0, this.clock.now() + pause));
        return pause;
    }

    /** A normal response: the back-off streak is over. */
    ok(host: string): void {
        this.streak.delete(host);
    }
}

/** One request through the gate: wait for the slot, fetch, and tell the gate how it
 *  went so the next request to that host is spaced or held accordingly. */
export async function politeRequest<T extends { status: number; retryAfter?: number }>(gate: HostGate, host: string, intervalMs: number, doFetch: () => Promise<T>): Promise<T> {
    await gate.take(host, intervalMs);
    const res = await doFetch();
    if (res.status === 429 || res.status === 503) gate.backoff(host, res.retryAfter);
    else gate.ok(host);
    return res;
}
