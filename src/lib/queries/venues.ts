import { supabase } from "../supabase.js";
import { cached } from "../cache.js";
import type { Tables, Enums } from "../../../types/database.js";

export type Venue = Tables<"venues">;
export type Field = Tables<"fields">;
export type Operator = Tables<"operators">;
export type VenueWithFields = Venue & { fields: Field[]; operator?: Operator };

const PROXIMITY_TTL_SECONDS = 60;

export type ListVenuesOptions = {
  lat?: number;
  lng?: number;
  radiusKm?: number;
};

/**
 * List active venues with their active fields nested. Cards depend on the
 * field summary (count + surfaces + min price), so the list endpoint always
 * embeds fields rather than forcing each card to fetch them separately.
 *
 * When `lat`/`lng`/`radiusKm` are all provided, results come from the
 * `venues_within` RPC ordered by distance, then we hydrate fields in a
 * follow-up query and re-apply that ordering.
 */
export async function listVenues(
  opts: ListVenuesOptions = {}
): Promise<VenueWithFields[]> {
  const { lat, lng, radiusKm } = opts;

  if (lat !== undefined && lng !== undefined && radiusKm !== undefined) {
    return cached(proximityKey(lat, lng, radiusKm), PROXIMITY_TTL_SECONDS, () =>
      proximitySearch(lat, lng, radiusKm)
    );
  }

  const { data, error } = await supabase
    .from("venues")
    .select("*, fields(*)")
    .eq("is_active", true)
    .eq("fields.is_active", true)
    .order("name");

  if (error) throw error;
  return (data ?? []) as unknown as VenueWithFields[];
}

async function proximitySearch(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<VenueWithFields[]> {
  // Step 1: ask the RPC for venues ordered by distance.
  const { data: ordered, error: rpcErr } = await supabase.rpc("venues_within", {
    p_lat: lat,
    p_lng: lng,
    p_radius_meters: radiusKm * 1000,
  });
  if (rpcErr) throw rpcErr;
  if (!ordered || ordered.length === 0) return [];

  // Step 2: fetch the same venues with active fields embedded.
  const ids = ordered.map((v) => v.id);
  const { data: hydrated, error: selErr } = await supabase
    .from("venues")
    .select("*, fields(*)")
    .in("id", ids)
    .eq("fields.is_active", true);
  if (selErr) throw selErr;
  if (!hydrated) return [];

  // Step 3: re-apply the RPC's distance ordering.
  const byId = new Map(
    (hydrated as unknown as VenueWithFields[]).map((v) => [v.id, v])
  );
  return ids
    .map((id) => byId.get(id))
    .filter((v): v is VenueWithFields => Boolean(v));
}

function proximityKey(lat: number, lng: number, radiusKm: number): string {
  return `venues:${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusKm}`;
}

/**
 * Single venue with its active fields and parent operator nested. Returns
 * null if the venue doesn't exist or isn't active. The operator is embedded
 * here (but not on the list endpoint) because the Venue Detail screen's
 * booking sheet needs the operator name and a separate fetch would couple
 * the sheet to network.
 */
export async function getVenueWithFields(id: string): Promise<VenueWithFields | null> {
  const { data, error } = await supabase
    .from("venues")
    .select("*, fields(*), operator:operators(*)")
    .eq("id", id)
    .eq("is_active", true)
    .eq("fields.is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return data as unknown as VenueWithFields;
}

export type FieldSurface = Enums<"field_surface">;
export type FieldSize = Enums<"field_size">;
