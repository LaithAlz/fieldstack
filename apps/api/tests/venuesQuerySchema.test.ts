import { describe, expect, it } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";

const { ListVenuesQuery, FieldFiltersQuery } = await import("../src/routes/venues.js");

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("ListVenuesQuery ids param", () => {
  it("splits comma-joined uuid lists", () => {
    const q = ListVenuesQuery.parse({ ids: `${UUID_A}, ${UUID_B}` });
    expect(q.ids).toEqual([UUID_A, UUID_B]);
  });

  it("treats an empty ids string as absent", () => {
    expect(ListVenuesQuery.parse({ ids: "" }).ids).toBeUndefined();
    expect(ListVenuesQuery.parse({}).ids).toBeUndefined();
  });

  it("rejects non-uuid ids", () => {
    expect(() => ListVenuesQuery.parse({ ids: "not-a-uuid" })).toThrow();
    expect(() => ListVenuesQuery.parse({ ids: `${UUID_A},banana` })).toThrow();
  });

  it("caps the id list at 100", () => {
    const many = Array.from({ length: 101 }, () => UUID_A).join(",");
    expect(() => ListVenuesQuery.parse({ ids: many })).toThrow();
  });

  it("still enforces lat/lng pairing when ids are absent", () => {
    expect(() => ListVenuesQuery.parse({ lat: "43.6" })).toThrow();
    expect(ListVenuesQuery.parse({ lat: "43.6", lng: "-79.4" }).lat).toBe(43.6);
  });
});

describe("FieldFiltersQuery", () => {
  it("accepts a request with no filters", () => {
    const q = FieldFiltersQuery.parse({});
    expect(q.surface).toBeUndefined();
    expect(q.size).toBeUndefined();
  });

  it("accepts valid surface and size enums", () => {
    const q = FieldFiltersQuery.parse({ surface: "turf", size: "5v5" });
    expect(q.surface).toBe("turf");
    expect(q.size).toBe("5v5");
  });

  it("rejects unknown enum values", () => {
    expect(() => FieldFiltersQuery.parse({ surface: "lava" })).toThrow();
    expect(() => FieldFiltersQuery.parse({ size: "9v9" })).toThrow();
  });
});
