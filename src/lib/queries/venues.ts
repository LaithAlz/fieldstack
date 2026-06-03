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
  limit?: number;
  offset?: number;
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
export type ListVenuesResult = { venues: VenueWithFields[]; total: number; dropped: number };

export async function listVenues(
  opts: ListVenuesOptions = {}
): Promise<ListVenuesResult> {
  const { lat, lng, radiusKm, limit = 50, offset = 0 } = opts;

  if (lat !== undefined && lng !== undefined && radiusKm !== undefined) {
    return cached(proximityKey(lat, lng, radiusKm, limit, offset), PROXIMITY_TTL_SECONDS, () =>
      proximitySearch(lat, lng, radiusKm, limit, offset)
    );
  }

  const { data, error, count } = await supabase
    .from("venues")
    .select("*, fields(*)", { count: "exact" })
    .eq("is_active", true)
    .eq("fields.is_active", true)
    .order("name")
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const venues = (data ?? []) as unknown as VenueWithFields[];
  return { venues, total: count ?? venues.length, dropped: 0 };
}

async function proximitySearch(
  lat: number,
  lng: number,
  radiusKm: number,
  limit: number,
  offset: number
): Promise<ListVenuesResult> {
  // Step 1: ask the RPC for all venues ordered by distance (no limit here;
  // we need the full ordered list to apply offset/limit correctly after
  // hydration which may drop some ids).
  const { data: ordered, error: rpcErr } = await supabase.rpc("venues_within", {
    p_lat: lat,
    p_lng: lng,
    p_radius_meters: radiusKm * 1000,
  });
  if (rpcErr) throw rpcErr;
  if (!ordered || ordered.length === 0) return { venues: [], total: 0, dropped: 0 };

  const total = ordered.length;
  const pageIds = ordered.slice(offset, offset + limit).map((v) => v.id);
  if (pageIds.length === 0) return { venues: [], total, dropped: 0 };

  // Step 2: hydrate this page's worth of venues with active fields.
  const { data: hydrated, error: selErr } = await supabase
    .from("venues")
    .select("*, fields(*)")
    .in("id", pageIds)
    .eq("fields.is_active", true);
  if (selErr) throw selErr;
  if (!hydrated) return { venues: [], total, dropped: pageIds.length };

  // Step 3: re-apply the RPC's distance ordering.
  const byId = new Map(
    (hydrated as unknown as VenueWithFields[]).map((v) => [v.id, v])
  );
  const venues = pageIds
    .map((id) => byId.get(id))
    .filter((v): v is VenueWithFields => Boolean(v));

  const missing = pageIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[proximity] dropped ${missing.length} venue(s) not found in hydration: ${missing.join(", ")}`
    );
  }

  return { venues, total, dropped: missing.length };
}

function proximityKey(lat: number, lng: number, radiusKm: number, limit: number, offset: number): string {
  return `venues:${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusKm.toFixed(1)}:${limit}:${offset}`;
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
