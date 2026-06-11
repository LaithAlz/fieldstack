import { afterAll, describe, expect, it } from "bun:test";

// Point at a port nothing listens on so every Redis command fails fast —
// the contract under test is that cache failures never break the request.
// (6379 might be a real local Redis on a dev machine; don't touch it.)
process.env.REDIS_URL = "redis://127.0.0.1:6398";

const { cached, invalidate } = await import("../src/lib/cache.js");
const { redis } = await import("../src/lib/redis.js");

afterAll(() => {
  redis.disconnect();
});

describe("cached() with Redis down", () => {
  it("falls through to the fetcher", async () => {
    const result = await cached("test:key", 30, async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
  });

  it("calls the fetcher every time (no cache available)", async () => {
    let calls = 0;
    const fetcher = async () => ++calls;
    expect(await cached("test:key", 30, fetcher)).toBe(1);
    expect(await cached("test:key", 30, fetcher)).toBe(2);
  });

  it("propagates fetcher errors instead of masking them", async () => {
    await expect(
      cached("test:key", 30, async () => {
        throw new Error("postgrest exploded");
      })
    ).rejects.toThrow("postgrest exploded");
  });

  it("invalidate() swallows Redis failures", async () => {
    await expect(invalidate("test:key")).resolves.toBeUndefined();
  });
});
