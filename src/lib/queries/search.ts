import { createHash } from "node:crypto";
import { supabase } from "../supabase.js";
import { cached } from "../cache.js";
import type { Tables } from "../../../types/database.js";
import type { FieldSurface, FieldSize } from "./venues.js";

const SEARCH_TTL_SECONDS = 30;

export type SearchSort = "distance" | "price_asc" | "price_desc";

export type SearchFieldsParams = {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  surface?: FieldSurface;
  size?: FieldSize;
  priceMax?: number;
  sort: SearchSort; // required at the query layer; the route fills the default
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
    hasCoords && params.radiusKm !== undefined ? params.radiusKm * 1000 : null;

  const { data, error } = await supabase.rpc("search_fields", {
    p_lat: params.lat ?? null,
    p_lng: params.lng ?? null,
    p_radius_meters: radiusMeters,
    p_surface: params.surface ?? null,
    p_size: params.size ?? null,
    p_price_max: params.priceMax ?? null,
    p_sort: params.sort,
  });

  if (error) throw error;

  // The SQL function guarantees this shape; cast through unknown to dodge
  // the conservative `Json` return type from supabase-js.
  return data as unknown as SearchFieldsResult;
}

function searchKey(p: SearchFieldsParams): string {
  // Round coords/radius so jitter doesn't fragment cache. Property order is
  // fixed, so JSON.stringify is stable across calls with the same params.
  const normalized = {
    lat: p.lat !== undefined ? Number(p.lat.toFixed(4)) : null,
    lng: p.lng !== undefined ? Number(p.lng.toFixed(4)) : null,
    radiusKm: p.radiusKm ?? null,
    surface: p.surface ?? null,
    size: p.size ?? null,
    priceMax: p.priceMax ?? null,
    sort: p.sort,
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
    .slice(0, 16);
  return `search:fields:${hash}`;
}
