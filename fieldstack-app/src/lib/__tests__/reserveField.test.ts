import { cheapestBookableField } from "../reserveField";

type MinimalField = { id: string; price_per_hour: number | null; booking_url: string | null };

function field(id: string, price: number | null, bookingUrl: string | null): MinimalField {
  return { id, price_per_hour: price, booking_url: bookingUrl };
}

describe("cheapestBookableField", () => {
  it("returns null when no field has a booking link", () => {
    const fields = [field("a", 50, null), field("b", 30, null)];
    expect(cheapestBookableField(fields)).toBeNull();
  });

  it("ignores unbookable fields even when they're cheaper", () => {
    const fields = [field("cheap-no-link", 10, null), field("pricier-bookable", 80, "https://x")];
    expect(cheapestBookableField(fields)?.id).toBe("pricier-bookable");
  });

  it("picks the cheapest among bookable fields", () => {
    const fields = [
      field("a", 90, "https://a"),
      field("b", 40, "https://b"),
      field("c", 60, "https://c"),
    ];
    expect(cheapestBookableField(fields)?.id).toBe("b");
  });

  it("treats an explicit $0 as the cheapest, beating any positive price", () => {
    const fields = [field("paid", 20, "https://paid"), field("free", 0, "https://free")];
    expect(cheapestBookableField(fields)?.id).toBe("free");
  });

  it("keeps the first bookable field when none are priced", () => {
    const fields = [field("first", null, "https://a"), field("second", null, "https://b")];
    expect(cheapestBookableField(fields)?.id).toBe("first");
  });

  it("prefers a priced bookable field over an unpriced one, regardless of order", () => {
    const unpricedFirst = [field("unpriced", null, "https://a"), field("priced", 55, "https://b")];
    expect(cheapestBookableField(unpricedFirst)?.id).toBe("priced");

    const pricedFirst = [field("priced", 55, "https://a"), field("unpriced", null, "https://b")];
    expect(cheapestBookableField(pricedFirst)?.id).toBe("priced");
  });

  it("returns null for an empty list", () => {
    expect(cheapestBookableField([])).toBeNull();
  });
});
