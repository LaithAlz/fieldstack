import { get, request, type ApiResult } from "./client";
import type { Field, VenueWithFields } from "../types/api";

type GetVenuesParams = {
  /** Exact venue ids (Saved tab). When set, proximity params are ignored. */
  ids?: string[];
  lat?: number;
  lng?: number;
  radius_km?: number;
  limit?: number;
  offset?: number;
};

type GetVenueFieldsParams = {
  surface?: string;
  size?: string;
};

type GetVenuesEnvelope = {
  data: VenueWithFields[] | null;
  total: number;
  dropped: number;
  error: { message: string } | null;
};

export type GetVenuesResult = {
  data: VenueWithFields[] | null;
  total: number;
  error: Error | null;
};

/**
 * Strips `undefined` values so they don't get serialized as the literal string
 * "undefined" in the query string. The API client's QueryParams type forbids
 * undefined to keep the shared boundary tight.
 */
function compactParams<T extends Record<string, string | number | string[] | undefined>>(
  input: T
): Record<string, string | number | string[]> {
  const out: Record<string, string | number | string[]> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export async function getVenues(
  params: GetVenuesParams = {}
): Promise<GetVenuesResult> {
  // Use request (not get) to capture the total alongside data.
  const { body, error } = await request<GetVenuesEnvelope>(
    "/venues",
    compactParams(params)
  );
  if (error) return { data: null, total: 0, error };
  if (!body) return { data: null, total: 0, error: new Error("Empty response body") };
  if (body.error) return { data: null, total: 0, error: new Error(body.error.message) };
  return { data: body.data, total: body.total, error: null };
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
