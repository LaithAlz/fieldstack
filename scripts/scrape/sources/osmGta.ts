/**
 * OpenStreetMap soccer facilities in the GTA region. Catches private
 * commercial venues (indoor turf places, sports centres, club-owned
 * grounds) that the city open-data sources miss.
 *
 * Source: Overpass API (free, no auth, no ToS friction for derivative use).
 *
 * We only ingest OSM features that have a `name` tag — anonymous
 * `leisure=pitch` entries in random parks aren't useful for the user. Named
 * features cover the cases that matter: "Hangar 7v7", "Soccer World",
 * "Scarborough Soccer Centre", etc.
 */

import type { ScrapeAdapter, ScrapedField, ScrapedVenue } from "../types.js";
import type { FieldSize, FieldSurface, VenueType } from "../fieldEnums.js";

// GTA + Halton + Hamilton bounding box (south,west,north,east).
// Wide enough to cover Toronto, Mississauga, Brampton, Vaughan, Markham,
// Oakville, Burlington, Milton, Hamilton.
const BBOX = { south: 43.0, west: -80.5, north: 44.0, east: -79.0 };

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const QUERY = `
[out:json][timeout:90];
(
  way["leisure"="pitch"]["sport"="soccer"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["leisure"="pitch"]["sport"="soccer"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["leisure"="sports_centre"]["sport"="soccer"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["leisure"="sports_centre"]["sport"="soccer"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["sport"="soccer"]["building"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out center tags;
`.trim();

type OsmTags = Record<string, string | undefined>;

type OsmElement = {
  type: "way" | "node" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
};

type OsmResponse = {
  elements: OsmElement[];
};

function mapSurface(tag: string | undefined): FieldSurface {
  if (!tag) return "grass";
  const t = tag.toLowerCase();
  if (t.includes("artificial") || t.includes("turf") || t === "synthetic") return "turf";
  if (t === "grass" || t === "natural") return "grass";
  if (t === "concrete" || t === "asphalt" || t === "paved") return "concrete";
  return "grass";
}

function mapSize(tags: OsmTags): FieldSize {
  // OSM rarely tags v/v sizes. Use dimensions when available.
  const length = parseInt(tags["length"] ?? "", 10);
  if (Number.isFinite(length)) {
    if (length > 80) return "11v11";
    if (length > 50) return "7v7";
    return "5v5";
  }
  // Indoor sports_centre with sport=soccer is typically 5v5 / 7v7 / futsal.
  if (tags["leisure"] === "sports_centre") return "5v5";
  if (tags["sport"] === "futsal") return "futsal";
  return "11v11"; // outdoor pitches default to full-size
}

function looksIndoor(tags: OsmTags): boolean {
  if (tags["leisure"] === "sports_centre") return true;
  if (tags["indoor"] === "yes") return true;
  if (tags["building"]) return true;
  return false;
}

function buildAddress(tags: OsmTags): string {
  // OSM addr:* schema. Fall back to the name if nothing structured.
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
  ].filter((p) => p && p.length > 0);
  if (parts.length > 0) return parts.join(", ");
  return tags["name"] ?? "Address unavailable";
}

function deriveVenueType(tags: OsmTags, name: string): VenueType {
  const lower = name.toLowerCase();
  // Name signals first — most reliable when the operator brands it.
  if (
    lower.includes("community centre") ||
    lower.includes("community center") ||
    lower.includes("rec centre") ||
    lower.includes("recreation centre") ||
    lower.includes("recreation center") ||
    lower.includes("ymca")
  ) {
    return "community_centre";
  }
  // Indoor sports centres + named buildings + soccer-tagged buildings are
  // commercial / club facilities. Same heuristic the migration's backfill
  // used for OSM rows.
  if (looksIndoor(tags)) return "private";
  return "public_park";
}

function buildAmenities(tags: OsmTags): string[] {
  const out: string[] = [];
  if (tags["lit"] === "yes" || tags["lighting"] === "yes") out.push("lights");
  if (looksIndoor(tags)) out.push("indoor");
  if (tags["covered"] === "yes") out.push("covered");
  if (tags["parking"]) out.push("parking");
  return out;
}

async function fetchOsm(): Promise<OsmElement[]> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "FieldStack-scraper/1.0 (https://fieldstack.app)",
    },
    body: new URLSearchParams({ data: QUERY }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Overpass fetch failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as OsmResponse;
  return body.elements ?? [];
}

export const osmGtaAdapter: ScrapeAdapter = {
  source: "osm-gta",
  label: "OpenStreetMap (GTA + Hamilton)",
  async run() {
    const elements = await fetchOsm();
    const venues: ScrapedVenue[] = [];

    for (const el of elements) {
      const tags = el.tags ?? {};
      const name = tags["name"];
      if (!name || name.length < 2) continue; // skip unnamed pitches — not useful for users

      const coord = el.center ?? { lat: el.lat ?? NaN, lon: el.lon ?? NaN };
      if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) continue;

      const surface: FieldSurface = looksIndoor(tags)
        ? "indoor"
        : mapSurface(tags["surface"]);
      const size = mapSize(tags);
      const venueExternalId = `osm:${el.type}/${el.id}`;
      const field: ScrapedField = {
        externalId: `osm:field-${el.type}-${el.id}`,
        name: name,
        surface,
        size,
        pricePerHour: null,
        bookingUrl: tags["website"] ?? null,
      };
      venues.push({
        externalId: venueExternalId,
        name,
        address: buildAddress(tags),
        lat: coord.lat,
        lng: coord.lon,
        photos: [],
        amenities: buildAmenities(tags),
        venueType: deriveVenueType(tags, name),
        fields: [field],
      });
    }
    return venues;
  },
};
