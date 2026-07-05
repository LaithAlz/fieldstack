import { describe, expect, it } from "bun:test";

import {
  platformBookingUrl,
  resolveFieldBooking,
} from "../scripts/scrape/lib/platformLinks.js";
import type { Operator } from "../scripts/scrape/lib/registry.js";
import type { ScrapedField } from "../scripts/scrape/types.js";

function operator(overrides: Partial<Operator> = {}): Operator {
  return {
    name: "Example Club",
    integrationType: "none",
    aliases: [],
    ...overrides,
  };
}

function field(overrides: Partial<ScrapedField> = {}): ScrapedField {
  return {
    externalId: "test:1",
    name: "Field 1",
    surface: "turf",
    size: "7v7",
    ...overrides,
  };
}

describe("platformBookingUrl", () => {
  it("builds the CourtReserve portal URL from the numeric OrgId", () => {
    const op = operator({ integrationType: "courtreserve", courtreserveOrgId: 12345 });
    expect(platformBookingUrl(op)).toBe(
      "https://app.courtreserve.com/Online/Portal/Index/12345"
    );
  });

  it("builds the Amilia storefront URL from the rewrite url", () => {
    const op = operator({ integrationType: "amilia", amiliaRewriteUrl: "example-club" });
    expect(platformBookingUrl(op)).toBe(
      "https://app.amilia.com/store/en/example-club/shop/programs"
    );
  });

  it("builds the Playtomic club URL from the slug", () => {
    const op = operator({ integrationType: "playtomic", playtomicSlug: "example-club" });
    expect(platformBookingUrl(op)).toBe("https://playtomic.com/clubs/example-club");
  });

  it("percent-encodes path segments", () => {
    const op = operator({ integrationType: "amilia", amiliaRewriteUrl: "mt joy/dome" });
    expect(platformBookingUrl(op)).toBe(
      `https://app.amilia.com/store/en/${encodeURIComponent("mt joy/dome")}/shop/programs`
    );
    const pt = operator({ integrationType: "playtomic", playtomicSlug: "club de fútbol" });
    expect(platformBookingUrl(pt)).toBe(
      `https://playtomic.com/clubs/${encodeURIComponent("club de fútbol")}`
    );
  });

  it("returns null when integration_type is none", () => {
    expect(platformBookingUrl(operator())).toBeNull();
  });

  it("returns null when the matching id is missing", () => {
    expect(platformBookingUrl(operator({ integrationType: "courtreserve" }))).toBeNull();
    expect(platformBookingUrl(operator({ integrationType: "amilia" }))).toBeNull();
    expect(platformBookingUrl(operator({ integrationType: "playtomic" }))).toBeNull();
  });
});

describe("resolveFieldBooking", () => {
  it("keeps the field's own bookingUrl + bookingPlatform, never overridden", () => {
    const op = operator({
      integrationType: "courtreserve",
      courtreserveOrgId: 999,
      bookingUrl: "https://example.com/book",
    });
    const f = field({
      bookingUrl: "https://playtomic.com/clubs/already-known",
      bookingPlatform: "playtomic",
    });
    expect(resolveFieldBooking(f, op)).toEqual({
      bookingUrl: "https://playtomic.com/clubs/already-known",
      bookingPlatform: "playtomic",
    });
  });

  it("falls back to the operator's platform deep link when the field has neither", () => {
    const op = operator({ integrationType: "courtreserve", courtreserveOrgId: 42 });
    expect(resolveFieldBooking(field(), op)).toEqual({
      bookingUrl: "https://app.courtreserve.com/Online/Portal/Index/42",
      bookingPlatform: "courtreserve",
    });
  });

  it("falls back to the operator's plain booking_url, tagged 'none', when there's no platform link", () => {
    const op = operator({ bookingUrl: "https://example.com/book" });
    expect(resolveFieldBooking(field(), op)).toEqual({
      bookingUrl: "https://example.com/book",
      bookingPlatform: "none",
    });
  });

  it("falls back to the operator's website when there's no booking_url either", () => {
    const op = operator({ website: "https://example.com" });
    expect(resolveFieldBooking(field(), op)).toEqual({
      bookingUrl: "https://example.com",
      bookingPlatform: "none",
    });
  });

  it("prefers the operator's platform link over its plain booking_url/website", () => {
    const op = operator({
      integrationType: "amilia",
      amiliaRewriteUrl: "example-club",
      bookingUrl: "https://example.com/book",
      website: "https://example.com",
    });
    expect(resolveFieldBooking(field(), op)).toEqual({
      bookingUrl: "https://app.amilia.com/store/en/example-club/shop/programs",
      bookingPlatform: "amilia",
    });
  });

  it("only tags the platform when the platform URL is what was actually used", () => {
    // integration_type set but id missing -> platformBookingUrl is null, so
    // the plain booking_url is used instead and must NOT be tagged amilia.
    const op = operator({
      integrationType: "amilia",
      bookingUrl: "https://example.com/book",
    });
    expect(resolveFieldBooking(field(), op)).toEqual({
      bookingUrl: "https://example.com/book",
      bookingPlatform: "none",
    });
  });

  it("returns {null, 'none'} when the field has nothing and there's no operator", () => {
    expect(resolveFieldBooking(field(), null)).toEqual({
      bookingUrl: null,
      bookingPlatform: "none",
    });
  });

  it("returns {null, 'none'} when the operator has no urls at all", () => {
    expect(resolveFieldBooking(field(), operator())).toEqual({
      bookingUrl: null,
      bookingPlatform: "none",
    });
  });
});

describe("resolveFieldBooking — field platform tag without field URL", () => {
  it("ignores a field bookingPlatform when the field carries no URL", () => {
    const op = {
      name: "Op",
      integrationType: "none" as const,
      aliases: [],
      website: "https://example.com",
    };
    const out = resolveFieldBooking(
      { externalId: "x:1", name: "F", surface: "grass" as const, size: "7v7" as const, bookingPlatform: "playtomic" as const },
      op
    );
    // Inherited generic website must not be mislabeled as a platform link.
    expect(out.bookingUrl).toBe("https://example.com");
    expect(out.bookingPlatform).toBe("none");
  });
});
