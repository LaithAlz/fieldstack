import { bucketToPriceMax, isFreeVenue, priceMaxToBucket } from "../filters";

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

describe("isFreeVenue", () => {
  it("is free when the price is explicitly $0, regardless of venue type", () => {
    expect(isFreeVenue("private", 0)).toBe(true);
    expect(isFreeVenue("community_centre", 0)).toBe(true);
    expect(isFreeVenue("public_park", 0)).toBe(true);
    expect(isFreeVenue(null, 0)).toBe(true);
    expect(isFreeVenue(undefined, 0)).toBe(true);
  });

  it("is free when the price is unknown but the venue is a public park", () => {
    expect(isFreeVenue("public_park", null)).toBe(true);
  });

  it("is NOT free when the price is unknown on a private or community venue", () => {
    expect(isFreeVenue("private", null)).toBe(false);
    expect(isFreeVenue("community_centre", null)).toBe(false);
    expect(isFreeVenue(null, null)).toBe(false);
    expect(isFreeVenue(undefined, null)).toBe(false);
  });

  it("is NOT free when a positive price is recorded, even at a public park", () => {
    expect(isFreeVenue("public_park", 25)).toBe(false);
    expect(isFreeVenue("private", 60)).toBe(false);
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
