import { supabase } from "../supabase.js";
import type { Field, FieldSurface, FieldSize, Operator, Venue } from "./venues.js";

export type FieldWithVenue = Field & {
  venue: Venue & { operator?: Operator };
};

export type FieldFilters = {
  surface?: FieldSurface;
  size?: FieldSize;
};

/**
 * Active fields for a venue, optionally filtered by surface and/or size.
 */
export async function listFieldsByVenue(
  venueId: string,
  filters: FieldFilters = {}
): Promise<Field[]> {
  let q = supabase
    .from("fields")
    .select("*")
    .eq("venue_id", venueId)
    .eq("is_active", true);

  if (filters.surface) q = q.eq("surface", filters.surface);
  if (filters.size) q = q.eq("size", filters.size);

  const { data, error } = await q.order("name");
  if (error) throw error;
  return (data ?? []) as Field[];
}

/**
 * Single field with its parent venue (and the venue's operator) nested.
 * Returns null if the field doesn't exist or isn't active. The operator
 * is embedded so the Field Detail screen's booking sheet can show the
 * operator name without a second round-trip — same pattern as
 * `getVenueWithFields`.
 */
export async function getFieldWithVenue(id: string): Promise<FieldWithVenue | null> {
  const { data, error } = await supabase
    .from("fields")
    .select("*, venue:venues(*, operator:operators(*))")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return data as unknown as FieldWithVenue;
}

// Re-export so route handlers have one import path for query + types.
export type { Field, FieldSurface, FieldSize, Operator, Venue } from "./venues.js";
