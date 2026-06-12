import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

type Entry = { value: string; expires: number };

/**
 * Small read-through cache used for expensive, frequently-read endpoints
 * (dashboard summary, SEO score/issues, vitals). Backed by Redis when available,
 * else an in-memory map with TTL + a size cap. Keys are namespaced by workspace so
 * a write can invalidate a whole prefix (`delByPrefix`).
 */
@Injectable()
export class CacheService {
    private readonly mem = new Map<string, Entry>();
    private readonly maxMem = 2000;

    constructor(private readonly redis: RedisService) {}

    async get<T>(key: string): Promise<T | null> {
        if (this.redis.enabled && this.redis.client) {
            const raw = await this.redis.client.get(key).catch(() => null);
            return raw ? (JSON.parse(raw) as T) : null;
        }
        const e = this.mem.get(key);
        if (!e) return null;
        if (e.expires < Date.now()) { this.mem.delete(key); return null; }
        return JSON.parse(e.value) as T;
    }

    async set(key: string, value: unknown, ttlSec: number): Promise<void> {
        const raw = JSON.stringify(value);
        if (this.redis.enabled && this.redis.client) {
            await this.redis.client.set(key, raw, "EX", ttlSec).catch(() => undefined);
            return;
        }
        if (this.mem.size >= this.maxMem) {
            // evict the oldest insertion (Map preserves insertion order)
            const first = this.mem.keys().next().value;
            if (first) this.mem.delete(first);
        }
        this.mem.set(key, { value: raw, expires: Date.now() + ttlSec * 1000 });
    }

    /** Read-through helper: return the cached value or compute, cache and return it. */
    async wrap<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
        const hit = await this.get<T>(key);
        if (hit !== null) return hit;
        const fresh = await fn();
        // Don't cache null/undefined (treat as a miss next time).
        if (fresh !== null && fresh !== undefined) await this.set(key, fresh, ttlSec);
        return fresh;
    }

    async del(key: string): Promise<void> {
        if (this.redis.enabled && this.redis.client) { await this.redis.client.del(key).catch(() => undefined); return; }
        this.mem.delete(key);
    }

    /** Invalidate every key starting with `prefix` (e.g. a workspace's cached reads). */
    async delByPrefix(prefix: string): Promise<void> {
        if (this.redis.enabled && this.redis.client) {
            const client = this.redis.client;
            let cursor = "0";
            do {
                const res = await client.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200).catch(() => null);
                if (!res) break;
                const [next, keys] = res;
                cursor = next;
                if (keys.length) await client.del(...keys).catch(() => undefined);
            } while (cursor !== "0");
            return;
        }
        for (const k of [...this.mem.keys()]) if (k.startsWith(prefix)) this.mem.delete(k);
    }
}
