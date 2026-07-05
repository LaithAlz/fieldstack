import { priceDisplayFor, venuePriceSummary } from "../priceDisplay";

describe("priceDisplayFor", () => {
  it("renders FREE for an explicit $0 price, regardless of venue type", () => {
    expect(priceDisplayFor("private", { price_per_hour: 0, booking_url: null })).toEqual({
      kind: "free",
    });
    expect(priceDisplayFor("public_park", { price_per_hour: 0, booking_url: "https://x" })).toEqual(
      { kind: "free" }
    );
  });

  it("never falls through to a priced $0/hr render", () => {
    const display = priceDisplayFor("private", { price_per_hour: 0, booking_url: "https://x" });
    expect(display.kind).not.toBe("priced");
  });

  it("renders FREE for a null price on a public park", () => {
    expect(priceDisplayFor("public_park", { price_per_hour: null, booking_url: null })).toEqual({
      kind: "free",
    });
  });

  it("renders priced for a positive price", () => {
    expect(priceDisplayFor("private", { price_per_hour: 45, booking_url: null })).toEqual({
      kind: "priced",
      amount: 45,
    });
  });

  it("renders rates_on_site for a null price with a booking link on a non-public venue", () => {
    expect(
      priceDisplayFor("private", { price_per_hour: null, booking_url: "https://book.me" })
    ).toEqual({ kind: "rates_on_site" });
  });

  it("renders none for a null price with no booking link on a non-public venue", () => {
    expect(priceDisplayFor("community_centre", { price_per_hour: null, booking_url: null })).toEqual(
      { kind: "none" }
    );
    expect(priceDisplayFor(undefined, { price_per_hour: null, booking_url: null })).toEqual({
      kind: "none",
    });
  });
});

describe("venuePriceSummary", () => {
  // The bug this whole rollup exists to kill: a venue with an unbookable $0
  // field and a bookable $50 field must NOT roll up to FREE — the reserve
  // bar can only ever book the $50 field (cheapestBookableField ignores
  // unbookable fields entirely), so the pin/card must agree with it.
  it('rolls a mixed unbookable-$0 + bookable-$50 venue to "from $50", never FREE', () => {
    const fields = [
      { price_per_hour: 0, booking_url: null },
      { price_per_hour: 50, booking_url: "https://book.me" },
    ];
    expect(venuePriceSummary(fields, "private")).toEqual({ kind: "from", price: 50 });
  });

  it("rolls a public park with no priced fields to FREE", () => {
    const fields = [
      { price_per_hour: null, booking_url: null },
      { price_per_hour: null, booking_url: "https://book.me" },
    ];
    expect(venuePriceSummary(fields, "public_park")).toEqual({ kind: "free" });
  });

  it("rolls an explicit $0 bookable field to FREE regardless of venue type", () => {
    const fields = [{ price_per_hour: 0, booking_url: "https://book.me" }];
    expect(venuePriceSummary(fields, "private")).toEqual({ kind: "free" });
  });

  it("rolls up to the cheapest among bookable fields when several are priced", () => {
    const fields = [
      { price_per_hour: 80, booking_url: "https://a" },
      { price_per_hour: 30, booking_url: "https://b" },
      { price_per_hour: 60, booking_url: null }, // unbookable — excluded even though cheaper
    ];
    expect(venuePriceSummary(fields, "private")).toEqual({ kind: "from", price: 30 });
  });

  it("falls back to every field when none are bookable", () => {
    const fields = [
      { price_per_hour: 40, booking_url: null },
      { price_per_hour: 20, booking_url: null },
    ];
    expect(venuePriceSummary(fields, "private")).toEqual({ kind: "from", price: 20 });
  });

  it("rolls up to unknown for a non-park venue with no priced fields at all", () => {
    const fields = [
      { price_per_hour: null, booking_url: null },
      { price_per_hour: null, booking_url: "https://book.me" },
    ];
    expect(venuePriceSummary(fields, "private")).toEqual({ kind: "unknown" });
    expect(venuePriceSummary(fields, undefined)).toEqual({ kind: "unknown" });
  });

  it("rolls up to unknown for an empty field list", () => {
    expect(venuePriceSummary([], "private")).toEqual({ kind: "unknown" });
    expect(venuePriceSummary([], "public_park")).toEqual({ kind: "free" });
  });
});
