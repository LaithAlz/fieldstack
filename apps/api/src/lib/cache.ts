import { redis } from "./redis.js";

/**
 * Read-through cache. Fetches `key` from Redis; on miss, runs `fetcher`,
 * stores the JSON-encoded result with `ttlSeconds` expiry, and returns it.
 *
 * Cache failures (Redis down, malformed JSON) never bubble — they fall
 * through to `fetcher` so the API stays available when Redis is unhappy.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  let hit: string | null = null;
  try {
    hit = await redis.get(key);
  } catch {
    // Redis is down — treat as cache miss.
  }

  if (hit !== null) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      // Malformed cache entry — fall through and overwrite below.
    }
  }

  const fresh = await fetcher();

  try {
    await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
  } catch {
    // Best-effort write; never fail the request because we couldn't cache.
  }

  return fresh;
}

export async function invalidate(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    /* swallow */
  }
}
