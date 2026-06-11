import { describe, expect, it } from "bun:test";

// supabase.ts throws at import time without these — set dummies before the
// module graph loads. Tests never hit the network.
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";

const { searchKey } = await import("../src/lib/queries/search.js");

describe("searchKey", () => {
  it("is stable across array element order", () => {
    const a = searchKey({ surfaces: ["turf", "grass"], sort: "distance" });
    const b = searchKey({ surfaces: ["grass", "turf"], sort: "distance" });
    expect(a).toBe(b);
  });

  it("rounds coordinate jitter into the same key", () => {
    const a = searchKey({ lat: 43.67091, lng: -79.38631, sort: "distance" });
    const b = searchKey({ lat: 43.670949, lng: -79.386349, sort: "distance" });
    expect(a).toBe(b);
  });

  it("separates keys when coords differ meaningfully", () => {
    const a = searchKey({ lat: 43.6709, lng: -79.3863, sort: "distance" });
    const b = searchKey({ lat: 43.7709, lng: -79.3863, sort: "distance" });
    expect(a).not.toBe(b);
  });

  it("treats missing and empty filter arrays identically", () => {
    const a = searchKey({ sort: "distance" });
    const b = searchKey({ surfaces: [], sizes: [], venueTypes: [], sort: "distance" });
    expect(a).toBe(b);
  });

  it("separates keys by sort, price, and pagination", () => {
    const base = searchKey({ sort: "distance" });
    expect(searchKey({ sort: "price_asc" })).not.toBe(base);
    expect(searchKey({ sort: "distance", priceMax: 80 })).not.toBe(base);
    expect(searchKey({ sort: "distance", offset: 50 })).not.toBe(base);
    expect(searchKey({ sort: "distance", limit: 10 })).not.toBe(base);
  });

  it("defaults limit/offset so explicit defaults hit the same key", () => {
    const a = searchKey({ sort: "distance" });
    const b = searchKey({ sort: "distance", limit: 50, offset: 0 });
    expect(a).toBe(b);
  });
});
