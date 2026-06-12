import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { RedisService } from "../redis/redis.service";

const TICK_MS = 60 * 60 * 1000; // hourly

/**
 * Hourly tick that sends due email digests. Each user's frequency window
 * (daily / weekly) is checked against their lastDigestAt, so a single interval
 * serves both cadences without extra scheduling infrastructure.
 */
@Injectable()
export class DigestScheduler implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger("DigestScheduler");
    private timer?: ReturnType<typeof setInterval>;

    constructor(
        private readonly notifications: NotificationsService,
        private readonly redis: RedisService,
    ) {}

    onModuleInit() {
        this.timer = setInterval(() => {
            void (async () => {
                // Single-flight across instances so digests aren't double-sent.
                if (!(await this.redis.tryAcquire("sched:digests", TICK_MS - 60_000))) return;
                try {
                    const r = await this.notifications.runDigests();
                    if (r.sent > 0) this.logger.log(`sent ${r.sent} digest(s)`);
                } catch (e) {
                    this.logger.warn(`digest run failed: ${e instanceof Error ? e.message : e}`);
                }
            })();
        }, TICK_MS);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }
}
