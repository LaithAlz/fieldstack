/**
 * Normalized shape every scrape adapter produces. The runner upserts these
 * into `venues` + `fields` tables, setting `data_source='scrape'` and
 * `last_scraped_at=now()` on the way in.
 *
 * Each scraped venue carries an `externalId` namespaced by source
 * (e.g. "mississauga:UNIT-1234") so re-runs idempotently update the same row.
 */

import type { FieldSize, FieldSurface } from "./fieldEnums.js";

export type ScrapedField = {
  /** Source-namespaced id, e.g. "mississauga:LANDMARK-12345". Unique across all sources. */
  externalId: string;
  /** Human-readable field label. e.g. "Field 1", "Boxed Soccer A". */
  name: string;
  surface: FieldSurface;
  size: FieldSize;
  /** Per-hour rate if known. Often null for muni-listed fields. */
  pricePerHour?: number | null;
  /** Booking URL when the source carries one. */
  bookingUrl?: string | null;
};

export type ScrapedVenue = {
  /** Source-namespaced id, e.g. "mississauga:PARENT-park-name". */
  externalId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  /** Photo URLs. Most muni listings have none. */
  photos: string[];
  /** Free-form amenity names: "lights", "indoor", "parking", etc. */
  amenities: string[];
  /** Operator-side hours hint (see lib/venueHours.ts shape). */
  hours?: Record<string, string | null> | null;
  /** Operator-side notes (booking rules / cancellation) — strings or null. */
  bookingNotes?: string | null;
  cancellationPolicy?: string | null;
  /** Per-field children. At least one per venue. */
  fields: ScrapedField[];
};

/** Each scrape source implements this. */
export type ScrapeAdapter = {
  /** Short slug used on the CLI: `bun run scrape -- mississauga`. */
  source: string;
  /** Human label for logs. */
  label: string;
  /** Pull the venues from the source and return the normalized shape. */
  run: () => Promise<ScrapedVenue[]>;
};
