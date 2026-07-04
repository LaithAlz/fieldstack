import { describe, expect, it } from "bun:test";

import {
  clubUrl,
  isSoccerResource,
  mapOpeningHours,
  tenantToVenue,
  type PlaytomicResource,
  type PlaytomicTenant,
} from "../scripts/scrape/sources/playtomic.js";

function tenant(overrides: Partial<PlaytomicTenant> = {}): PlaytomicTenant {
  return {
    tenant_id: "32fc76cf-f602-45d0-b698-2708748d3e39",
    tenant_uid: "neon-padel",
    slug: "neon-padel",
    tenant_name: "Neon Padel",
    tenant_status: "ACTIVE",
    playtomic_status: "ACTIVE",
    address: {
      street: "River Side Sport Arena",
      city: "Toronto",
      coordinate: { lat: 43.653226, lon: -79.3831843 },
    },
    images: ["https://res.cloudinary.com/playtomic/image/upload/venue.jpg"],
    resources: [
      {
        resource_id: "de8b1f8e-0000-0000-0000-000000000000",
        name: "Futsal 1",
        sport_id: "FUTSAL",
        is_active: true,
        properties: { resource_type: "indoor", resource_size: "single" },
      },
    ],
    opening_hours: {
      MONDAY: { opening_time: "09:00", closing_time: "21:00" },
    },
    default_cancelation_policy: { amount: 24, unit: "HOURS" },
    sport_ids: ["FUTSAL"],
    ...overrides,
  };
}

function resource(overrides: Partial<PlaytomicResource> = {}): PlaytomicResource {
  return {
    resource_id: "r1",
    name: "Padel 1",
    sport_id: "PADEL",
    is_active: true,
    properties: { resource_type: "indoor" },
    ...overrides,
  };
}

describe("isSoccerResource", () => {
  it("accepts active FUTSAL/FOOTBALL7 resources", () => {
    expect(isSoccerResource(resource({ sport_id: "FUTSAL" }))).toBe(true);
    expect(isSoccerResource(resource({ sport_id: "FOOTBALL7" }))).toBe(true);
  });

  it("rejects padel and other non-soccer sports", () => {
    expect(isSoccerResource(resource({ sport_id: "PADEL" }))).toBe(false);
    expect(isSoccerResource(resource({ sport_id: "SOCCER" }))).toBe(false);
  });

  it("rejects inactive resources even with a soccer sport id", () => {
    expect(
      isSoccerResource(resource({ sport_id: "FUTSAL", is_active: false }))
    ).toBe(false);
  });
});

describe("tenantToVenue", () => {
  it("returns null for a padel-only tenant", () => {
    const t = tenant({ resources: [resource({ sport_id: "PADEL" })] });
    expect(tenantToVenue(t)).toBeNull();
  });

  it("returns null when playtomic_status is not ACTIVE", () => {
    expect(tenantToVenue(tenant({ playtomic_status: "INACTIVE" }))).toBeNull();
    expect(tenantToVenue(tenant({ playtomic_status: "UNBOOKABLE" }))).toBeNull();
  });

  it("returns null when both slug and tenant_uid are missing", () => {
    expect(
      tenantToVenue(tenant({ slug: undefined, tenant_uid: undefined }))
    ).toBeNull();
  });

  it("returns null when the coordinate is missing", () => {
    expect(
      tenantToVenue(tenant({ address: { street: "x", city: "y" } }))
    ).toBeNull();
  });

  it("excludes inactive soccer resources, dropping the venue when that was the only one", () => {
    const t = tenant({
      resources: [
        resource({ sport_id: "FUTSAL", is_active: false, resource_id: "r-dead" }),
      ],
    });
    expect(tenantToVenue(t)).toBeNull();
  });

  it("maps an ACTIVE tenant with mixed soccer resources to a venue with two fields", () => {
    const t = tenant({
      resources: [
        {
          resource_id: "r-futsal",
          name: "Futsal Court",
          sport_id: "FUTSAL",
          is_active: true,
          properties: { resource_type: "indoor", resource_size: "single" },
        },
        {
          resource_id: "r-7v7",
          name: "Field 7",
          sport_id: "FOOTBALL7",
          is_active: true,
          properties: { resource_type: "outdoor", resource_size: "double" },
        },
      ],
    });

    const v = tenantToVenue(t);
    expect(v).not.toBeNull();
    expect(v!.externalId).toBe(`playtomic:${t.tenant_id}`);
    expect(v!.name).toBe("Neon Padel");
    expect(v!.venueType).toBe("private");
    expect(v!.amenities).toEqual(["indoor"]);
    expect(v!.confidence).toBe(3);
    expect(v!.fields).toHaveLength(2);

    const futsalField = v!.fields.find((f) => f.externalId.endsWith(":r-futsal"))!;
    expect(futsalField.externalId).toBe(`playtomic:${t.tenant_id}:r-futsal`);
    expect(futsalField.surface).toBe("indoor");
    expect(futsalField.size).toBe("futsal");
    expect(futsalField.bookingPlatform).toBe("playtomic");
    expect(futsalField.bookingUrl).toBe(clubUrl("neon-padel"));

    const outdoorField = v!.fields.find((f) => f.externalId.endsWith(":r-7v7"))!;
    expect(outdoorField.externalId).toBe(`playtomic:${t.tenant_id}:r-7v7`);
    expect(outdoorField.surface).toBe("turf");
    expect(outdoorField.size).toBe("7v7");
    expect(outdoorField.bookingPlatform).toBe("playtomic");
  });
});

describe("clubUrl", () => {
  it("passes a plain slug through unchanged", () => {
    expect(clubUrl("neon-padel")).toBe("https://playtomic.com/clubs/neon-padel");
  });

  it("percent-encodes non-ASCII characters", () => {
    const uid = "club-de-fútbol-madrid-río---sede-montecarmelo-new";
    expect(clubUrl(uid)).toBe(`https://playtomic.com/clubs/${encodeURIComponent(uid)}`);
    expect(clubUrl(uid)).toContain("%C3%BA");
  });

  it("leaves parens as-is — encodeURIComponent treats them as unreserved", () => {
    expect(clubUrl("club-de-futbol-(sede-norte)")).toBe(
      "https://playtomic.com/clubs/club-de-futbol-(sede-norte)"
    );
  });
});

describe("mapOpeningHours", () => {
  const fullWeek = {
    SUNDAY: { opening_time: "10:00", closing_time: "20:00" },
    MONDAY: { opening_time: "09:00", closing_time: "21:00" },
    TUESDAY: { opening_time: "09:00", closing_time: "21:00" },
    WEDNESDAY: { opening_time: "09:00", closing_time: "21:00" },
    THURSDAY: { opening_time: "09:00", closing_time: "21:00" },
    FRIDAY: { opening_time: "09:00", closing_time: "22:00" },
    SATURDAY: { opening_time: "10:00", closing_time: "20:00" },
  };

  it("maps the full week to lowercase 3-letter keys", () => {
    expect(mapOpeningHours(fullWeek)).toEqual({
      sun: "10:00-20:00",
      mon: "09:00-21:00",
      tue: "09:00-21:00",
      wed: "09:00-21:00",
      thu: "09:00-21:00",
      fri: "09:00-22:00",
      sat: "10:00-20:00",
    });
  });

  it("skips days that are missing entirely", () => {
    expect(mapOpeningHours({ MONDAY: fullWeek.MONDAY })).toEqual({
      mon: "09:00-21:00",
    });
  });

  it("skips a malformed time entry", () => {
    expect(
      mapOpeningHours({ MONDAY: { opening_time: "9am", closing_time: "21:00" } })
    ).toBeNull();
  });

  it("returns null when nothing maps", () => {
    expect(mapOpeningHours({})).toBeNull();
    expect(mapOpeningHours(null)).toBeNull();
    expect(mapOpeningHours(undefined)).toBeNull();
  });
});
