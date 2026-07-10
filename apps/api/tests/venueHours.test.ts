import { describe, expect, it } from "bun:test";

import { resolveVenueHours } from "../scripts/scrape/lib/venueHours.js";

describe("resolveVenueHours", () => {
  it("prefers the adapter's own hours when present", () => {
    const adapterHours = { mon: "06:00-23:00", tue: null };
    const operatorHours = { mon: "09:00-21:00", tue: "09:00-21:00" };
    expect(resolveVenueHours(adapterHours, operatorHours)).toEqual(adapterHours);
  });

  it("falls back to the operator's hours when the adapter supplied none", () => {
    const operatorHours = { mon: "09:00-21:00" };
    expect(resolveVenueHours(null, operatorHours)).toEqual(operatorHours);
    expect(resolveVenueHours(undefined, operatorHours)).toEqual(operatorHours);
  });

  it("returns null when neither source has hours", () => {
    expect(resolveVenueHours(null, null)).toBeNull();
    expect(resolveVenueHours(undefined, undefined)).toBeNull();
  });

  it("does not merge per day: adapter hours entirely replace operator hours", () => {
    // Adapter supplied only Monday; Tuesday is NOT backfilled from the
    // operator block, because the adapter is treated as the venue's own
    // authoritative claim, not a partial patch over the registry default.
    const adapterHours = { mon: "06:00-23:00" };
    const operatorHours = { mon: "09:00-21:00", tue: "09:00-21:00" };
    expect(resolveVenueHours(adapterHours, operatorHours)).toEqual(adapterHours);
  });

  it("treats an empty adapter hours object as present (still wins over operator hours)", () => {
    // {} is not null/undefined, so ?? treats it as supplied.
    expect(resolveVenueHours({}, { mon: "09:00-21:00" })).toEqual({});
  });
});
