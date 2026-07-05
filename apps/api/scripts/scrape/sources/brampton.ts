/**
 * City of Brampton ParkFeatures layer (ArcGIS FeatureServer) filtered to
 * ASSET_NAME='SOCCER FIELD'. Each row is one park's whole soccer-field
 * bundle, geometry a single MultiPoint holding every field's coordinate —
 * we explode that into one placeholder ScrapedField per point, since the
 * source carries no per-field name/size/surface distinction.
 *
 * Address joined by exact FULL_NAME -> PARK_NAME match against the
 * ParksPts layer; probed 2026-07-05: only 41/91 soccer rows joined (many
 * are school grounds, e.g. "BRAMALEA S.S.", absent from ParksPts) — falls
 * back to the park name.
 *
 * Licence: CC BY 4.0, confirmed on the service item. Attribution required.
 */

import { fetchGeoJsonFeatures } from "../lib/arcgis.js";
import type { ScrapeAdapter, ScrapedField, ScrapedVenue } from "../types.js";

const SOCCER_ROWS_URL =
  "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/ParkFeatures/FeatureServer/0/query?where=ASSET_NAME='SOCCER FIELD'&outFields=*&f=geojson";
const PARKS_PTS_URL =
  "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/ParksPts/FeatureServer/0/query?where=1=1&outFields=PARK_NAME,ADDRESS&f=geojson";

type BramptonRowProps = {
  OBJECTID: number;
  ID: string;
  FULL_NAME: string;
  ASSET_NAME: string;
};

type MultiPointGeom = { type: "MultiPoint"; coordinates: [number, number][] };
type PointGeom = { type: "Point"; coordinates: [number, number] };

export type BramptonRow = {
  properties: BramptonRowProps;
  geometry: MultiPointGeom | PointGeom | null;
};

type ParkPtsProps = { PARK_NAME?: string | null; ADDRESS?: string | null };

/** Dumb title-case: split on spaces/hyphens, capitalize first letter,
 *  lowercase the rest (same idiom as toronto.ts's titleCase). */
export function titleCase(s: string): string {
  return s
    .split(/[\s-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Every coordinate a row's geometry carries, whether MultiPoint (the
 *  common case) or a bare Point (defensive — not observed in the 91 live
 *  rows, but the schema allows a single-field park to collapse to one). */
export function coordsOf(geometry: BramptonRow["geometry"]): [number, number][] {
  if (!geometry) return [];
  return geometry.type === "MultiPoint" ? geometry.coordinates : [geometry.coordinates];
}

/**
 * Explode one row's MultiPoint into per-field placeholders, 1-based index.
 * Point order isn't guaranteed stable between city data updates — that's
 * acceptable because these fields are interchangeable, unnamed placeholders;
 * a reorder just renames "Field 3" to "Field 4", not a real data loss.
 */
export function explodeFields(rowId: string, geometry: BramptonRow["geometry"]): ScrapedField[] {
  return coordsOf(geometry).map((_, i) => {
    const n = i + 1;
    return {
      externalId: `brampton:field-${rowId}-${n}`,
      name: `Soccer Field ${n}`,
      surface: "grass",
      size: "7v7",
      pricePerHour: null,
      bookingUrl: null,
    };
  });
}

/** Build FULL_NAME(uppercase park name) -> ADDRESS from the ParksPts layer. */
export function buildParkAddressMap(
  parkFeatures: { properties: ParkPtsProps }[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of parkFeatures) {
    const p = f.properties;
    if (p.PARK_NAME && p.ADDRESS && p.ADDRESS.trim().length > 0) {
      out.set(p.PARK_NAME, p.ADDRESS.trim());
    }
  }
  return out;
}

/** One venue per row (row = park+soccer bundle). */
export function toVenue(row: BramptonRow, parkAddresses: Map<string, string>): ScrapedVenue {
  const p = row.properties;
  const coords = coordsOf(row.geometry);
  const lat = coords.length > 0 ? coords.reduce((sum, c) => sum + c[1], 0) / coords.length : null;
  const lng = coords.length > 0 ? coords.reduce((sum, c) => sum + c[0], 0) / coords.length : null;

  return {
    externalId: `brampton:park-${p.ID}`,
    name: titleCase(p.FULL_NAME),
    address: parkAddresses.get(p.FULL_NAME) ?? p.FULL_NAME,
    lat,
    lng,
    photos: [],
    amenities: [],
    venueType: "public_park",
    fields: explodeFields(p.ID, row.geometry),
  };
}

async function fetchSoccerRows(): Promise<BramptonRow[]> {
  return (await fetchGeoJsonFeatures(SOCCER_ROWS_URL, "brampton")) as unknown as BramptonRow[];
}

async function fetchParkAddresses(): Promise<Map<string, string>> {
  const features = await fetchGeoJsonFeatures(PARKS_PTS_URL, "brampton-parks");
  return buildParkAddressMap(features as unknown as { properties: ParkPtsProps }[]);
}

export const bramptonAdapter: ScrapeAdapter = {
  source: "brampton",
  label: "City of Brampton (GeoHub ParkFeatures)",
  async run() {
    const [rows, parkAddresses] = await Promise.all([fetchSoccerRows(), fetchParkAddresses()]);
    return rows.map((r) => toVenue(r, parkAddresses));
  },
};
