/**
 * OpenStreetMap soccer facilities, scoped by municipal admin boundary.
 *
 * Bounding-box queries (the old approach) leaked neighboring cities into
 * results — a bbox around Oakville/Hamilton/Milton overlapped with western
 * Mississauga + Burlington. Overpass `area` lookups against OSM relation IDs
 * give us proper municipal boundaries, no leakage.
 *
 * Each entry in CITIES is the OSM relation ID for the city's admin boundary.
 * Area IDs are derived by adding 3_600_000_000 (Overpass convention).
 *
 * To extend (e.g. add Burlington / Toronto / Brampton):
 *   1. Find the OSM relation: nominatim.openstreetmap.org → search the city,
 *      open the result, copy the relation id (it's in the URL).
 *   2. Append `{ name, relationId }` here and re-run the scrape.
 *
 * Only named features are kept — anonymous `leisure=pitch` rows in random
 * parks aren't useful for the user.
 */

import type { ScrapeAdapter, ScrapedField, ScrapedVenue } from "../types.js";
import type { FieldSize, FieldSurface, VenueType } from "../fieldEnums.js";

type City = { name: string; relationId: number };

const CITIES: City[] = [
  { name: "Hamilton", relationId: 7034910 }, // City of Hamilton, ON (admin_level=6)
  { name: "Oakville", relationId: 2407500 }, // Town of Oakville, ON (admin_level=8)
  { name: "Milton",   relationId: 2414122 }, // Town of Milton, ON (admin_level=8)
];

const AREA_OFFSET = 3_600_000_000;

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function buildQuery(): string {
  const areas = CITIES.map((c) => `area(${AREA_OFFSET + c.relationId});`).join("");
  return `
[out:json][timeout:90];
(${areas})->.cities;
(
  way(area.cities)["leisure"="pitch"]["sport"="soccer"]["name"];
  node(area.cities)["leisure"="pitch"]["sport"="soccer"]["name"];
  way(area.cities)["leisure"="sports_centre"]["sport"="soccer"]["name"];
  node(area.cities)["leisure"="sports_centre"]["sport"="soccer"]["name"];
  way(area.cities)["sport"="soccer"]["building"]["name"];
);
out center tags;
`.trim();
}

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
  const length = parseInt(tags["length"] ?? "", 10);
  if (Number.isFinite(length)) {
    if (length > 80) return "11v11";
    if (length > 50) return "7v7";
    return "5v5";
  }
  if (tags["leisure"] === "sports_centre") return "5v5";
  if (tags["sport"] === "futsal") return "futsal";
  return "11v11";
}

function looksIndoor(tags: OsmTags): boolean {
  if (tags["leisure"] === "sports_centre") return true;
  if (tags["indoor"] === "yes") return true;
  if (tags["building"]) return true;
  return false;
}

function deriveVenueType(tags: OsmTags, name: string): VenueType {
  const lower = name.toLowerCase();
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
  if (looksIndoor(tags)) return "private";
  return "public_park";
}

function buildAddress(tags: OsmTags): string {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
  ].filter((p) => p && p.length > 0);
  if (parts.length > 0) return parts.join(", ");
  return tags["name"] ?? "Address unavailable";
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
    body: new URLSearchParams({ data: buildQuery() }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Overpass fetch failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as OsmResponse;
  return body.elements ?? [];
}

export const osmGtaAdapter: ScrapeAdapter = {
  source: "osm-halton-hamilton",
  label: `OpenStreetMap (${CITIES.map((c) => c.name).join(", ")})`,
  async run() {
    const elements = await fetchOsm();
    const venues: ScrapedVenue[] = [];

    for (const el of elements) {
      const tags = el.tags ?? {};
      const name = tags["name"];
      if (!name || name.length < 2) continue;

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
