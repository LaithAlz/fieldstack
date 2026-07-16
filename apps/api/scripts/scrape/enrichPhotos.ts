/**
 * Venue photo enrichment. Usage:
 *
 *   bun scripts/scrape/enrichPhotos.ts            # all active venues
 *   bun scripts/scrape/enrichPhotos.ts --limit 5  # first N (for testing)
 *
 * Fills venues.photos + venues.photo_attributions from Google Places:
 *
 *   1. Resolve a place_id — short-circuits on a stored `google_place_id`
 *      (no Places call at all); else free for google-scraped venues (it's
 *      in external_id); else Text Search with a location bias for the rest
 *      (accepted only when the hit lands within MATCH_RADIUS_M of our pin,
 *      so a name collision across town can't attach the wrong photos). Any
 *      id resolved via the latter two paths is back-filled into
 *      venues.google_place_id alongside the photo update below, so next
 *      week's run hits the stored-id short-circuit instead. A stored id
 *      that 404s (place deleted/merged on Google's side) falls through to
 *      fresh resolution and is replaced — or cleared, so a dead id is never
 *      terminal.
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
/**
 * Cap on paid Text Search resolutions per run. Each `resolvePlaceId` call is
 * billed, and the venue set is whatever the scrape upserted — a poisoned or
 * compromised source returning thousands of fake venues would otherwise drive
 * unbounded Google spend on this weekly job. Steady state resolves well under
 * this; hitting the cap means something upstream changed, and the run logs it
 * and stops paying rather than silently burning budget. Roughly one full
 * catalog's worth of first-time resolutions with headroom.
 */
const MAX_PAID_RESOLUTIONS = 1200;

type VenueRow = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  external_id: string;
  google_place_id: string | null;
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

/**
 * Photo resource names + attributions for a place. Returns null when the
 * place id is dead (404 — deleted or merged on Google's side) so the caller
 * can fall back to fresh resolution instead of retrying it forever;
 * transient failures (429/5xx) return [] and leave any stored id alone.
 */
async function fetchPlacePhotos(placeId: string): Promise<PlacePhoto[] | null> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
        "X-Goog-FieldMask": "photos",
      },
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) return [];
  const data = (await res.json()) as { photos?: PlacePhoto[] };
  return (data.photos ?? []).slice(0, MAX_PHOTOS);
}

/** Keyless googleusercontent URI for one photo resource. */
async function fetchPhotoUri(photoName: string): Promise<string | null> {
  // Key goes in the header, not the query string, so it can't leak via
  // proxy/CDN/error logs. photoName is Google-supplied (`places/…/photos/…`)
  // and its slashes are the path, so it is not URL-encoded here.
  const res = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_WIDTH_PX}&skipHttpRedirect=true`,
    { headers: { "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY! } }
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

  // Page through ALL active venues — a fixed `.limit(N)` with alphabetical
  // ordering would permanently starve venues sorting after the Nth as the
  // catalog grows past the cap. `--limit` still short-circuits for testing.
  const PAGE_SIZE = 1000;
  const venues: VenueRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("venues")
      .select("id, name, lat, lng, external_id, google_place_id")
      .eq("is_active", true)
      .order("name")
      .range(from, from + (limit ? Math.min(limit, PAGE_SIZE) : PAGE_SIZE) - 1);
    if (error) {
      console.error("[photos] venue fetch failed:", error.message);
      process.exit(1);
    }
    venues.push(...((data ?? []) as VenueRow[]));
    if (!data || data.length < PAGE_SIZE || (limit && venues.length >= limit)) break;
  }
  if (limit) venues.length = Math.min(venues.length, limit);
  console.log(`[photos] enriching ${venues.length} active venues`);

  let updated = 0;
  let noPlace = 0;
  let noPhotos = 0;
  let failed = 0;
  let usedStoredId = 0;
  let usedPaidResolution = 0;

  for (const v of venues) {
    try {
      // Cheapest-first place id resolution: stored id, then the id embedded
      // in a google:* external_id, then paid Text Search. A dead id (404)
      // falls through to the next candidate instead of being terminal.
      let placeId: string | null = null;
      let placePhotos: PlacePhoto[] = [];
      let storedWasDead = false;
      for (const candidate of [v.google_place_id, placeIdFromExternalId(v.external_id)]) {
        if (!candidate) continue;
        const result = await fetchPlacePhotos(candidate);
        if (result === null) {
          if (candidate === v.google_place_id) storedWasDead = true;
          console.log(`  – ${v.name}: place id ${candidate} is dead on Places`);
          continue;
        }
        placeId = candidate;
        placePhotos = result;
        if (candidate === v.google_place_id) usedStoredId++;
        break;
      }
      if (!placeId && usedPaidResolution < MAX_PAID_RESOLUTIONS) {
        const resolved = await resolvePlaceId(v);
        if (resolved) {
          usedPaidResolution++;
          const result = await fetchPlacePhotos(resolved);
          if (result !== null) {
            placeId = resolved;
            placePhotos = result;
          }
        }
      } else if (!placeId && usedPaidResolution >= MAX_PAID_RESOLUTIONS) {
        console.warn(
          `[photos] PAID-RESOLUTION CAP reached (${MAX_PAID_RESOLUTIONS}); skipping paid lookups for the rest of this run. Investigate the venue count before re-running.`
        );
        break;
      }
      // A dead stored id we couldn't replace gets cleared — otherwise every
      // future run short-circuits onto the same dead id forever.
      if (storedWasDead && placeId !== v.google_place_id) {
        await supabase
          .from("venues")
          .update({ google_place_id: placeId })
          .eq("id", v.id);
      }
      if (!placeId) {
        noPlace++;
        console.log(`  – ${v.name}: no confident Places match`);
        continue;
      }
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
        .update({
          photos,
          photo_attributions: attributions,
          // Back-fill when the used id isn't what was already stored, so
          // next week's run hits the short-circuit above instead of paying
          // for Text Search again.
          ...(placeId !== v.google_place_id ? { google_place_id: placeId } : {}),
        })
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
    `[photos] done — updated ${updated}, no match ${noPlace}, no photos ${noPhotos}, failed ${failed} (stored id: ${usedStoredId}, paid resolution: ${usedPaidResolution})`
  );
}

await main();
