import type { ThrottlerStorage } from "@nestjs/throttler";
import type { Redis } from "ioredis";

// ThrottlerStorageRecord isn't re-exported from the package index, so mirror its
// shape here (the structural type the ThrottlerStorage.increment contract returns).
type ThrottlerStorageRecord = {
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
};

/**
 * Redis-backed throttler store so rate limits are shared across a multi-instance
 * deploy (the default in-memory store counts per-process, which multiplies the
 * effective limit by the instance count and weakens brute-force protection).
 *
 * Reuses the existing RedisService connection — no new dependency, no new infra.
 * Only used when REDIS_URL is set; otherwise the framework keeps its in-memory
 * store (correct for a single-instance self-host). Semantics mirror the bundled
 * ThrottlerStorageService: `ttl`/`blockDuration` are milliseconds in, and
 * `timeToExpire`/`timeToBlockExpire` are seconds out.
 *
 * The whole hit-count + block decision runs in one atomic Lua script so
 * concurrent requests across instances can't race the counter.
 */
const INCREMENT_LUA = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local cttl = redis.call('PTTL', KEYS[1])
  if cttl < 0 then cttl = 0 end
  return { tonumber(ARGV[2]) + 1, cttl, 1, blockTtl }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
local blocked = 0
local blockExpire = 0
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blocked = 1
  blockExpire = tonumber(ARGV[3])
end
return { hits, ttl, blocked, blockExpire }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
    constructor(private readonly client: Redis) {}

    async increment(
        key: string,
        ttl: number,
        limit: number,
        blockDuration: number,
        throttlerName: string,
    ): Promise<ThrottlerStorageRecord> {
        const counterKey = `throttle:${throttlerName}:${key}`;
        const blockKey = `${counterKey}:blocked`;
        const [hits, ttlMs, blocked, blockMs] = (await this.client.eval(
            INCREMENT_LUA,
            2,
            counterKey,
            blockKey,
            String(ttl),
            String(limit),
            String(blockDuration),
        )) as [number, number, number, number];

        return {
            totalHits: hits,
            timeToExpire: Math.ceil(ttlMs / 1000),
            isBlocked: blocked === 1,
            timeToBlockExpire: Math.ceil(blockMs / 1000),
        };
    }
}
