import { request } from "./client";
import type { FieldSize, FieldSurface, SearchResult } from "../types/api";

export type SearchSort = "distance" | "price_asc" | "price_desc";

export type SearchFieldsParams = {
  lat?: number;
  lng?: number;
  radius_km?: number;
  surface?: FieldSurface;
  size?: FieldSize;
  price_max?: number;
  sort?: SearchSort;
};

export type SearchFieldsResult = {
  data: SearchResult[] | null;
  total: number;
  error: Error | null;
};

// The /search/fields route extends the standard envelope with `total`, so we
// reach for the lower-level `request` helper rather than `get<T>` (which
// throws away anything beyond `data`).
type SearchEnvelope = {
  data: SearchResult[];
  total: number;
  error: { message: string; code?: string } | null;
};

export async function searchFields(
  params: SearchFieldsParams = {}
): Promise<SearchFieldsResult> {
  const queryParams: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) queryParams[k] = v;
  }

  const { body, error } = await request<SearchEnvelope>(
    "/search/fields",
    queryParams
  );

  if (error) return { data: null, total: 0, error };
  if (!body) return { data: null, total: 0, error: new Error("Empty response body") };
  if (body.error) return { data: null, total: 0, error: new Error(body.error.message) };

  return { data: body.data, total: body.total, error: null };
}
