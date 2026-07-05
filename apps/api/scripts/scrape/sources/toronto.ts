/**
 * City of Toronto PFR Sport Field layer (ArcGIS FeatureServer, Point
 * geometry) filtered to ASSET_TYPE='Soccer Field'. One row per field; we
 * group by ROLLUP_TO (the parent park name, UPPERCASE) into one venue per
 * park, same shape mississauga.ts/osm.ts produce.
 *
 * No address on the field layer itself — joined by exact-name match
 * against the CKAN parks-and-recreation-facilities GeoJSON (ASSET_NAME ->
 * ADDRESS); falls back to the park name when the join misses (ROLLUP_TO
 * sometimes carries a "- Sports Field Area" suffix the parks file doesn't).
 *
 * Licence: OGL-Toronto presumed site-wide (built for redistribution); this
 * specific layer isn't explicitly licence-stamped — confirmation with
 * opendata@toronto.ca outstanding (see docs/scraping.md §1.2).
 */

import { fetchGeoJsonFeatures } from "../lib/arcgis.js";
import type { ScrapeAdapter, ScrapedField, ScrapedVenue } from "../types.js";
import type { FieldSize, FieldSurface } from "../fieldEnums.js";

const SOCCER_FIELDS_URL =
  "https://gis.toronto.ca/arcgis/rest/services/cot_geospatial13/FeatureServer/54/query?where=ASSET_TYPE='Soccer Field'&outFields=*&f=geojson";
const PARKS_URL =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/cbea3a67-9168-4c6d-8186-16ac1a795b5b/resource/f6cdcd50-da7b-4ede-8e60-c3cdba70b559/download/parks-and-recreation-facilities-4326.geojson";

type TorontoFieldProps = {
  ASSET_ID: number;
  ASSET_NAME: string;
  PUBLIC_NAME?: string | null;
  ROLLUP_TO: string;
  SURFACE_MATERIAL?: string | null;
  LIGHTING_IND?: string | null;
  FIELD_SIZE_TYPE?: string | null;
  PERMIT_CLASSIFICATION?: string | null;
};

export type TorontoFeature = {
  properties: TorontoFieldProps;
  geometry: { type: "Point"; coordinates: [number, number] } | null;
};

type ParkProps = { ASSET_NAME?: string | null; ADDRESS?: string | null };

/** Collapse whitespace runs — Toronto's ASSET_NAME carries multi-space
 *  padding around the field index, e.g. "Soccer Field (  2)" -> "Soccer
 *  Field (2)". Only runs of 2+ whitespace chars are removed (entirely, not
 *  reduced to one) — single spaces between words are left alone. */
export function collapseWhitespace(s: string): string {
  return s.trim().replace(/\s{2,}/g, "");
}

/** Dumb title-case: split on spaces/hyphens, capitalize first letter,
 *  lowercase the rest. ROLLUP_TO isn't consistently uppercase (some carry
 *  a mixed-case "- Sports Field Area" suffix), so this normalizes either way. */
export function titleCase(s: string): string {
  return s
    .split(/[\s-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * SURFACE_MATERIAL probed values (2026-07-05, groupBy statistics over all
 * 229 rows): "Turf" (217), "Artificial Turf" (7), null (5) — no plain
 * "grass"/"natural" value exists in this layer. Mapping bare "Turf" to
 * "turf" too (not just spec's literal "artificial"/"synthetic" substrings)
 * because in this dataset "Turf" means synthetic turf, not natural grass —
 * same idiom as osm.ts's mapSurface. Null falls back to "grass".
 */
export function mapSurface(material: string | null | undefined): FieldSurface {
  const m = (material ?? "").toLowerCase();
  if (m.includes("turf") || m.includes("artificial") || m.includes("synthetic")) {
    return "turf";
  }
  return "grass";
}

/**
 * FIELD_SIZE_TYPE probed values: "Full" (57) / "Full Size" (5), "Junior"
 * (34), "Mini" (55) / "Mini-Pitch" (4), null (75). No numeric v-side hints,
 * so map by keyword: Mini -> smallest enum (3v3), Junior -> mid (7v7),
 * Full/null -> the Toronto permit-class full-size default (11v11).
 */
export function mapSize(sizeType: string | null | undefined): FieldSize {
  const s = (sizeType ?? "").toLowerCase();
  if (s.includes("mini")) return "3v3";
  if (s.includes("junior")) return "7v7";
  return "11v11";
}

/**
 * Canonical park key: Toronto's PFR layer uses inconsistent ROLLUP_TO
 * variants for one physical park ("BILL HANCOX PARK" vs "BILL HANCOX PARK
 * - Sports Field Area", live-confirmed pairs 17-116m apart) — grouping on
 * the raw string splits one park into two venues, and the variants are far
 * enough apart in name+distance to evade both dedupe tiers. Strip the
 * suffix before grouping; it also fixes the address join (the CKAN parks
 * file only carries the bare park name).
 */
export function parkKey(rollupTo: string): string {
  return rollupTo.replace(/\s*-\s*sports? field area.*$/i, "").trim();
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build ROLLUP_TO(uppercase park name) -> ADDRESS from the CKAN parks file. */
export function buildParkAddressMap(
  parkFeatures: { properties: ParkProps }[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of parkFeatures) {
    const p = f.properties;
    if (p.ASSET_NAME && p.ADDRESS && p.ADDRESS.trim().length > 0) {
      out.set(p.ASSET_NAME, p.ADDRESS.trim());
    }
  }
  return out;
}

/** Group soccer-field features by ROLLUP_TO into one venue per park. */
export function groupIntoVenues(
  features: TorontoFeature[],
  parkAddresses: Map<string, string>
): ScrapedVenue[] {
  const byPark = new Map<string, TorontoFeature[]>();
  for (const f of features) {
    const key = parkKey(f.properties.ROLLUP_TO);
    const list = byPark.get(key);
    if (list) list.push(f);
    else byPark.set(key, [f]);
  }

  const venues: ScrapedVenue[] = [];
  for (const [rollupTo, fields] of byPark) {
    const coords = fields
      .map((f) => f.geometry?.coordinates ?? null)
      .filter((c): c is [number, number] => c !== null);
    const lat =
      coords.length > 0 ? coords.reduce((sum, c) => sum + c[1], 0) / coords.length : null;
    const lng =
      coords.length > 0 ? coords.reduce((sum, c) => sum + c[0], 0) / coords.length : null;
    const hasLights = fields.some((f) => f.properties.LIGHTING_IND === "Y");

    const scrapedFields: ScrapedField[] = fields.map((f) => {
      const p = f.properties;
      const name =
        p.PUBLIC_NAME && p.PUBLIC_NAME.trim().length > 0
          ? p.PUBLIC_NAME.trim()
          : collapseWhitespace(p.ASSET_NAME);
      return {
        externalId: `toronto:field-${p.ASSET_ID}`,
        name,
        surface: mapSurface(p.SURFACE_MATERIAL),
        size: mapSize(p.FIELD_SIZE_TYPE),
        pricePerHour: null,
        bookingUrl: null,
      };
    });

    venues.push({
      externalId: `toronto:park-${slug(rollupTo)}`,
      name: titleCase(rollupTo),
      address: parkAddresses.get(rollupTo) ?? rollupTo,
      lat,
      lng,
      photos: [],
      amenities: hasLights ? ["lights"] : [],
      venueType: "public_park",
      fields: scrapedFields,
    });
  }
  return venues;
}

async function fetchSoccerFields(): Promise<TorontoFeature[]> {
  return (await fetchGeoJsonFeatures(SOCCER_FIELDS_URL, "toronto")) as unknown as TorontoFeature[];
}

async function fetchParkAddresses(): Promise<Map<string, string>> {
  const features = await fetchGeoJsonFeatures(PARKS_URL, "toronto-parks");
  return buildParkAddressMap(features as unknown as { properties: ParkProps }[]);
}

export const torontoAdapter: ScrapeAdapter = {
  source: "toronto",
  label: "City of Toronto (PFR Sport Field)",
  async run() {
    const [features, parkAddresses] = await Promise.all([
      fetchSoccerFields(),
      fetchParkAddresses(),
    ]);
    // Drop coordless venues (every member field had null geometry) — a
    // card with no map pin isn't useful and OSM/municipal peers do the same.
    return groupIntoVenues(features, parkAddresses).filter((v) => v.lat !== null);
  },
};
