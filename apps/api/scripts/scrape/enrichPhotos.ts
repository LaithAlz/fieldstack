/**
 * Venue photo enrichment. Usage:
 *
 *   bun scripts/scrape/enrichPhotos.ts            # all active venues
 *   bun scripts/scrape/enrichPhotos.ts --limit 5  # first N (for testing)
 *
 * Fills venues.photos + venues.photo_attributions from Google Places:
 *
 *   1. Resolve a place_id — free for google-scraped venues (it's in
 *      external_id), via Text Search with a location bias for the rest
 *      (accepted only when the hit lands within MATCH_RADIUS_M of our pin,
 *      so a name collision across town can't attach the wrong photos).
 *   2. Place Details (photos field) → photo resource names + author
 *      attributions.
 *   3. Photo media with skipHttpRedirect → a keyless lh3.googleusercontent
 *      URI per photo. That URI is what we store: clients render it directly,
 *      no API key ships anywhere.
 *
 * Google marks those URIs short-lived, so this runs WEEKLY in scrape.yml —
 * every run re-resolves every venue's URIs from scratch (idempotent
 * overwrite), which both refreshes rot and picks up new photos. Attribution
 * display is required by Google's terms; the app and site render
 * photo_attributions[i] with photos[i].
 *
 * Venues where Places has no photos (or no confident match) are left
 * untouched — the app falls back to the satellite hero.
 *
 * Auth: SUPABASE_SERVICE_ROLE_KEY + GOOGLE_PLACES_API_KEY from env.
 */

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[photos] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}
if (!GOOGLE_PLACES_API_KEY) {
  console.error("[photos] Missing GOOGLE_PLACES_API_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Max photos stored per venue — the gallery paginates, but 4 is plenty. */
const MAX_PHOTOS = 4;
/** Rendered width requested from the media endpoint. */
const PHOTO_WIDTH_PX = 1280;
/** Text Search hit must be within this of our pin to count as the same place. */
const MATCH_RADIUS_M = 300;
/** Politeness delay between venues (ms). */
const DELAY_MS = 120;

type VenueRow = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  external_id: string;
};

type PlacePhoto = {
  name?: string;
  authorAttributions?: { displayName?: string }[];
};

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** place_id straight from a google-scraped external_id, else null. */
function placeIdFromExternalId(externalId: string): string | null {
  return externalId.startsWith("google:") ? externalId.slice("google:".length) : null;
}

/** Resolve a place_id by name near our pin. Null unless confidently the same place. */
async function resolvePlaceId(v: VenueRow): Promise<string | null> {
  if (v.lat === null || v.lng === null) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": "places.id,places.location",
    },
    body: JSON.stringify({
      textQuery: v.name,
      locationBias: {
        circle: { center: { latitude: v.lat, longitude: v.lng }, radius: 500 },
      },
      maxResultCount: 1,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    places?: { id?: string; location?: { latitude?: number; longitude?: number } }[];
  };
  const hit = data.places?.[0];
  if (!hit?.id || hit.location?.latitude === undefined || hit.location?.longitude === undefined) {
    return null;
  }
  const dist = haversineMeters(v.lat, v.lng, hit.location.latitude, hit.location.longitude);
  return dist <= MATCH_RADIUS_M ? hit.id : null;
}

/** Photo resource names + attributions for a place. */
async function fetchPlacePhotos(placeId: string): Promise<PlacePhoto[]> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
        "X-Goog-FieldMask": "photos",
      },
    }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { photos?: PlacePhoto[] };
  return (data.photos ?? []).slice(0, MAX_PHOTOS);
}

/** Keyless googleusercontent URI for one photo resource. */
async function fetchPhotoUri(photoName: string): Promise<string | null> {
  const res = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_WIDTH_PX}&skipHttpRedirect=true&key=${GOOGLE_PLACES_API_KEY}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { photoUri?: string };
  return typeof data.photoUri === "string" && data.photoUri.startsWith("https://")
    ? data.photoUri
    : null;
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : undefined;

  const { data, error } = await supabase
    .from("venues")
    .select("id, name, lat, lng, external_id")
    .eq("is_active", true)
    .order("name")
    .limit(limit ?? 1000);
  if (error) {
    console.error("[photos] venue fetch failed:", error.message);
    process.exit(1);
  }
  const venues = (data ?? []) as VenueRow[];
  console.log(`[photos] enriching ${venues.length} active venues`);

  let updated = 0;
  let noPlace = 0;
  let noPhotos = 0;
  let failed = 0;

  for (const v of venues) {
    try {
      const placeId = placeIdFromExternalId(v.external_id) ?? (await resolvePlaceId(v));
      if (!placeId) {
        noPlace++;
        console.log(`  – ${v.name}: no confident Places match`);
        continue;
      }

      const placePhotos = await fetchPlacePhotos(placeId);
      const photos: string[] = [];
      const attributions: string[] = [];
      for (const p of placePhotos) {
        if (!p.name) continue;
        const uri = await fetchPhotoUri(p.name);
        if (!uri) continue;
        photos.push(uri);
        const author = p.authorAttributions?.[0]?.displayName;
        attributions.push(author ? `Photo: ${author} / Google` : "Photo via Google");
      }

      if (photos.length === 0) {
        noPhotos++;
        console.log(`  – ${v.name}: no photos on Places`);
        continue;
      }

      const { error: upErr } = await supabase
        .from("venues")
        .update({ photos, photo_attributions: attributions })
        .eq("id", v.id);
      if (upErr) throw upErr;

      updated++;
      console.log(`  ✓ ${v.name}: ${photos.length} photos`);
    } catch (err) {
      failed++;
      console.warn(`  ✗ ${v.name}:`, err instanceof Error ? err.message : err);
    }
    await sleep(DELAY_MS);
  }

  console.log(
    `[photos] done — updated ${updated}, no match ${noPlace}, no photos ${noPhotos}, failed ${failed}`
  );
}

await main();
