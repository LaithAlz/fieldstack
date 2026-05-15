/**
 * Mirror of the DB's `field_surface` + `field_size` enums for scraper-side
 * typing. Kept here (not pulled from `src/types/database.ts`) so adapters
 * stay decoupled from the generated supabase types.
 *
 * Source: migrations 001, 008.
 */

export type FieldSurface = "turf" | "grass" | "concrete" | "indoor";
export type FieldSize = "5v5" | "7v7" | "11v11" | "futsal" | "3v3";
