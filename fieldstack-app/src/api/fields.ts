import { get, type ApiResult } from "./client";
import type { Field, Venue } from "../types/api";

export function getField(
  id: string
): Promise<ApiResult<Field & { venue: Venue }>> {
  return get<Field & { venue: Venue }>(`/fields/${encodeURIComponent(id)}`);
}
