import { get, type ApiResult } from "./client";
import type { Field, VenueWithFields } from "../types/api";

type GetVenuesParams = {
  lat?: number;
  lng?: number;
  radius_km?: number;
};

type GetVenueFieldsParams = {
  surface?: string;
  size?: string;
};

/**
 * Strips `undefined` values so they don't get serialized as the literal string
 * "undefined" in the query string. The API client's QueryParams type forbids
 * undefined to keep the shared boundary tight.
 */
function compactParams<T extends Record<string, string | number | undefined>>(
  input: T
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function getVenues(
  params: GetVenuesParams = {}
): Promise<ApiResult<VenueWithFields[]>> {
  // Backend embeds active fields on the list endpoint so the venue card can
  // show field count, surface mix, and price range without a per-venue fetch.
  return get<VenueWithFields[]>("/venues", compactParams(params));
}

export function getVenue(id: string): Promise<ApiResult<VenueWithFields>> {
  return get<VenueWithFields>(`/venues/${encodeURIComponent(id)}`);
}

export function getVenueFields(
  id: string,
  params: GetVenueFieldsParams = {}
): Promise<ApiResult<Field[]>> {
  return get<Field[]>(
    `/venues/${encodeURIComponent(id)}/fields`,
    compactParams(params)
  );
}
