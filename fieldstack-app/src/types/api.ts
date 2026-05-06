// Hand-authored to match the Fastify backend's response shapes.
// Keep in sync with the database schema in supabase/migrations/.

export type IntegrationType = "none" | "playtomic" | "courtreserve" | "amilia";
export type FieldSurface = "turf" | "grass" | "concrete" | "indoor";
export type FieldSize = "5v5" | "7v7" | "11v11";

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
};

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
};

export type VenueWithFields = Venue & { fields: Field[] };

export type SearchResult = {
  field: Field;
  venue: Pick<Venue, "id" | "name" | "lat" | "lng" | "address" | "photos">;
};
