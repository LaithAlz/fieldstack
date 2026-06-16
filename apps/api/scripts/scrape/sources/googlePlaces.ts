/**
 * Google Places (New) adapter — the discovery engine for PRIVATE / indoor
 * soccer facilities, which OSM barely covers. Every commercial dome,
 * sportsplex, and futsal centre is on Google Maps, so a text search across
 * the GTA surfaces the long tail OSM misses.
 *
 * Strategy: for each GTA city (data/cities.yaml) × a set of soccer-specific
 * search terms, run a Places Text Search, page through results (≤60/query),
 * and dedupe by place id across every query. Each discovered place becomes a
 * `private` venue with ONE placeholder indoor field (real field counts /
 * surfaces / prices come later from operator data) whose booking URL is the
 * facility's own website, so the "Book on operator's site" CTA works.
 *
 * Requires GOOGLE_PLACES_API_KEY (Places API New enabled, billing on). The
 * adapter throws a clear error if it's missing rather than silently no-op.
 *
 * Cost note: Text Search (New) is billed per call. terms × cities × ≤3 pages
 * — a few dollars per full run. Run on a schedule, not on every deploy.
 */

import type { ScrapeAdapter, ScrapedVenue } from "../types.js";
import { loadCities } from "../lib/registry.js";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

// Soccer-specific queries. Tuned for PRIVATE/indoor venues — public-park
// pitches already come from the OSM adapters, so we don't repeat "soccer
// field" (which returns parks).
const SEARCH_TERMS = [
  "indoor soccer",
  "soccer dome",
  "futsal",
  "indoor sports complex soccer",
  "soccer training centre",
];

// Field mask — only what we map. Keeping it tight controls the billing SKU.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.websiteUri",
  "nextPageToken",
].join(",");

// Drop results whose name clearly isn't a soccer venue (text search can drift
// into general gyms / retail). Lenient — we'd rather keep a maybe than lose a
// real dome.
const RELEVANT_NAME = /soccer|futsal|f[uú]tbol|football|indoor|sportsplex|sports?\s?(complex|centre|center|plex)|dome|arena|field\s?house|pitch|turf|academy/i;

type PlacesResponse = {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    types?: string[];
    websiteUri?: string;
  }>;
  nextPageToken?: string;
  error?: { message?: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function searchPage(
  apiKey: string,
  textQuery: string,
  pageToken?: string
): Promise<PlacesResponse> {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      pageSize: 20,
      ...(pageToken ? { pageToken } : {}),
      // Bias toward establishments; regionCode keeps it Canada-side.
      regionCode: "CA",
    }),
  });
  const body = (await res.json()) as PlacesResponse;
  if (!res.ok) {
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return body;
}

async function runGooglePlaces(): Promise<ScrapedVenue[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is not set. Enable the Places API (New) in Google Cloud, " +
        "create an API key, and export GOOGLE_PLACES_API_KEY before running this source."
    );
  }

  const cities = loadCities();
  const byId = new Map<string, ScrapedVenue>();
  let queries = 0;
  let dropped = 0;

  for (const city of cities) {
    for (const term of SEARCH_TERMS) {
      const textQuery = `${term} in ${city.name}, Ontario`;
      let pageToken: string | undefined;
      // Up to 3 pages (≤60 results) per query.
      for (let page = 0; page < 3; page++) {
        let resp: PlacesResponse;
        try {
          resp = await searchPage(apiKey, textQuery, pageToken);
          queries++;
        } catch (err) {
          console.warn(
            `[google] query failed: "${textQuery}" — ${err instanceof Error ? err.message : "unknown"}`
          );
          break;
        }

        for (const p of resp.places ?? []) {
          const name = p.displayName?.text?.trim();
          if (!p.id || !name || !p.location) {
            dropped++;
            continue;
          }
          if (byId.has(p.id)) continue;
          if (!RELEVANT_NAME.test(name)) {
            dropped++;
            continue;
          }
          byId.set(p.id, {
            externalId: `google:${p.id}`,
            name,
            address: p.formattedAddress ?? "",
            lat: p.location.latitude,
            lng: p.location.longitude,
            photos: [],
            amenities: [],
            venueType: "private",
            googlePlaceId: p.id,
            fields: [
              {
                externalId: `google:${p.id}:field-1`,
                name: "Indoor field",
                surface: "indoor",
                size: "5v5",
                pricePerHour: null,
                bookingUrl: p.websiteUri ?? null,
              },
            ],
          });
        }

        pageToken = resp.nextPageToken;
        if (!pageToken) break;
        // New page tokens need a brief beat before they're valid.
        await sleep(2000);
      }
      // Be polite between queries.
      await sleep(150);
    }
  }

  console.log(
    `[google] ${byId.size} unique venues from ${queries} queries (${dropped} filtered)`
  );
  return Array.from(byId.values());
}

export const googlePlacesAdapter: ScrapeAdapter = {
  source: "google",
  label: "Google Places (private/indoor facilities)",
  run: runGooglePlaces,
};
