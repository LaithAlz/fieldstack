/**
 * Venue data layer for the marketing site. Reads the SAME Supabase tables the
 * app uses (anon key + RLS public-read of active venues/fields/operators), at
 * BUILD TIME — every venue page is statically generated, so this never runs on
 * a user request.
 *
 * If SUPABASE_URL / SUPABASE_ANON_KEY aren't set we return an empty list
 * rather than throwing, so a preview build without the env vars still succeeds
 * (it just won't emit venue pages until the env is configured in Vercel).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export type VenueField = {
  id: string;
  name: string;
  surface: string;
  size: string;
  pricePerHour: number | null;
  priceNote: string | null;
  bookingUrl: string | null;
};

export type Venue = {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  amenities: string[];
  venueType: string | null;
  operatorName: string | null;
  operatorWebsite: string | null;
  fields: VenueField[];
  /** Resolved outbound booking link: a field's URL, else operator website. */
  bookingUrl: string | null;
  /** SEO slug, e.g. "mattamy-indoor-soccer-field-mississauga". Stable. */
  slug: string;
};

// Known GTA-area place names, longest first so "Stoney Creek" wins over a bare
// token. Used to pull a clean city out of the freeform Google address; falls
// back to parsing the comma-part before the province if none match.
const PLACES = [
  "Richmond Hill", "Stoney Creek", "North York", "Mount Hope",
  "Toronto", "Mississauga", "Brampton", "Vaughan", "Markham",
  "Hamilton", "Burlington", "Oakville", "Milton", "Ancaster",
  "Dundas", "Etobicoke", "Scarborough", "Maple", "Woodbridge",
  "Aurora", "Pickering", "Grimsby", "Caledon", "Thornhill",
  "Concord", "Nobleton", "Kleinburg", "Grimsby", "Whitchurch-Stouffville",
  "Stouffville", "Newmarket", "King City",
];

function extractCity(address: string): string {
  for (const p of PLACES) {
    if (new RegExp(`\\b${p.replace(/[-]/g, "[- ]")}\\b`, "i").test(address)) return p;
  }
  // Fallback: ".. street, CITY, ON L1L 1L1" → the part before the province.
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  const provIdx = parts.findIndex((p) => /\bON\b/i.test(p));
  if (provIdx > 0) return parts[provIdx - 1];
  return parts[1] ?? "Greater Toronto Area";
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type Row = {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  amenities: string[] | null;
  venue_type: string | null;
  booking_notes: string | null;
  operator: { name: string | null; website: string | null } | null;
  fields:
    | {
        id: string;
        name: string;
        surface: string;
        size: string;
        price_per_hour: number | null;
        price_note: string | null;
        booking_url: string | null;
        is_active: boolean;
      }[]
    | null;
};

let cache: Promise<Venue[]> | null = null;

export function getAllVenues(): Promise<Venue[]> {
  if (cache) return cache;
  cache = loadVenues();
  return cache;
}

async function loadVenues(): Promise<Venue[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn(
      "[venues] SUPABASE_URL / SUPABASE_ANON_KEY not set, skipping venue pages"
    );
    return [];
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("venues")
    .select(
      "id, name, address, lat, lng, amenities, venue_type, booking_notes, " +
        "operator:operators(name, website), " +
        "fields(id, name, surface, size, price_per_hour, price_note, booking_url, is_active)"
    )
    .eq("is_active", true)
    .eq("fields.is_active", true)
    .order("name")
    .limit(2000);

  if (error) {
    console.warn("[venues] load failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Row[];

  const venues: Venue[] = rows.map((r) => {
    const fields: VenueField[] = (r.fields ?? [])
      .filter((f) => f.is_active)
      .map((f) => ({
        id: f.id,
        name: f.name,
        surface: f.surface,
        size: f.size,
        pricePerHour: f.price_per_hour,
        priceNote: f.price_note,
        bookingUrl: f.booking_url,
      }));
    const city = extractCity(r.address);
    const bookingUrl =
      fields.find((f) => f.bookingUrl)?.bookingUrl ?? r.operator?.website ?? null;
    return {
      id: r.id,
      name: r.name,
      address: r.address,
      city,
      lat: r.lat,
      lng: r.lng,
      amenities: r.amenities ?? [],
      venueType: r.venue_type,
      operatorName: r.operator?.name ?? null,
      operatorWebsite: r.operator?.website ?? null,
      fields,
      bookingUrl,
      slug: "", // filled below
    };
  });

  // Assign stable, collision-free slugs deterministically (sorted by id so the
  // same venue always keeps its slug across builds).
  const used = new Map<string, number>();
  for (const v of [...venues].sort((a, b) => a.id.localeCompare(b.id))) {
    const base = `${slugify(v.name)}-${slugify(v.city)}`.replace(/^-|-$/g, "") || v.id;
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    v.slug = n === 0 ? base : `${base}-${n + 1}`;
  }

  return venues.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getVenueBySlug(slug: string): Promise<Venue | undefined> {
  const all = await getAllVenues();
  return all.find((v) => v.slug === slug);
}

/** Venues grouped by city, cities sorted by venue count (desc) then name. */
export async function getVenuesByCity(): Promise<[string, Venue[]][]> {
  const all = await getAllVenues();
  const map = new Map<string, Venue[]>();
  for (const v of all) map.set(v.city, (map.get(v.city) ?? []).concat(v));
  return [...map.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  );
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const SURFACE_LABEL: Record<string, string> = {
  turf: "Turf",
  grass: "Grass",
  concrete: "Concrete",
  indoor: "Indoor",
};
const SIZE_LABEL: Record<string, string> = {
  "3v3": "3v3",
  "5v5": "5-a-side",
  "7v7": "7-a-side",
  "11v11": "11-a-side",
  futsal: "Futsal",
};

export const surfaceLabel = (s: string) => SURFACE_LABEL[s] ?? s;
export const sizeLabel = (s: string) => SIZE_LABEL[s] ?? s;

export function priceLabel(f: VenueField): string | null {
  if (f.pricePerHour != null) return `$${f.pricePerHour}/hr`;
  if (f.priceNote) return f.priceNote;
  return null;
}
