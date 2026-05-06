import { supabase } from "../supabase.js";
import { cached } from "../cache.js";
import type { Tables, Enums } from "../../../types/database.js";

export type Venue = Tables<"venues">;
export type Field = Tables<"fields">;
export type VenueWithFields = Venue & { fields: Field[] };

const PROXIMITY_TTL_SECONDS = 60;

export type ListVenuesOptions = {
  lat?: number;
  lng?: number;
  radiusKm?: number;
};

/**
 * List active venues. When `lat`, `lng`, and `radiusKm` are all provided,
 * delegates to the `venues_within` RPC (PostGIS ST_DWithin) and orders by
 * distance. Result is cached in Redis for 60s keyed on the rounded coords
 * + radius.
 */
export async function listVenues(opts: ListVenuesOptions = {}): Promise<Venue[]> {
  const { lat, lng, radiusKm } = opts;

  if (lat !== undefined && lng !== undefined && radiusKm !== undefined) {
    return cached(proximityKey(lat, lng, radiusKm), PROXIMITY_TTL_SECONDS, () =>
      proximitySearch(lat, lng, radiusKm)
    );
  }

  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return (data ?? []) as Venue[];
}

async function proximitySearch(lat: number, lng: number, radiusKm: number): Promise<Venue[]> {
  const { data, error } = await supabase.rpc("venues_within", {
    p_lat: lat,
    p_lng: lng,
    p_radius_meters: radiusKm * 1000,
  });

  if (error) throw error;
  return (data ?? []) as Venue[];
}

function proximityKey(lat: number, lng: number, radiusKm: number): string {
  // Round to 4 decimals (~11 m) so jitter doesn't fragment the cache.
  return `venues:${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusKm}`;
}

/**
 * Single venue with its active fields nested. Returns null if the venue
 * doesn't exist or isn't active.
 */
export async function getVenueWithFields(id: string): Promise<VenueWithFields | null> {
  const { data, error } = await supabase
    .from("venues")
    .select("*, fields(*)")
    .eq("id", id)
    .eq("is_active", true)
    .eq("fields.is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return data as unknown as VenueWithFields;
}

// Re-export the field enums for use in route validation, so handlers don't
// have to reach into the generated types directly.
export type FieldSurface = Enums<"field_surface">;
export type FieldSize = Enums<"field_size">;
