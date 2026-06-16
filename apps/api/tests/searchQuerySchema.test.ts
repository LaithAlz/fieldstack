import { describe, expect, it } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";

const { SearchFieldsQuery } = await import("../src/routes/search.js");

describe("SearchFieldsQuery", () => {
  it("parses the no-param browse-all request with defaults", () => {
    const q = SearchFieldsQuery.parse({});
    expect(q.sort).toBe("distance");
    expect(q.limit).toBe(50);
    expect(q.offset).toBe(0);
    expect(q.radius_km).toBe(10);
    expect(q.surface).toBeUndefined();
  });

  it("splits comma-joined filter lists", () => {
    const q = SearchFieldsQuery.parse({
      surface: "turf, grass",
      size: "5v5,futsal",
      venue_type: "public_park",
    });
    expect(q.surface).toEqual(["turf", "grass"]);
    expect(q.size).toEqual(["5v5", "futsal"]);
    expect(q.venue_type).toEqual(["public_park"]);
  });

  it("treats an empty filter string as no filter", () => {
    const q = SearchFieldsQuery.parse({ surface: "" });
    expect(q.surface).toBeUndefined();
  });

  it("rejects unknown enum values in lists", () => {
    expect(() => SearchFieldsQuery.parse({ surface: "turf,lava" })).toThrow();
    expect(() => SearchFieldsQuery.parse({ size: "9v9" })).toThrow();
  });

  it("coerces numeric strings (query params arrive as strings)", () => {
    const q = SearchFieldsQuery.parse({
      lat: "43.67",
      lng: "-79.38",
      price_max: "80",
      limit: "20",
      offset: "40",
    });
    expect(q.lat).toBe(43.67);
    expect(q.price_max).toBe(80);
    expect(q.limit).toBe(20);
    expect(q.offset).toBe(40);
  });

  it("requires lat and lng together", () => {
    expect(() => SearchFieldsQuery.parse({ lat: "43.67" })).toThrow();
    expect(() => SearchFieldsQuery.parse({ lng: "-79.38" })).toThrow();
    expect(SearchFieldsQuery.parse({ lat: "43.67", lng: "-79.38" }).lat).toBe(43.67);
  });

  it("bounds coordinates, radius, and pagination", () => {
    expect(() => SearchFieldsQuery.parse({ lat: "91", lng: "0" })).toThrow();
    expect(() => SearchFieldsQuery.parse({ radius_km: "501" })).toThrow();
    expect(() => SearchFieldsQuery.parse({ limit: "201" })).toThrow();
    expect(() => SearchFieldsQuery.parse({ offset: "-1" })).toThrow();
  });
});
