import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import IORedis, { type Redis } from "ioredis";

/**
 * Optional Redis connection. When `REDIS_URL` is set, Flow CMS uses Redis for the
 * BullMQ job queue, the read-cache and the throttler store. When it isn't set,
 * `enabled` is false and every consumer falls back to in-process/in-memory paths,
 * so a self-hosted install runs with no Redis at all. The client uses
 * `maxRetriesPerRequest: null` so the same connection is safe to share with BullMQ.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    readonly enabled: boolean;
    readonly client: Redis | null = null;

    constructor() {
        const url = process.env.REDIS_URL?.trim();
        this.enabled = !!url;
        if (!url) {
            this.logger.log("REDIS_URL not set — running without Redis (in-process jobs, in-memory cache).");
            return;
        }
        this.client = new IORedis(url, {
            maxRetriesPerRequest: null, // required to share the connection with BullMQ
            enableReadyCheck: true,
            lazyConnect: false,
        });
        this.client.on("error", (e) => this.logger.warn(`Redis error: ${e.message}`));
        this.client.on("ready", () => this.logger.log("Redis connected."));
    }

    /** A connection BullMQ can use (it requires maxRetriesPerRequest: null). */
    bullConnection(): Redis | null {
        return this.client;
    }

    /**
     * Best-effort distributed lock for cluster-wide single-flight (the interval
     * schedulers). Returns true if THIS instance won the lease for `ttlMs` (so it
     * should run the tick), false if another instance already holds it. When Redis
     * is absent the deploy is single-instance, so it always returns true ("you're
     * the only one, go ahead"). A Redis hiccup also returns true so a transient
     * outage never silently halts the schedulers.
     */
    async tryAcquire(key: string, ttlMs: number): Promise<boolean> {
        if (!this.client) return true; // no Redis => single instance => always run
        try {
            const res = await this.client.set(`lock:${key}`, "1", "PX", Math.max(1000, Math.floor(ttlMs)), "NX");
            return res === "OK";
        } catch {
            return true; // don't let a Redis blip stall the schedulers
        }
    }

    async onModuleDestroy() {
        await this.client?.quit().catch(() => undefined);
    }
}
