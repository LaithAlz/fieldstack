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
import { safeHttpUrl } from "./safe";

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
  /** Google Places photo URIs (keyless, refreshed weekly by the scraper). */
  photos: string[];
  /** Author credit for the same-index photo — Google terms require display. */
  photoAttributions: string[];
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
  photos: string[] | null;
  photo_attributions: string[] | null;
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
      "id, name, address, lat, lng, amenities, photos, photo_attributions, venue_type, booking_notes, " +
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
        // Scraped URLs are untrusted; drop anything that isn't http(s) so a
        // javascript:/data: value can never reach an href.
        bookingUrl: safeHttpUrl(f.booking_url),
      }));
    const city = extractCity(r.address);
    const bookingUrl =
      fields.find((f) => f.bookingUrl)?.bookingUrl ?? safeHttpUrl(r.operator?.website) ?? null;
    return {
      id: r.id,
      name: r.name,
      address: r.address,
      city,
      lat: r.lat,
      lng: r.lng,
      amenities: r.amenities ?? [],
      photos: r.photos ?? [],
      photoAttributions: r.photo_attributions ?? [],
      venueType: r.venue_type,
      operatorName: r.operator?.name ?? null,
      operatorWebsite: safeHttpUrl(r.operator?.website),
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

// ---------------------------------------------------------------------------
// Price display state — drives the card grammar's condensed-price / FREE
// foil / "rates on site" chip. No new fetching: venueType and field prices
// are already part of the Venue shape above, this just classifies them.
// ---------------------------------------------------------------------------

export type PriceState =
  | { kind: "price"; text: string }
  | { kind: "free" }
  | { kind: "onsite" };

/**
 * Per-field price state, for the field rows on a venue's own page.
 *
 * $0 is checked FIRST, before the park fallback: `pricePerHour != null` used
 * to gate the whole free/priced decision, so an explicit `pricePerHour: 0`
 * (a real FREE signal) fell all the way to the priced branch and rendered
 * "$0/hr" instead of FREE. Order now matches the app's `isFreeVenue`: an
 * explicit $0 wins regardless of venue type, then a park with no price at
 * all is FREE, then a real price, then whatever "rates on site" text is
 * available.
 */
export function fieldPriceState(f: VenueField, venueType: string | null): PriceState {
  if (f.pricePerHour === 0) return { kind: "free" };
  if (f.pricePerHour == null && venueType === "public_park") return { kind: "free" };
  if (f.pricePerHour != null) return { kind: "price", text: `$${f.pricePerHour}/hr` };
  if (f.priceNote) return { kind: "price", text: f.priceNote };
  return { kind: "onsite" };
}

/**
 * Per-venue price state (lowest field price), for venue cards in listings.
 *
 * Mirrors the app's `venuePriceSummary` rollup (lib/priceDisplay.ts): the
 * candidate set is fields with a `bookingUrl` when any exist (an unbookable
 * field can't back whatever booking action the card links to), else every
 * field. Same $0-first ordering as `fieldPriceState` above, for the same
 * reason.
 */
export function venuePriceState(v: Pick<Venue, "fields" | "venueType">): PriceState {
  const bookable = v.fields.filter((f) => f.bookingUrl);
  const candidates = bookable.length > 0 ? bookable : v.fields;
  const prices = candidates.map((f) => f.pricePerHour).filter((p): p is number => p != null);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;

  if (minPrice === 0) return { kind: "free" };
  if (minPrice === null && v.venueType === "public_park") return { kind: "free" };
  if (minPrice !== null) return { kind: "price", text: `from $${minPrice}/hr` };
  return { kind: "onsite" };
}

// ---------------------------------------------------------------------------
// City landing pages (/soccer-fields/[city])
// ---------------------------------------------------------------------------

export type City = {
  name: string;
  slug: string;
  venues: Venue[];
};

/**
 * Only cities with enough venues to make a non-thin landing page. Sorted by
 * venue count so params, sitemap, and footer links all agree on the order.
 */
const CITY_PAGE_MIN_VENUES = 3;

export async function getCities(): Promise<City[]> {
  const byCity = await getVenuesByCity();
  return byCity
    .filter(([, vs]) => vs.length >= CITY_PAGE_MIN_VENUES)
    .map(([name, venues]) => ({ name, slug: slugify(name), venues }));
}

export async function getCityBySlug(slug: string): Promise<City | undefined> {
  const cities = await getCities();
  return cities.find((c) => c.slug === slug);
}
