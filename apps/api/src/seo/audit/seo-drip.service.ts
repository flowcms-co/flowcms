import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { SeoAuditService } from "./seo-audit.service";
import { isPageType } from "../../content/route-path";

const PAGE = "page";
const TICK_MS = Number(process.env.SEO_DRIP_TICK_MS) || 60_000; // re-check stale pages every minute
const BATCH = Number(process.env.SEO_DRIP_BATCH) || 10; // small batch per tick -> no CPU spike
// How many recent published entries to consider per tick. Entries of non-page types
// (cities, tags) are filtered out afterwards, so look well past one batch.
const CANDIDATES = BATCH * 30;
const MAX_RECHECK_PER_TICK = 30; // ceiling on background re-fetches per workspace per tick

/**
 * Deterministic L1 drip (Phase 3). A throttled background ticker that re-audits
 * pages whose content changed (a save bumps ContentEntry.updatedAt, so this also
 * IS the on-write trigger) or that were never audited. Processes a small batch per
 * tick and goes idle when nothing is stale, so it never spikes CPU. Audits are
 * change-detected (contentHash) and idempotent, so it's multi-instance safe with no
 * locking. Set SEO_DRIP_DISABLED=1 to turn it off. L1 only; the L2/auto scheduler is
 * the Pro+ EE feature (Phase 8).
 */
@Injectable()
export class SeoDripService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger("SeoDrip");
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly audit: SeoAuditService,
    ) {}

    onModuleInit() {
        if (process.env.SEO_DRIP_DISABLED === "1" || process.env.NODE_ENV === "test") return;
        // First pass shortly after boot, then on the interval.
        setTimeout(() => void this.tick(), 15_000);
        this.timer = setInterval(() => void this.tick(), TICK_MS);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    /** Upkeep that needs no button: bring rows written by older rules up to date
     *  from their stored page facts (no requests), then spend a small, steady budget
     *  re-fetching each workspace's stalest pages, so every page is re-verified
     *  within its workspace's window (14 days by default). The budget is what that
     *  window needs: 1,400 pages over 14 days is one request every ~14 minutes;
     *  100,000 pages is about 5 a minute. */
    private async maintain() {
        await this.audit.refreshOldRules();
        const counts = await this.prisma.pageAudit.groupBy({ by: ["workspaceId"], where: { task: PAGE }, _count: { _all: true } });
        for (const c of counts) {
            const ws = await this.prisma.workspace.findUnique({ where: { id: c.workspaceId }, select: { seoRecheckDays: true } });
            const perTick = c._count._all / (Math.max(1, ws?.seoRecheckDays ?? 14) * 86_400_000 / TICK_MS);
            // Fractional budgets accumulate, so a small site still gets its one page every few ticks.
            const owed = (this.owed.get(c.workspaceId) ?? 0) + perTick;
            const budget = Math.min(MAX_RECHECK_PER_TICK, Math.floor(owed));
            this.owed.set(c.workspaceId, owed - budget);
            if (budget > 0) await this.audit.recheckStalest(c.workspaceId, budget);
        }
    }
    private readonly owed = new Map<string, number>();

    /** Audit up to BATCH stale published pages this tick (idle when none). */
    async tick() {
        if (this.running) return; // never overlap ticks
        this.running = true;
        try {
            // Already idempotent (contentHash change-detection), but the lease
            // avoids two instances re-auditing the same batch and wasting CPU.
            if (!(await this.redis.tryAcquire("sched:seo-drip", TICK_MS - 5_000))) return;
            await this.maintain().catch((err) => this.logger.warn(`drip maintenance failed: ${err instanceof Error ? err.message : err}`));
            const candidates = (
                await this.prisma.contentEntry.findMany({
                    where: { status: "PUBLISHED" },
                    select: { id: true, workspaceId: true, updatedAt: true, contentType: { select: { kind: true, schema: true, apiId: true, name: true } } },
                    orderBy: { updatedAt: "desc" },
                    take: CANDIDATES,
                })
            ).filter((c) => isPageType(c.contentType));
            if (!candidates.length) return;

            const audits = await this.prisma.pageAudit.findMany({
                where: { target: { in: candidates.map((c) => c.id) }, task: PAGE },
                select: { target: true, lastCheckedAt: true, live: true },
            });
            // A row marked "not checked" (the site answered 429/5xx) counts as never
            // audited, so it is retried here.
            const lastChecked = new Map(audits.filter((a) => !(a.live as { notChecked?: string } | null)?.notChecked).map((a) => [a.target, a.lastCheckedAt]));

            const stale = candidates
                .filter((c) => {
                    const at = lastChecked.get(c.id);
                    return !at || c.updatedAt > at;
                })
                .slice(0, BATCH);
            if (!stale.length) return;

            let done = 0;
            for (const e of stale) {
                try {
                    await this.audit.auditEntry(e.workspaceId, e.id);
                    done++;
                } catch (err) {
                    this.logger.warn(`drip audit ${e.id} failed: ${err instanceof Error ? err.message : err}`);
                }
            }
            this.logger.log(`drip: audited ${done}/${stale.length} stale page(s)`);
        } finally {
            this.running = false;
        }
    }
}
