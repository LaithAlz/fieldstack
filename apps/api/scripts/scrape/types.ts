/**
 * Normalized shape every scrape adapter produces. The runner upserts these
 * into `venues` + `fields` tables, setting `data_source='scrape'` and
 * `last_scraped_at=now()` on the way in.
 *
 * Each scraped venue carries an `externalId` namespaced by source
 * (e.g. "mississauga:UNIT-1234") so re-runs idempotently update the same row.
 */

import type { FieldSize, FieldSurface, VenueType } from "./fieldEnums.js";

/**
 * Booking platform a field is bookable through. Mirrors the DB
 * `integration_type` enum (migration 001) + `fields.booking_platform`.
 * Used by future platform adapters to mark a field's booking tier — see
 * docs/scraping.md §3.1. `'none'` = plain booking_url / website / phone.
 */
export type BookingPlatform =
  | "none"
  | "playtomic"
  | "courtreserve"
  | "amilia";

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
  /**
   * Booking platform for this field, when a platform adapter knows it (see
   * docs/scraping.md §3). Consumed by run.ts's `upsertField`, which sets
   * `fields.booking_platform` to this value, falling back to `'none'` when
   * omitted.
   */
  bookingPlatform?: BookingPlatform;
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
  /** Ownership/access bucket. Null = unknown (UI treats as unfiltered). */
  venueType?: VenueType | null;
  /** Operator-side hours hint (see lib/venueHours.ts shape). */
  hours?: Record<string, string | null> | null;
  /** Operator-side notes (booking rules / cancellation) — strings or null. */
  bookingNotes?: string | null;
  cancellationPolicy?: string | null;
  /**
   * Google Place ID (docs/scraping.md §1.3). The one Places field we're
   * allowed to store durably (Places *content* must be fetched at display
   * time, never cached). Persisted to `venues.google_place_id` by the
   * runner when present; consumed and back-filled by enrichPhotos.ts so
   * weekly photo refreshes can skip a paid Text Search re-resolution.
   */
  googlePlaceId?: string | null;
  /**
   * SCAFFOLDING (docs/scraping.md §1.4 / §4.3) — not yet consumed by run.ts.
   * Source confidence, for cross-source conflict resolution. Higher wins
   * when two sources describe the same venue. Suggested scale: operator/
   * platform > municipal > Google > OSM.
   */
  confidence?: number;
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
