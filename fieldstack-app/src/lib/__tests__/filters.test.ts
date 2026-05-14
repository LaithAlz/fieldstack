import { bucketToPriceMax, priceMaxToBucket } from "../filters";

describe("bucketToPriceMax", () => {
  it("maps under80 → 80", () => {
    expect(bucketToPriceMax("under80")).toBe(80);
  });

  it("maps to120 → 120", () => {
    expect(bucketToPriceMax("to120")).toBe(120);
  });

  it("maps any → null (no cap)", () => {
    expect(bucketToPriceMax("any")).toBeNull();
  });

  it("maps 120plus → null (backend doesn't accept a min yet)", () => {
    expect(bucketToPriceMax("120plus")).toBeNull();
  });
});

describe("priceMaxToBucket", () => {
  it("round-trips known caps", () => {
    expect(priceMaxToBucket(80)).toBe("under80");
    expect(priceMaxToBucket(120)).toBe("to120");
  });

  it("falls back to 'any' for null", () => {
    expect(priceMaxToBucket(null)).toBe("any");
  });

  it("falls back to 'any' for unknown caps", () => {
    expect(priceMaxToBucket(95)).toBe("any");
    expect(priceMaxToBucket(200)).toBe("any");
  });
});

describe("price bucket round-trip", () => {
  // Skip "any" + "120plus" because both map to null and the back-map can
  // only return one — that asymmetry is intentional (see filters.ts comments).
  it.each<[ "under80" | "to120" ]>([["under80"], ["to120"]])(
    "%s survives bucket → max → bucket",
    (bucket) => {
      const max = bucketToPriceMax(bucket);
      expect(priceMaxToBucket(max)).toBe(bucket);
    }
  );
});
