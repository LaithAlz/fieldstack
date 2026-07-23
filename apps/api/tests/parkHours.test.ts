import { describe, expect, it } from "bun:test";

import { resolveParkHours, PARK_BYLAW_HOURS } from "../scripts/scrape/lib/parkHours.js";
import { resolveVenueHours } from "../scripts/scrape/lib/venueHours.js";
import type { ScrapedVenue } from "../scripts/scrape/types.js";

function venue(partial: Partial<ScrapedVenue>): ScrapedVenue {
  return {
    externalId: "toronto:park-example",
    name: "Example Park",
    address: "Toronto, ON",
    lat: 43.65,
    lng: -79.38,
    photos: [],
    amenities: [],
    venueType: "public_park",
    fields: [],
    ...partial,
  };
}

describe("resolveParkHours", () => {
  it("returns the city bylaw window for a public park, keyed on the source prefix", () => {
    expect(resolveParkHours(venue({ externalId: "toronto:park-a" }))?.mon).toBe("05:30-24:00");
    expect(resolveParkHours(venue({ externalId: "mississauga:parent-1" }))?.mon).toBe("06:00-23:00");
    expect(resolveParkHours(venue({ externalId: "brampton:park-9" }))?.mon).toBe("07:00-23:00");
  });

  it("covers all seven days", () => {
    const h = resolveParkHours(venue({ externalId: "toronto:park-a" }))!;
    for (const d of ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]) {
      expect(h[d]).toBe("05:30-24:00");
    }
  });

  it("returns null for non-park venue types", () => {
    expect(resolveParkHours(venue({ venueType: "private" }))).toBeNull();
    expect(resolveParkHours(venue({ venueType: "community_centre" }))).toBeNull();
    expect(resolveParkHours(venue({ venueType: null }))).toBeNull();
  });

  it("returns null for a source city with no encoded bylaw (e.g. osm parks elsewhere)", () => {
    expect(resolveParkHours(venue({ externalId: "osm:way/123" }))).toBeNull();
    expect(resolveParkHours(venue({ externalId: "google:abc" }))).toBeNull();
  });

  it("never overrides real observed hours: adapter/operator win over bylaw", () => {
    const v = venue({ externalId: "toronto:park-a", hours: { mon: "08:00-22:00" } });
    // Mirrors run.ts: resolveVenueHours(...) ?? resolveParkHours(v)
    const applied = resolveVenueHours(v.hours, null) ?? resolveParkHours(v);
    expect(applied?.mon).toBe("08:00-22:00");

    const operatorHours = { mon: "09:00-21:00" };
    const applied2 = resolveVenueHours(undefined, operatorHours) ?? resolveParkHours(v);
    expect(applied2?.mon).toBe("09:00-21:00");
  });

  it("bylaw applies only when there are no adapter/operator hours", () => {
    const v = venue({ externalId: "brampton:park-9" });
    const applied = resolveVenueHours(undefined, null) ?? resolveParkHours(v);
    expect(applied?.mon).toBe("07:00-23:00");
  });
});

describe("PARK_BYLAW_HOURS data integrity", () => {
  it("every window satisfies the app's parseRange rule (open < close <= 24:00)", () => {
    for (const [city, week] of Object.entries(PARK_BYLAW_HOURS)) {
      for (const [day, value] of Object.entries(week)) {
        const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(value);
        expect(m, `${city}.${day} = ${value}`).not.toBeNull();
        const open = Number(m![1]) * 60 + Number(m![2]);
        const close = Number(m![3]) * 60 + Number(m![4]);
        expect(open).toBeGreaterThanOrEqual(0);
        expect(close).toBeGreaterThan(open);
        expect(close).toBeLessThanOrEqual(24 * 60);
      }
    }
  });
});
