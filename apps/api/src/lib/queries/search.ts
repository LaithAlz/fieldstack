import { createHash } from "node:crypto";
import { supabase } from "../supabase.js";
import { cached } from "../cache.js";
import type { Tables } from "../../../types/database.js";
import type { FieldSurface, FieldSize } from "./venues.js";

const SEARCH_TTL_SECONDS = 30;

export type SearchSort = "distance" | "price_asc" | "price_desc";

export type VenueType = "public_park" | "private" | "community_centre";

export type SearchFieldsParams = {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  /** Empty array / undefined = no filter; non-empty = match any. */
  surfaces?: FieldSurface[];
  sizes?: FieldSize[];
  venueTypes?: VenueType[];
  priceMax?: number;
  sort: SearchSort; // required at the query layer; the route fills the default
  limit?: number;
  offset?: number;
};

export type SearchVenue = Pick<
  Tables<"venues">,
  "id" | "name" | "lat" | "lng" | "address" | "photos"
>;

export type SearchResult = {
  field: Tables<"fields">;
  venue: SearchVenue;
  distance_meters: number | null;
};

export type SearchFieldsResult = {
  data: SearchResult[];
  total: number;
};

/**
 * Search fields with optional location, surface/size/price filters, and sort.
 * Wrapped in a 30s read-through cache keyed on a hash of the normalized params.
 */
export async function searchFields(
  params: SearchFieldsParams
): Promise<SearchFieldsResult> {
  return cached(searchKey(params), SEARCH_TTL_SECONDS, () => runSearch(params));
}

async function runSearch(params: SearchFieldsParams): Promise<SearchFieldsResult> {
  const hasCoords = params.lat !== undefined && params.lng !== undefined;
  const radiusMeters =
    hasCoords && params.radiusKm !== undefined ? params.radiusKm * 1000 : undefined;

  // Regenerated DB types model nullable RPC args as `T | undefined`, so we
  // map our internal `T | null` shape via `?? undefined`. The Postgres
  // function treats missing args as null anyway, so the wire effect is the
  // same — this just satisfies the stricter types.
  const surfaces = normalizeArrayParam(params.surfaces);
  const sizes = normalizeArrayParam(params.sizes);
  const venueTypes = normalizeArrayParam(params.venueTypes);
  const { data, error } = await supabase.rpc("search_fields", {
    p_lat: params.lat,
    p_lng: params.lng,
    p_radius_meters: radiusMeters,
    p_surfaces: surfaces ?? undefined,
    p_sizes: sizes ?? undefined,
    p_venue_types: venueTypes ?? undefined,
    p_price_max: params.priceMax,
    p_sort: params.sort,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });

  if (error) throw error;

  // The SQL function guarantees this shape; cast through unknown to dodge
  // the conservative `Json` return type from supabase-js.
  return data as unknown as SearchFieldsResult;
}

/** Coerce an empty / missing array to null so the SQL filter short-circuits. */
function normalizeArrayParam<T>(arr: T[] | undefined): T[] | null {
  if (!arr || arr.length === 0) return null;
  return arr;
}

/** Exported for tests — cache-key stability is load-bearing for hit rate. */
export function searchKey(p: SearchFieldsParams): string {
  // Round coords/radius so jitter doesn't fragment cache. Sort arrays so
  // [turf,grass] and [grass,turf] hit the same cache entry. JSON.stringify
  // is stable for fixed property order.
  const normalized = {
    lat: p.lat !== undefined ? Number(p.lat.toFixed(4)) : null,
    lng: p.lng !== undefined ? Number(p.lng.toFixed(4)) : null,
    radiusKm: p.radiusKm !== undefined ? Number(p.radiusKm.toFixed(1)) : null,
    surfaces: [...(p.surfaces ?? [])].sort(),
    sizes: [...(p.sizes ?? [])].sort(),
    venueTypes: [...(p.venueTypes ?? [])].sort(),
    priceMax: p.priceMax ?? null,
    sort: p.sort,
    limit: p.limit ?? 50,
    offset: p.offset ?? 0,
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
    .slice(0, 16);
  return `search:fields:${hash}`;
}
