import { describe, expect, it } from "bun:test";

import {
  buildParkAddressMap as buildTorontoParkAddressMap,
  collapseWhitespace,
  groupIntoVenues,
  mapSize as mapTorontoSize,
  mapSurface as mapTorontoSurface,
  titleCase,
  type TorontoFeature,
} from "../scripts/scrape/sources/toronto.js";
import {
  buildParkAddressMap as buildBramptonParkAddressMap,
  coordsOf,
  explodeFields,
  toVenue,
  type BramptonRow,
} from "../scripts/scrape/sources/brampton.js";

// --- fixtures copied from the real property shapes probed 2026-07-05 ---

function torontoField(overrides: Partial<TorontoFeature["properties"]> & { ASSET_ID: number }): TorontoFeature {
  return {
    properties: {
      ASSET_NAME: "HUMBER SHEPPARD PARK - Soccer Field (  1)",
      PUBLIC_NAME: null,
      ROLLUP_TO: "HUMBER SHEPPARD PARK",
      SURFACE_MATERIAL: "Turf",
      LIGHTING_IND: "N",
      FIELD_SIZE_TYPE: null,
      PERMIT_CLASSIFICATION: "A",
      ...overrides,
    },
    geometry: { type: "Point", coordinates: [-79.5, 43.7] },
  };
}

describe("toronto: groupIntoVenues", () => {
  it("groups two fields with the same ROLLUP_TO into one venue with mean coords", () => {
    const a = torontoField({
      ASSET_ID: 1,
      ASSET_NAME: "HUMBER SHEPPARD PARK - Soccer Field (  1)",
    });
    a.geometry = { type: "Point", coordinates: [-79.4, 43.6] };
    const b = torontoField({
      ASSET_ID: 2,
      ASSET_NAME: "HUMBER SHEPPARD PARK - Soccer Field (  2)",
    });
    b.geometry = { type: "Point", coordinates: [-79.6, 43.8] };

    const venues = groupIntoVenues([a, b], new Map());
    expect(venues).toHaveLength(1);
    const venue = venues[0]!;
    expect(venue.fields).toHaveLength(2);
    expect(venue.lat).toBeCloseTo(43.7, 5);
    expect(venue.lng).toBeCloseTo(-79.5, 5);
    expect(venue.externalId).toBe("toronto:park-humber-sheppard-park");
  });

  it("sets the lights amenity when ANY field in the park is lit", () => {
    const lit = torontoField({ ASSET_ID: 1, LIGHTING_IND: "Y" });
    const unlit = torontoField({ ASSET_ID: 2, LIGHTING_IND: "N" });
    const venues = groupIntoVenues([lit, unlit], new Map());
    expect(venues[0]!.amenities).toEqual(["lights"]);
  });

  it("has no lights amenity when no field is lit", () => {
    const unlit = torontoField({ ASSET_ID: 1, LIGHTING_IND: "N" });
    const venues = groupIntoVenues([unlit], new Map());
    expect(venues[0]!.amenities).toEqual([]);
  });

  it("uses the joined park address, falling back to the park name", () => {
    const f = torontoField({ ASSET_ID: 1 });
    const joined = groupIntoVenues([f], new Map([["HUMBER SHEPPARD PARK", "3100 Weston Rd"]]));
    expect(joined[0]!.address).toBe("3100 Weston Rd");

    const fallback = groupIntoVenues([f], new Map());
    expect(fallback[0]!.address).toBe("HUMBER SHEPPARD PARK");
  });

  it("prefers PUBLIC_NAME over the cleaned-up ASSET_NAME", () => {
    const f = torontoField({ ASSET_ID: 1, PUBLIC_NAME: "Humber Sheppard Field 1" });
    const venues = groupIntoVenues([f], new Map());
    expect(venues[0]!.fields[0]!.name).toBe("Humber Sheppard Field 1");
  });

  it("falls back to whitespace-collapsed ASSET_NAME when PUBLIC_NAME is empty", () => {
    const f = torontoField({
      ASSET_ID: 1,
      PUBLIC_NAME: null,
      ASSET_NAME: "HUMBER SHEPPARD PARK - Soccer Field (  2)",
    });
    const venues = groupIntoVenues([f], new Map());
    expect(venues[0]!.fields[0]!.name).toBe("HUMBER SHEPPARD PARK - Soccer Field (2)");
  });
});

describe("toronto: collapseWhitespace", () => {
  it("collapses whitespace runs", () => {
    expect(collapseWhitespace("Soccer Field (  2)")).toBe("Soccer Field (2)");
  });
});

describe("toronto: titleCase", () => {
  it("title-cases an uppercase park name", () => {
    expect(titleCase("HUMBER SHEPPARD PARK")).toBe("Humber Sheppard Park");
  });

  it("normalizes mixed-case ROLLUP_TO suffixes", () => {
    expect(titleCase("BILL HANCOX PARK - Sports Field Area")).toBe(
      "Bill Hancox Park Sports Field Area"
    );
  });
});

describe("toronto: mapSurface", () => {
  it('maps "Turf" to turf (this dataset uses it for synthetic turf, not grass)', () => {
    expect(mapTorontoSurface("Turf")).toBe("turf");
  });

  it('maps "Artificial Turf" to turf', () => {
    expect(mapTorontoSurface("Artificial Turf")).toBe("turf");
  });

  it("maps null/unknown to grass", () => {
    expect(mapTorontoSurface(null)).toBe("grass");
    expect(mapTorontoSurface(undefined)).toBe("grass");
  });
});

describe("toronto: mapSize", () => {
  it('maps "Full"/"Full Size" to 11v11', () => {
    expect(mapTorontoSize("Full")).toBe("11v11");
    expect(mapTorontoSize("Full Size")).toBe("11v11");
  });

  it('maps "Junior" to 7v7', () => {
    expect(mapTorontoSize("Junior")).toBe("7v7");
  });

  it('maps "Mini"/"Mini-Pitch" to 3v3', () => {
    expect(mapTorontoSize("Mini")).toBe("3v3");
    expect(mapTorontoSize("Mini-Pitch")).toBe("3v3");
  });

  it("defaults null/unknown to 11v11", () => {
    expect(mapTorontoSize(null)).toBe("11v11");
  });
});

describe("toronto: buildParkAddressMap", () => {
  it("keys by ASSET_NAME, skipping blank addresses", () => {
    const map = buildTorontoParkAddressMap([
      { properties: { ASSET_NAME: "MCNICOLL PARK", ADDRESS: "215 McNicoll Ave" } },
      { properties: { ASSET_NAME: "NO ADDRESS PARK", ADDRESS: "  " } },
    ]);
    expect(map.get("MCNICOLL PARK")).toBe("215 McNicoll Ave");
    expect(map.has("NO ADDRESS PARK")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Brampton
// ---------------------------------------------------------------------------

function bramptonRow(geometry: BramptonRow["geometry"], overrides: Partial<BramptonRow["properties"]> = {}): BramptonRow {
  return {
    properties: {
      OBJECTID: 3,
      ID: "43",
      FULL_NAME: "DONALD M GORDON CHINGUACOUSY PARK",
      ASSET_NAME: "SOCCER FIELD",
      ...overrides,
    },
    geometry,
  };
}

describe("brampton: explodeFields / coordsOf", () => {
  it("explodes a 3-point MultiPoint into 3 fields with 1-based ids", () => {
    const geometry: BramptonRow["geometry"] = {
      type: "MultiPoint",
      coordinates: [
        [-79.83, 43.68],
        [-79.84, 43.69],
        [-79.85, 43.7],
      ],
    };
    const fields = explodeFields("43", geometry);
    expect(fields).toHaveLength(3);
    expect(fields.map((f) => f.externalId)).toEqual([
      "brampton:field-43-1",
      "brampton:field-43-2",
      "brampton:field-43-3",
    ]);
    expect(fields.map((f) => f.name)).toEqual([
      "Soccer Field 1",
      "Soccer Field 2",
      "Soccer Field 3",
    ]);
  });

  it("treats a bare Point as a 1-point MultiPoint (defensive fallback)", () => {
    const geometry: BramptonRow["geometry"] = { type: "Point", coordinates: [-79.8, 43.6] };
    expect(coordsOf(geometry)).toEqual([[-79.8, 43.6]]);
    const fields = explodeFields("99", geometry);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.externalId).toBe("brampton:field-99-1");
  });

  it("returns no fields for null geometry", () => {
    expect(coordsOf(null)).toEqual([]);
    expect(explodeFields("1", null)).toEqual([]);
  });
});

describe("brampton: toVenue", () => {
  it("builds one venue per row with mean coords and title-cased name", () => {
    const row = bramptonRow({
      type: "MultiPoint",
      coordinates: [
        [-79.8, 43.6],
        [-79.9, 43.7],
      ],
    });
    const venue = toVenue(row, new Map());
    expect(venue.externalId).toBe("brampton:park-43");
    expect(venue.name).toBe("Donald M Gordon Chinguacousy Park");
    expect(venue.lat).toBeCloseTo(43.65, 5);
    expect(venue.lng).toBeCloseTo(-79.85, 5);
    expect(venue.fields).toHaveLength(2);
  });

  it("falls back to the park name when the ParksPts address join misses", () => {
    const row = bramptonRow({ type: "Point", coordinates: [-79.8, 43.6] }, {
      FULL_NAME: "BRAMALEA S.S.",
    });
    const venue = toVenue(row, new Map());
    expect(venue.address).toBe("BRAMALEA S.S.");
  });

  it("uses the joined ParksPts address when present", () => {
    const row = bramptonRow({ type: "Point", coordinates: [-79.8, 43.6] });
    const venue = toVenue(
      row,
      new Map([["DONALD M GORDON CHINGUACOUSY PARK", "9050 Bramalea Rd"]])
    );
    expect(venue.address).toBe("9050 Bramalea Rd");
  });
});

describe("brampton: buildParkAddressMap", () => {
  it("keys by PARK_NAME, skipping blank addresses", () => {
    const map = buildBramptonParkAddressMap([
      { properties: { PARK_NAME: "ABRAHAM BLOCK POND", ADDRESS: "10 ELBERN MARKELL DR" } },
      { properties: { PARK_NAME: "ABIGAIL GRACE POND", ADDRESS: " " } },
    ]);
    expect(map.get("ABRAHAM BLOCK POND")).toBe("10 ELBERN MARKELL DR");
    expect(map.has("ABIGAIL GRACE POND")).toBe(false);
  });
});
