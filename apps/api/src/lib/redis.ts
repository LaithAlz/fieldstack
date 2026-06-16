import { Redis, type RedisOptions } from "ioredis";

// `lazyConnect: true` so we don't connect at import time if Redis isn't
// reachable yet — connection happens on first command, and the cache helper
// treats failures as cache-miss.
const OPTIONS: RedisOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
};

/**
 * Build the Redis client. Redis is a best-effort cache, never a hard
 * dependency, so a missing or malformed `REDIS_URL` must not crash the API:
 * ioredis throws synchronously on an unparseable URL, so we guard
 * construction and fall back to a default client that simply never connects
 * off-box (every command rejects, and `cached()` falls through to the live
 * query). Exported for tests.
 */
export function createRedis(url: string | undefined): Redis {
  if (!url) return new Redis(OPTIONS);
  try {
    return new Redis(url, OPTIONS);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[redis] invalid REDIS_URL — caching disabled: ${err instanceof Error ? err.message : "unknown"}`
    );
    return new Redis(OPTIONS);
  }
}

export const redis = createRedis(process.env.REDIS_URL);

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.warn(`[redis] ${err.message}`);
});
