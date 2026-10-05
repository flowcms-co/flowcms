import { describe, expect, it } from "vitest";
import { HostGate, clampRps, isTransient, politeRequest, rateLimitOf, retryAfterMs, type Clock, type Rate } from "./polite";
import { auditSummary } from "./audit/seo-job.handlers";
import { LIVE, make, page } from "./audit/audit.harness";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Virtual time. `sleep` parks the caller until the clock reaches its wake time;
 *  `run` drives a piece of work to completion by repeatedly jumping the clock to
 *  the next sleeper. Several requests can be in flight and each still wakes at its
 *  own time, so minutes of crawling run in milliseconds and the timing is exact. */
function virtualClock() {
    const timers: { at: number; wake: () => void }[] = [];
    const c = {
        t: 0,
        now: () => c.t,
        sleep: (ms: number) => new Promise<void>((wake) => void timers.push({ at: c.t + ms, wake })),
        async run<T>(work: Promise<T>): Promise<T> {
            let settled = false;
            work.then(() => (settled = true), () => (settled = true));
            while (!settled) {
                await new Promise((r) => setImmediate(r)); // let everything runnable run
                if (settled || !timers.length) continue;
                timers.sort((a, b) => a.at - b.at);
                const next = timers.shift()!;
                c.t = Math.max(c.t, next.at);
                next.wake();
            }
            return work;
        },
    };
    return c;
}

/** A site that answers 429 with Retry-After once it has served more than its limit
 *  in the trailing 60 seconds. `limitAt` lets the limit change as the run goes on. */
function rateLimitedServer(clock: Pick<Clock, "now">, limitAt: (served: number) => number = () => 120) {
    const window: number[] = [];
    const stats = { ok: 0, refused: 0, peakPerMinute: 0, okTimes: [] as number[] };
    const hit = async () => {
        const now = clock.now();
        while (window.length && window[0] <= now - 60_000) window.shift();
        if (window.length >= limitAt(stats.ok)) {
            stats.refused++;
            return { status: 429, retryAfter: window[0] + 60_000 - now };
        }
        window.push(now);
        stats.ok++;
        stats.okTimes.push(now);
        stats.peakPerMinute = Math.max(stats.peakPerMinute, window.length);
        return { status: 200 };
    };
    return { hit, stats };
}

/** The real audit service over `n` pages, fetching through the real gate against the simulated site. */
function auditAgainst(n: number, rate: Rate, limitAt?: (served: number) => number) {
    const clock = virtualClock();
    const server = rateLimitedServer(clock, limitAt);
    const gate = new HostGate(clock);
    // Spread over small page types, so every page is fetched (no type is big enough to sample).
    const pages = Array.from({ length: n }, (_, i) => page(`p${String(i).padStart(4, "0")}`, `/p${i}`, {}, { typeId: `t${i % 10}` }));
    const h = make({ pages, site: "https://x.com", rate, live: async (_url, r) => ({ ...LIVE, ...(await politeRequest(gate, "x.com", r, server.hit)) }) });
    return { ...h, clock, server, gate };
}
const codesIn = (ledger: any[]) => new Set(ledger.flatMap((row) => (row.l1Findings ?? []).map((f: any) => f.code)));

describe("polite crawling against a site that 429s above 120 requests per minute", () => {
    it("held to 1 request per second it is never rate limited", async () => {
        const { audit, clock, server, ledger } = auditAgainst(300, { start: 1, max: 1 });
        const r = await clock.run(audit.auditWorkspace("w"));
        expect(server.stats.refused).toBe(0);
        expect(server.stats.peakPerMinute).toBeLessThanOrEqual(60);
        expect(clock.t).toBeGreaterThanOrEqual(299_000); // 300 pages took about 300 seconds
        expect(r).toMatchObject({ scanned: 300, fetched: 300, notChecked: 0 });
        expect(ledger).toHaveLength(300);
    });

    it("allowed to adapt, it speeds up, backs off on 429, resumes, and records no finding for a refused page", async () => {
        const { audit, server, ledger, gate, clock } = auditAgainst(600, { start: 1, max: 10 });
        const progress: { done: number; notChecked: number }[] = [];
        const r = await clock.run(audit.auditWorkspace("w", (p) => void progress.push(p)));
        expect(server.stats.refused).toBeGreaterThan(0); // it found the limit
        expect(server.stats.peakPerMinute).toBeLessThanOrEqual(120);
        // After honouring Retry-After every page ended up checked: none left behind.
        expect(r).toMatchObject({ scanned: 600, fetched: 600, notChecked: 0 });
        expect(progress.at(-1)).toMatchObject({ done: 600, notChecked: 0 });
        // A 429 never became a finding, and the rate ended below the maximum.
        expect(codesIn(ledger).has("TECH_PAGE_UNREACHABLE")).toBe(false);
        expect(ledger.every((row) => !row.live?.notChecked)).toBe(true);
        expect(gate.rateOf("x.com", { start: 1, max: 10 })).toBeLessThan(10);
    });

    it("when the site tightens its limit mid-run, the rate drops and no page is misreported", async () => {
        // 300 a minute for the first 400 pages, then 30 a minute.
        const { audit, server, ledger, clock } = auditAgainst(700, { start: 1, max: 10 }, (served) => (served < 400 ? 300 : 30));
        const r = await clock.run(audit.auditWorkspace("w"));
        const perMinute = (from: number, to: number) => {
            const t = server.stats.okTimes.slice(from, to);
            return (t.length - 1) / ((t[t.length - 1] - t[0]) / 60_000);
        };
        expect(perMinute(100, 400)).toBeGreaterThan(60); // faster than the 60 a minute it started at
        expect(perMinute(450, 700)).toBeLessThanOrEqual(31); // and settled under the new limit
        expect(r).toMatchObject({ scanned: 700, fetched: 700, notChecked: 0, failed: 0 });
        expect(ledger).toHaveLength(700);
        expect(codesIn(ledger).has("TECH_PAGE_UNREACHABLE")).toBe(false);
        expect(ledger.every((row) => row.live?.status === 200 && row.fetchedAt)).toBe(true);
    });

    it("marks pages 'not checked, rate limited' when the site keeps refusing, and says so in the summary", async () => {
        const pages = [page("a", "/a"), page("b", "/b"), page("c", "/c")];
        const { audit, ledger } = make({ pages, site: "https://x.com", live: () => ({ ...LIVE, status: 429 }) });
        const r = await audit.auditWorkspace("w");
        expect(r).toMatchObject({ scanned: 3, fetched: 0, notChecked: 3 });
        expect(ledger.map((row) => row.live)).toEqual(Array(3).fill({ status: 429, notChecked: "rate limited" }));
        expect(ledger.every((row) => !row.l1Findings?.length && !row.fetchedAt)).toBe(true);
        expect(auditSummary(r)).toBe("Checked 0 of 3 pages, 0 unchanged, 0 fetched from the site, 3 not checked (rate limited, will retry)");
        // Not checked is never clean.
        expect((await audit.issues("w")).counts).toMatchObject({ pages: 0, clean: 0, notChecked: 3 });
    });

    it("keeps a page's earlier verdict when a later fetch is refused", async () => {
        let refuse = false;
        const { audit, ledger } = make({ pages: [page("a", "/a")], site: "https://x.com", live: () => (refuse ? { ...LIVE, status: 503 } : LIVE) });
        await audit.auditWorkspace("w");
        const before = { ...ledger[0] };
        refuse = true;
        const r = await audit.auditWorkspace("w", undefined, "full");
        expect(r.notChecked).toBe(1);
        expect(ledger[0]).toMatchObject({ contentHash: before.contentHash, fetchedAt: before.fetchedAt, live: before.live });
    });
});

describe("HostGate", () => {
    const one: Rate = { start: 1, max: 1 };

    it("spaces requests per host and holds them for Retry-After", async () => {
        const clock = virtualClock();
        const gate = new HostGate(clock);
        await clock.run(gate.take("a.com", one));
        await clock.run(gate.take("a.com", one));
        expect(clock.t).toBe(1000);
        await clock.run(gate.take("b.com", one)); // another host is not held up
        expect(clock.t).toBe(1000);
        expect(gate.backoff("a.com", 30_000, one)).toBe(30_000);
        await clock.run(gate.take("a.com", one));
        expect(clock.t).toBe(31_000);
    });

    it("speeds up gradually while healthy, halves on a refusal, and never passes the maximum", () => {
        const gate = new HostGate(virtualClock());
        const rate: Rate = { start: 1, max: 3 };
        for (let i = 0; i < 20; i++) gate.ok("a.com", rate);
        expect(gate.rateOf("a.com", rate)).toBe(2); // +0.5 per 10 healthy responses
        for (let i = 0; i < 200; i++) gate.ok("a.com", rate);
        expect(gate.rateOf("a.com", rate)).toBe(3);
        gate.backoff("a.com", undefined, rate);
        expect(gate.rateOf("a.com", rate)).toBe(1.5);
    });

    it("doubles the pause when the host gives no Retry-After, and resets on success", () => {
        const gate = new HostGate(virtualClock());
        expect([gate.backoff("a.com"), gate.backoff("a.com"), gate.backoff("a.com")]).toEqual([5000, 10000, 20000]);
        gate.ok("a.com");
        expect(gate.backoff("a.com")).toBe(5000);
    });

    it("stays under an advertised rate limit, and waits for the reset when none is left", async () => {
        const clock = virtualClock();
        const gate = new HostGate(clock);
        const rate: Rate = { start: 5, max: 10 };
        gate.limit("a.com", { remaining: 30, resetMs: 60_000 }, rate); // 0.5/s allowed
        expect(gate.rateOf("a.com", rate)).toBeCloseTo(0.4); // with headroom
        gate.limit("a.com", { remaining: 0, resetMs: 20_000 }, rate);
        await clock.run(gate.take("a.com", rate));
        expect(clock.t).toBe(20_000);
    });

    it("reads Retry-After and RateLimit headers, clamps the configured rate, and knows a transient status", () => {
        expect(retryAfterMs("30", 0)).toBe(30_000);
        expect(retryAfterMs("Thu, 01 Jan 1970 00:01:00 GMT", 0)).toBe(60_000);
        expect(retryAfterMs(null, 0)).toBeUndefined();
        const headers = (h: Record<string, string>) => (n: string) => h[n];
        expect(rateLimitOf(headers({ "ratelimit-remaining": "12", "ratelimit-reset": "30" }), 0)).toEqual({ remaining: 12, resetMs: 30_000 });
        expect(rateLimitOf(headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000060" }), 1_700_000_000_000)).toEqual({ remaining: 0, resetMs: 60_000 });
        expect(rateLimitOf(headers({ ratelimit: "limit=100, remaining=40, reset=10" }), 0)).toEqual({ remaining: 40, resetMs: 10_000 });
        expect(rateLimitOf(headers({}), 0)).toBeUndefined();
        expect([clampRps(undefined), clampRps(50), clampRps(0.01), clampRps(2)]).toEqual([1, 10, 0.1, 2]);
        expect([429, 500, 503, 0].every(isTransient)).toBe(true);
        expect([200, 304, 403, 404].some(isTransient)).toBe(false);
    });
});
