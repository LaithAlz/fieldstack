import { supabase } from "../supabase.js";
import { cached } from "../cache.js";
import { normalizeGoogleHours, type GoogleRegularOpeningHours } from "../googleHours.js";

/**
 * Venue opening hours for GET /venues/:id/hours.
 *
 * Precedence:
 *   1. Stored `venues.hours` (from the scrape pipeline: operator + park bylaw
 *      hours). Free, authoritative, returned as-is.
 *   2. If a venue has no stored hours but has a `google_place_id`, fetch live
 *      Google Places opening hours (issue #492 option 3). Google *content* may
 *      not be stored durably, so this is fetched at request time and only
 *      cached briefly in Redis — never written back to the row.
 *   3. Otherwise null (client falls back to its default window).
 *
 * `source` tells the client where the hours came from so it can label them.
 */

const GOOGLE_HOURS_TTL_SECONDS = 60 * 60 * 6; // 6h: hours change rarely; keep Google calls sparse
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

export type HoursSource = "stored" | "google" | "none";
export type VenueHoursResult = {
  hours: Record<string, string | null> | null;
  source: HoursSource;
};

type VenueHoursRow = {
  id: string;
  hours: Record<string, string | null> | null;
  google_place_id: string | null;
};

export async function getVenueHours(venueId: string): Promise<VenueHoursResult | null> {
  const { data, error } = await supabase
    .from("venues")
    .select("id, hours, google_place_id")
    .eq("id", venueId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null; // venue not found / inactive

  const row = data as unknown as VenueHoursRow;

  // 1. Stored hours win.
  if (row.hours && Object.keys(row.hours).length > 0) {
    return { hours: row.hours, source: "stored" };
  }

  // 2. Live Google fallback — only when we can (key set + place id known).
  if (GOOGLE_PLACES_KEY && row.google_place_id) {
    const googleHours = await cached(
      `venue:hours:google:${row.google_place_id}`,
      GOOGLE_HOURS_TTL_SECONDS,
      () => fetchGoogleHours(row.google_place_id as string)
    );
    if (googleHours) return { hours: googleHours, source: "google" };
  }

  // 3. Nothing.
  return { hours: null, source: "none" };
}

async function fetchGoogleHours(
  placeId: string
): Promise<Record<string, string | null> | null> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": GOOGLE_PLACES_KEY as string,
          "X-Goog-FieldMask": "regularOpeningHours",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { regularOpeningHours?: GoogleRegularOpeningHours };
    return normalizeGoogleHours(body.regularOpeningHours);
  } catch {
    // Network/timeout/parse — degrade to no hours rather than failing the route.
    return null;
  }
}
