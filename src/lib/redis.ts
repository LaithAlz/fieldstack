import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

// `lazyConnect: true` so we don't crash the process at import time if Redis
// isn't reachable yet — connection happens on first command, and the cache
// helper treats failures as cache-miss.
export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.warn(`[redis] ${err.message}`);
});
