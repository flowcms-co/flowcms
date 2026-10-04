import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { CacheService } from "../cache/cache.service";

const TICK_MS = 60_000; // check every minute
const LOCK_MS = TICK_MS - 5_000; // lease shorter than the tick so the next tick can re-claim

/**
 * Auto-publish scheduler. Every minute (and once on boot) it flips any entry that
 * is SCHEDULED with a due `scheduledAt` to PUBLISHED, stamping `publishedAt`.
 * This is what makes the Publish Queue + Content Calendar "schedule" actually fire.
 * Implemented with a plain interval (no extra deps); single-flight guarded.
 */
@Injectable()
export class ContentSchedulerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ContentSchedulerService.name);
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly webhooks: WebhooksService,
        private readonly cache: CacheService,
    ) {}

    onModuleInit() {
        // First pass shortly after boot, then on a fixed interval.
        setTimeout(() => void this.publishDue(), 5_000);
        this.timer = setInterval(() => void this.publishDue(), TICK_MS);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    /** Publish all entries whose scheduled time has arrived. Returns the count. */
    async publishDue(): Promise<number> {
        if (this.running) return 0;
        this.running = true;
        try {
            // Cluster-wide single-flight: only one instance publishes a given tick,
            // so a scheduled entry doesn't fire its content.published webhook twice.
            if (!(await this.redis.tryAcquire("sched:content-publish", LOCK_MS))) return 0;
            const now = new Date();
            const due = await this.prisma.contentEntry.findMany({
                where: { status: "SCHEDULED", scheduledAt: { not: null, lte: now } },
                select: { id: true, slug: true, workspaceId: true, scheduledAt: true, publishedAt: true, firstPublishedAt: true, contentType: { select: { apiId: true } } },
            });
            if (due.length === 0) return 0;
            await Promise.all(
                due.map(async (e) => {
                    const at = e.scheduledAt ?? now;
                    // The schedule has happened: clear it, so the entry stops reading as
                    // "scheduled" forever. The first publish date is kept across re-publishes.
                    await this.prisma.contentEntry.update({
                        where: { id: e.id },
                        data: { status: "PUBLISHED", publishedAt: at, firstPublishedAt: e.firstPublishedAt ?? e.publishedAt ?? at, scheduledAt: null },
                    });
                    // Recent activity: published by the scheduler, not by a person.
                    await this.prisma.auditLog
                        .create({ data: { workspaceId: e.workspaceId, userId: null, action: "content.publish", resource: "ContentEntry", resourceId: e.id } })
                        .catch(() => undefined);
                    void this.cache.delByPrefix(`dash:${e.workspaceId}:`);
                    void this.webhooks.dispatch(e.workspaceId, "content.published", {
                        id: e.id,
                        slug: e.slug,
                        type: e.contentType.apiId,
                        status: "PUBLISHED",
                        publishedAt: e.scheduledAt ?? now,
                    });
                }),
            );
            this.logger.log(`Auto-published ${due.length} scheduled ${due.length === 1 ? "entry" : "entries"}.`);
            return due.length;
        } catch (err) {
            this.logger.error("Auto-publish pass failed", err as Error);
            return 0;
        } finally {
            this.running = false;
        }
    }
}
