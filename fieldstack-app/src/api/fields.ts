import { get, type ApiResult } from "./client";
import type { Field, Operator, Venue } from "../types/api";

export type FieldWithVenue = Field & { venue: Venue & { operator?: Operator } };

export function getField(id: string): Promise<ApiResult<FieldWithVenue>> {
  return get<FieldWithVenue>(`/fields/${encodeURIComponent(id)}`);
}
