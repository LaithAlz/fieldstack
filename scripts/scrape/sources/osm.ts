/**
 * OpenStreetMap soccer-venue adapter. Reads the city list from
 * data/cities.yaml (no hardcoded constants), runs one Overpass
 * `area` query per city, and returns the normalized ScrapedVenue
 * records.
 *
 * Per-city queries (vs one big union) keep us well under the
 * Overpass gateway timeout — 10 cities in a single area query
 * reliably 504s. The downside is N requests instead of 1; the
 * upside is incremental progress logging and graceful per-city
 * failure.
 *
 * Admin-boundary scoping (vs bbox) keeps results clean — no
 * leakage between adjacent cities. Area IDs are derived from OSM
 * relation IDs by adding the Overpass convention offset
 * 3_600_000_000.
 *
 * Only named features are kept — anonymous `leisure=pitch` entries
 * in random parks aren't useful for the user.
 */

import type { ScrapeAdapter, ScrapedField, ScrapedVenue } from "../types.js";
import type { FieldSize, FieldSurface, VenueType } from "../fieldEnums.js";
import { loadCities } from "../lib/registry.js";

const AREA_OFFSET = 3_600_000_000;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function buildQueryForCity(relationId: number): string {
  const areaId = AREA_OFFSET + relationId;
  return `
[out:json][timeout:120];
area(${areaId})->.city;
(
  way(area.city)["leisure"="pitch"]["sport"="soccer"]["name"];
  node(area.city)["leisure"="pitch"]["sport"="soccer"]["name"];
  way(area.city)["leisure"="sports_centre"]["sport"="soccer"]["name"];
  node(area.city)["leisure"="sports_centre"]["sport"="soccer"]["name"];
  way(area.city)["sport"="soccer"]["building"]["name"];
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
  remark?: string;
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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with retry on 429 / 503 / 504. Overpass throttles aggressive
 * scrapers; per-IP slot reservations live for ~30s. Backoff at 8s,
 * 20s, 40s.
 */
async function fetchOsmForCity(
  cityName: string,
  relationId: number
): Promise<OsmElement[]> {
  const backoffsMs: number[] = [0, 8000, 20000, 40000];
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
    const delayMs = backoffsMs[attempt] ?? 0;
    if (delayMs > 0) {
      console.log(
        `[osm]   ${cityName}: backing off ${delayMs / 1000}s before retry`
      );
      await sleep(delayMs);
    }
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Onside-scraper/1.0 (https://getonside.ca)",
        },
        body: new URLSearchParams({
          data: buildQueryForCity(relationId),
        }).toString(),
      });
      if (res.status === 429 || res.status === 503 || res.status === 504) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) {
        throw new Error(
          `Overpass fetch failed for ${cityName}: ${res.status} ${res.statusText}`
        );
      }
      const body = (await res.json()) as OsmResponse;
      // Overpass returns HTTP 200 even on timeout — detect it via the
      // remark field so the backoff retry loop can handle it.
      if (body.remark?.toLowerCase().includes("timed out")) {
        lastErr = new Error(`Overpass timeout for ${cityName}`);
        continue;
      }
      return body.elements ?? [];
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `Overpass fetch failed for ${cityName} after ${backoffsMs.length} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}

function toScrapedVenue(el: OsmElement): ScrapedVenue | null {
  const tags = el.tags ?? {};
  const name = tags["name"];
  if (!name || name.length < 2) return null;

  const coord = el.center ?? { lat: el.lat ?? NaN, lon: el.lon ?? NaN };
  if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) return null;

  const surface: FieldSurface = looksIndoor(tags)
    ? "indoor"
    : mapSurface(tags["surface"]);
  const size = mapSize(tags);
  const venueExternalId = `osm:${el.type}/${el.id}`;
  const field: ScrapedField = {
    externalId: `osm:field-${el.type}-${el.id}`,
    name,
    surface,
    size,
    pricePerHour: null,
    // OSM `website` tag is rarely set on individual venues; the runner
    // falls back to the matched operator's URL when this is null.
    bookingUrl: tags["website"] ?? null,
  };
  return {
    externalId: venueExternalId,
    name,
    address: buildAddress(tags),
    lat: coord.lat,
    lng: coord.lon,
    photos: [],
    amenities: buildAmenities(tags),
    venueType: deriveVenueType(tags, name),
    fields: [field],
  };
}

export const osmAdapter: ScrapeAdapter = {
  source: "osm",
  label: "OpenStreetMap (cities from data/cities.yaml)",
  async run() {
    const cities = loadCities();
    console.log(
      `[osm] sweeping ${cities.length} cities: ${cities.map((c) => c.name).join(", ")}`
    );

    const seenIds = new Set<string>();
    const venues: ScrapedVenue[] = [];

    for (const city of cities) {
      try {
        const elements = await fetchOsmForCity(city.name, city.osmRelationId);
        console.log(`[osm]   ${city.name}: ${elements.length} raw elements`);
        // Polite delay between cities so we don't trip Overpass's
        // per-IP rate limiter. 3s keeps us under the typical slot
        // reservation refresh window.
        await sleep(3000);
        for (const el of elements) {
          // Toronto and Hamilton are admin_level=6 and overlap with
          // smaller admin_level=8 cities — dedupe by OSM type+id so
          // we don't double-ingest a venue that sits in two areas.
          const dedupeKey = `${el.type}/${el.id}`;
          if (seenIds.has(dedupeKey)) continue;
          seenIds.add(dedupeKey);
          const v = toScrapedVenue(el);
          if (v) venues.push(v);
        }
      } catch (err) {
        console.warn(
          `[osm]   ${city.name}: failed —`,
          err instanceof Error ? err.message : err
        );
      }
    }
    return venues;
  },
};
