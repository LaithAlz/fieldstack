import { priceDisplayFor } from "../priceDisplay";

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
