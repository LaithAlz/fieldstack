import { buildBookingUrl } from "../bookingUrl";

const DATE = new Date(2026, 6, 11); // 2026-07-11

describe("buildBookingUrl", () => {
  it("returns null when the field has no booking_url", () => {
    expect(
      buildBookingUrl({ booking_url: null, booking_platform: "playtomic" }, DATE, "19:00", 1.5)
    ).toBeNull();
  });

  it("appends date/start/duration params for playtomic", () => {
    const url = buildBookingUrl(
      { booking_url: "https://playtomic.io/venue/x", booking_platform: "playtomic" },
      DATE,
      "19:00",
      1.5
    );
    expect(url).not.toBeNull();
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("date")).toBe("2026-07-11");
    expect(parsed.searchParams.get("start")).toBe("19:00");
    expect(parsed.searchParams.get("duration")).toBe("90");
  });

  it("appends params for courtreserve too", () => {
    const url = buildBookingUrl(
      { booking_url: "https://app.courtreserve.com/venue/y", booking_platform: "courtreserve" },
      DATE,
      "09:00",
      2
    );
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("date")).toBe("2026-07-11");
    expect(parsed.searchParams.get("start")).toBe("09:00");
    expect(parsed.searchParams.get("duration")).toBe("120");
  });

  it("preserves existing query params on the base URL", () => {
    const url = buildBookingUrl(
      { booking_url: "https://playtomic.io/venue/x?ref=app", booking_platform: "playtomic" },
      DATE,
      "19:00",
      1
    );
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("ref")).toBe("app");
    expect(parsed.searchParams.get("date")).toBe("2026-07-11");
  });

  it("returns the raw URL unchanged for platforms that don't accept params", () => {
    expect(
      buildBookingUrl(
        { booking_url: "https://amilia.example/venue/z", booking_platform: "amilia" },
        DATE,
        "19:00",
        1
      )
    ).toBe("https://amilia.example/venue/z");
    expect(
      buildBookingUrl({ booking_url: "https://raw.example/z", booking_platform: "none" }, DATE, "19:00", 1)
    ).toBe("https://raw.example/z");
  });

  it("falls back to the raw string when the base URL isn't parseable", () => {
    expect(
      buildBookingUrl(
        { booking_url: "not-a-url", booking_platform: "playtomic" },
        DATE,
        "19:00",
        1
      )
    ).toBe("not-a-url");
  });
});
