import { afterAll, describe, expect, it } from "bun:test";

import { createRedis } from "../src/lib/redis.js";

const clients: { disconnect(): void }[] = [];
const track = <T extends { disconnect(): void }>(c: T): T => {
  clients.push(c);
  return c;
};

afterAll(() => clients.forEach((c) => c.disconnect()));

describe("createRedis", () => {
  it("builds a client for a valid url", () => {
    expect(track(createRedis("redis://127.0.0.1:6399"))).toBeDefined();
  });

  it("falls back (no throw) on a malformed url — caching stays best-effort", () => {
    // The exact placeholder that crash-looped Fly at boot.
    expect(() => track(createRedis("rediss://…"))).not.toThrow();
  });

  it("falls back when the url is undefined", () => {
    expect(track(createRedis(undefined))).toBeDefined();
  });
});
