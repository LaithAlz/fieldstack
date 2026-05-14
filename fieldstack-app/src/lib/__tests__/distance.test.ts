import { formatDistance, haversineKm } from "../distance";

describe("haversineKm", () => {
  it("returns 0 for the same point", () => {
    const p = { lat: 43.6709, lng: -79.3863 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 6);
  });

  it("computes Toronto → Mississauga at ~25 km", () => {
    const toronto = { lat: 43.6709, lng: -79.3863 };
    const mississauga = { lat: 43.589, lng: -79.6441 };
    const km = haversineKm(toronto, mississauga);
    expect(km).toBeGreaterThan(20);
    expect(km).toBeLessThan(30);
  });

  it("is symmetric", () => {
    const a = { lat: 43.6709, lng: -79.3863 };
    const b = { lat: 43.589, lng: -79.6441 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});

describe("formatDistance", () => {
  it("uses one decimal under 10 km", () => {
    expect(formatDistance(0.4)).toBe("0.4 km");
    expect(formatDistance(5.27)).toBe("5.3 km");
    expect(formatDistance(9.99)).toBe("10.0 km");
  });

  it("rounds to whole km at 10+", () => {
    expect(formatDistance(10.4)).toBe("10 km");
    expect(formatDistance(25.7)).toBe("26 km");
  });

  it("returns empty string for non-finite input", () => {
    expect(formatDistance(NaN)).toBe("");
    expect(formatDistance(Infinity)).toBe("");
  });
});
