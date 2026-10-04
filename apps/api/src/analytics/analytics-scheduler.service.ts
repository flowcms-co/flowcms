import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { AnalyticsService } from "./analytics.service";
import { isSyncDue } from "./analytics-math";

const TICK_MS = 60 * 60_000; // check hourly; each source syncs once it is 24h old
const LOCK_MS = TICK_MS - 60_000; // lease shorter than the tick so the next tick can re-claim

/**
 * Daily Search Console + GA4 sync. Every hour (and shortly after boot) it syncs
 * each connected source whose last sync is a day or more old, so dashboards stay
 * current without anyone pressing "Sync now". Same plain-interval pattern as the
 * content scheduler (no extra deps); single-flight across instances via Redis.
 */
@Injectable()
export class AnalyticsSchedulerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AnalyticsSchedulerService.name);
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(
        private readonly analytics: AnalyticsService,
        private readonly redis: RedisService,
    ) {}

    onModuleInit() {
        setTimeout(() => void this.syncDue(), 30_000);
        this.timer = setInterval(() => void this.syncDue(), TICK_MS);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    /** Sync every source that is due. Returns how many were attempted. */
    async syncDue(now = Date.now()): Promise<number> {
        if (this.running) return 0;
        this.running = true;
        try {
            if (!(await this.redis.tryAcquire("sched:analytics-sync", LOCK_MS))) return 0;
            const due = (await this.analytics.syncTargets()).filter((t) => isSyncDue((t.config as { lastSyncAt?: string } | null)?.lastSyncAt, now));
            // One source at a time: a failure is recorded on its integration by sync()
            // (status ERROR + lastError) and must not stop the rest.
            for (const t of due) await this.analytics.sync(t.workspaceId, undefined, t.provider).catch(() => undefined);
            if (due.length) this.logger.log(`Daily analytics sync ran for ${due.length} source${due.length === 1 ? "" : "s"}.`);
            return due.length;
        } catch (err) {
            this.logger.error("Daily analytics sync failed", err as Error);
            return 0;
        } finally {
            this.running = false;
        }
    }
}
