import { get, request, type ApiResult } from "./client";
import type { Field, VenueHoursJson, VenueWithFields } from "../types/api";

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

/** Where a venue's hours came from — lets the UI label Google-sourced hours. */
export type VenueHoursSource = "stored" | "google" | "none";

export type VenueHoursResponse = {
  hours: VenueHoursJson | null;
  source: VenueHoursSource;
};

/**
 * Opening hours for a venue (GET /venues/:id/hours). Returns stored hours when
 * present, else live Google Places hours for venues that have a Google place id
 * (the paid facilities we don't otherwise have hours for). Only worth calling
 * when the venue's own `hours` is empty — see useResolvedVenueHours. Degrades
 * to an error result (which the hook treats as "no hours") on an older API
 * that lacks this route.
 */
export function getVenueHours(id: string): Promise<ApiResult<VenueHoursResponse>> {
  return get<VenueHoursResponse>(`/venues/${encodeURIComponent(id)}/hours`);
}
