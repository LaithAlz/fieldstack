// Hand-authored to match the Fastify backend's response shapes.
// Keep in sync with the database schema in supabase/migrations/.

export type IntegrationType = "none" | "playtomic" | "courtreserve" | "amilia";
export type FieldSurface = "turf" | "grass" | "concrete" | "indoor";
export type FieldSize = "5v5" | "7v7" | "11v11" | "futsal" | "3v3";
export type VenueType = "public_park" | "private" | "community_centre";

export type Operator = {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  integration_type: IntegrationType;
};

export type Venue = {
  id: string;
  operator_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  photos: string[];
  amenities: string[];
  website: string | null;
  is_active: boolean;
  // Optional because migration 007 adds these as nullable columns — legacy
  // rows + clients that haven't applied the migration still satisfy the type.
  data_source?: "manual" | "scrape" | "operator_claim" | null;
  last_scraped_at?: string | null;
  // Migration 009 — free-text operator notes shown pre-redirect.
  booking_notes?: string | null;
  cancellation_policy?: string | null;
  // Migration 010 — per-weekday operating hours hint. See lib/venueHours.ts
  // for the shape and parsing logic.
  hours?: VenueHoursJson | null;
  // Migration 015 — ownership / access bucket. Null = unknown (not yet
  // classified). The filter UI treats null as "no signal" and includes the
  // row only when no venue_type filter is active.
  venue_type?: VenueType | null;
};

/**
 * Raw venue.hours JSON shape from the DB. Keys are weekday abbreviations,
 * values are "HH:mm-HH:mm" or null when closed. The strict client-side
 * shape (with parsed minutes) lives in lib/venueHours.ts.
 */
export type VenueHoursJson = Partial<
  Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", string | null>
>;

export type Field = {
  id: string;
  venue_id: string;
  name: string;
  surface: FieldSurface;
  size: FieldSize;
  price_per_hour: number | null;
  booking_url: string | null;
  booking_platform: IntegrationType;
  is_active: boolean;
  // Migration 011 — optional per-field photos. Null/empty array →
  // consumer falls back to venue.photos. See lib/fieldPhotos.ts.
  photos?: string[] | null;
  // Migration 012 — free-text pricing caveat. Shown beside the price when
  // the operator has variable rates (peak/off-peak/weekend/member etc).
  price_note?: string | null;
};

// The list endpoint nests `fields` only; the single-venue endpoint also
// nests `operator` (needed by the BookingBottomSheet for the operator-name
// notice). Kept optional so a list-shaped venue still satisfies the type.
export type VenueWithFields = Venue & { fields: Field[]; operator?: Operator };

export type SearchResult = {
  field: Field;
  venue: Pick<Venue, "id" | "name" | "lat" | "lng" | "address" | "photos" | "venue_type">;
};
