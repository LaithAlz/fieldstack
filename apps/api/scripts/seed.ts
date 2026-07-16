/**
 * FieldStack seed: 15 GTA soccer venues with 2-3 fields each.
 *
 * Uses the service-role client so RLS doesn't get in the way. Re-running
 * wipes and re-inserts operators/venues/fields (waitlist is left alone).
 *
 * Run:  pnpm seed   (or: npm run seed)
 *
 * Required env (loaded from .env via dotenv/config):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import type { Database, TablesInsert } from "../types/database.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill them in."
  );
  process.exit(1);
}

// supabase-js eagerly initializes a Realtime WebSocket client even when we
// only use REST. On Node 20 (no native WebSocket) we have to hand it `ws`.
// Drop this once the project moves to Node 22+.
const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realtime: { transport: WebSocket as any },
});

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

type OperatorSeed = TablesInsert<"operators">;
type VenueSeed = Omit<TablesInsert<"venues">, "operator_id"> & {
  operator: string; // operator name; resolved to operator_id at insert time
};
type FieldSeed = Omit<TablesInsert<"fields">, "venue_id"> & {
  venue: string; // venue name; resolved to venue_id at insert time
};

const OPERATORS: OperatorSeed[] = [
  {
    name: "City of Toronto",
    website: "https://www.toronto.ca/explore-enjoy/recreation/",
    phone: "311",
    integration_type: "none",
  },
  {
    name: "City of Mississauga",
    website: "https://www.mississauga.ca/recreation-and-sports/",
    phone: "311",
    integration_type: "none",
  },
  {
    name: "City of Brampton",
    website: "https://www.brampton.ca/EN/residents/Recreation/",
    phone: "311",
    integration_type: "none",
  },
  {
    name: "Hangar Sports & Events",
    website: "https://hangarsportsandevents.com",
    phone: "(416) 638-9555",
    integration_type: "none",
  },
  {
    name: "Soccer World",
    website: "https://soccerworld.ca",
    phone: "(416) 422-1106",
    integration_type: "none",
  },
];

// Lat/lng are approximate (rooftop-precision varies). They drive ST_DWithin
// queries — accurate enough to filter "venues within 10 km of me", refine
// later if you geocode against a real provider.
const VENUES: VenueSeed[] = [
  // ---- Toronto -----------------------------------------------------------
  {
    operator: "Hangar Sports & Events",
    name: "The Hangar at Downsview Park",
    address: "75 Carl Hall Rd, North York, ON M3K 2B9",
    lat: 43.7404,
    lng: -79.4801,
    photos: [],
    amenities: ["change_rooms", "parking", "concessions", "wifi", "indoor"],
    website: "https://hangarsportsandevents.com",
    is_active: true,
  },
  {
    operator: "City of Toronto",
    name: "Monarch Park Stadium",
    address: "115 Felstead Ave, Toronto, ON M4J 1G3",
    lat: 43.6822,
    lng: -79.3244,
    photos: [],
    amenities: ["change_rooms", "washrooms", "parking", "lights"],
    website: "https://www.toronto.ca/data/parks/prd/facilities/complex/121/index.html",
    is_active: true,
  },
  {
    operator: "City of Toronto",
    name: "Cherry Beach Sports Fields",
    address: "275 Unwin Ave, Toronto, ON M4M 3K8",
    lat: 43.6395,
    lng: -79.3389,
    photos: [],
    amenities: ["washrooms", "parking", "lights"],
    website: "https://www.toronto.ca/data/parks/prd/facilities/complex/47/index.html",
    is_active: true,
  },
  {
    operator: "City of Toronto",
    name: "Lamport Stadium",
    address: "1155 King St W, Toronto, ON M6K 1H4",
    lat: 43.6395,
    lng: -79.4255,
    photos: [],
    amenities: ["change_rooms", "washrooms", "lights", "seating"],
    website: "https://www.toronto.ca/data/parks/prd/facilities/complex/106/index.html",
    is_active: true,
  },
  {
    operator: "City of Toronto",
    name: "Centennial Park Stadium",
    address: "256 Centennial Park Rd, Etobicoke, ON M9C 5N4",
    lat: 43.6435,
    lng: -79.5825,
    photos: [],
    amenities: ["change_rooms", "washrooms", "parking", "lights", "track"],
    website: "https://www.toronto.ca/data/parks/prd/facilities/complex/49/index.html",
    is_active: true,
  },
  {
    operator: "City of Toronto",
    name: "Birchmount Stadium",
    address: "93 Birchmount Rd, Scarborough, ON M1N 3J7",
    lat: 43.6939,
    lng: -79.2828,
    photos: [],
    amenities: ["change_rooms", "washrooms", "parking", "lights", "track"],
    website: "https://www.toronto.ca/data/parks/prd/facilities/complex/35/index.html",
    is_active: true,
  },
  {
    operator: "Soccer World",
    name: "Soccer World",
    address: "30 Esandar Dr, Toronto, ON M4G 4B9",
    lat: 43.7050,
    lng: -79.3580,
    photos: [],
    amenities: ["change_rooms", "washrooms", "parking", "concessions", "indoor"],
    website: "https://soccerworld.ca",
    is_active: true,
  },

  // ---- Mississauga -------------------------------------------------------
  {
    operator: "City of Mississauga",
    name: "Paramount Fine Foods Centre",
    address: "5500 Rose Cherry Pl, Mississauga, ON L4Z 4B6",
    lat: 43.6062,
    lng: -79.6510,
    photos: [],
    amenities: ["change_rooms", "washrooms", "parking", "concessions", "indoor", "wifi"],
    website: "https://paramountfinefoodscentre.com",
    is_active: true,
  },
  {
    operator: "City of Mississauga",
    name: "Iceland Mississauga",
    address: "705 Matheson Blvd E, Mississauga, ON L4Z 0A1",
    lat: 43.6242,
    lng: -79.6448,
    photos: [],
    amenities: ["change_rooms", "washrooms", "parking", "indoor"],
    website: "https://www.mississauga.ca/events-and-attractions/community-centres/iceland-arena/",
    is_active: true,
  },
  {
    operator: "City of Mississauga",
    name: "Vic Johnston Community Centre",
    address: "335 Church St, Mississauga, ON L5M 1N3",
    lat: 43.5775,
    lng: -79.7125,
    photos: [],
    amenities: ["change_rooms", "washrooms", "parking", "indoor"],
    website: "https://www.mississauga.ca/events-and-attractions/community-centres/vic-johnston-community-centre/",
    is_active: true,
  },
  {
    operator: "City of Mississauga",
    name: "Sawmill Valley Community Park",
    address: "2580 The Collegeway, Mississauga, ON L5L 2L7",
    lat: 43.5440,
    lng: -79.6826,
    photos: [],
    amenities: ["washrooms", "parking", "lights"],
    website: "https://www.mississauga.ca/parks-and-trails/",
    is_active: true,
  },
  {
    operator: "City of Mississauga",
    name: "Frank McKechnie Community Centre",
    address: "1500 Eglinton Ave E, Mississauga, ON L4W 4Y1",
    lat: 43.6189,
    lng: -79.6107,
    photos: [],
    amenities: ["change_rooms", "washrooms", "parking", "lights"],
    website: "https://www.mississauga.ca/events-and-attractions/community-centres/frank-mckechnie-community-centre/",
    is_active: true,
  },

  // ---- Brampton ----------------------------------------------------------
  {
    operator: "City of Brampton",
    name: "Save Max Sports Centre",
    address: "1495 Sandalwood Pkwy E, Brampton, ON L6R 0E2",
    lat: 43.7388,
    lng: -79.7395,
    photos: [],
    amenities: ["change_rooms", "washrooms", "parking", "concessions", "indoor", "wifi"],
    website: "https://www.brampton.ca/EN/residents/Recreation/Recreation-Centres/Pages/Save-Max-Sports-Centre.aspx",
    is_active: true,
  },
  {
    operator: "City of Brampton",
    name: "CAA Centre",
    address: "7575 Kennedy Rd S, Brampton, ON L6W 4T3",
    lat: 43.6857,
    lng: -79.7286,
    photos: [],
    amenities: ["change_rooms", "washrooms", "parking", "concessions", "indoor", "seating"],
    website: "https://caacentre.ca",
    is_active: true,
  },
  {
    operator: "City of Brampton",
    name: "Chinguacousy Park",
    address: "9050 Bramalea Rd, Brampton, ON L6S 6G7",
    lat: 43.7404,
    lng: -79.7220,
    photos: [],
    amenities: ["washrooms", "parking", "lights"],
    website: "https://www.brampton.ca/EN/residents/parks/Pages/Chinguacousy-Park.aspx",
    is_active: true,
  },
];

const FIELDS: FieldSeed[] = [
  // The Hangar — premium indoor turf at Downsview
  { venue: "The Hangar at Downsview Park", name: "Field 1", surface: "indoor", size: "7v7", price_per_hour: 175, booking_platform: "none", is_active: true },
  { venue: "The Hangar at Downsview Park", name: "Field 2", surface: "indoor", size: "7v7", price_per_hour: 175, booking_platform: "none", is_active: true },
  { venue: "The Hangar at Downsview Park", name: "Mini Pitch", surface: "indoor", size: "5v5", price_per_hour: 110, booking_platform: "none", is_active: true },

  // Monarch Park Stadium — full size + warm-up
  { venue: "Monarch Park Stadium", name: "Main Field", surface: "turf", size: "11v11", price_per_hour: 165, booking_platform: "none", is_active: true },
  { venue: "Monarch Park Stadium", name: "East Pitch", surface: "turf", size: "7v7", price_per_hour: 95, booking_platform: "none", is_active: true },

  // Cherry Beach — outdoor turf strip
  { venue: "Cherry Beach Sports Fields", name: "Field 1", surface: "turf", size: "11v11", price_per_hour: 130, booking_platform: "none", is_active: true },
  { venue: "Cherry Beach Sports Fields", name: "Field 2", surface: "turf", size: "11v11", price_per_hour: 130, booking_platform: "none", is_active: true },
  { venue: "Cherry Beach Sports Fields", name: "Field 3", surface: "turf", size: "7v7", price_per_hour: 90, booking_platform: "none", is_active: true },

  // Lamport — single full pitch
  { venue: "Lamport Stadium", name: "Main Pitch", surface: "turf", size: "11v11", price_per_hour: 195, booking_platform: "none", is_active: true },
  { venue: "Lamport Stadium", name: "South End", surface: "turf", size: "5v5", price_per_hour: 85, booking_platform: "none", is_active: true },

  // Centennial Park
  { venue: "Centennial Park Stadium", name: "Stadium Field", surface: "turf", size: "11v11", price_per_hour: 150, booking_platform: "none", is_active: true },
  { venue: "Centennial Park Stadium", name: "South Field", surface: "grass", size: "11v11", price_per_hour: 75, booking_platform: "none", is_active: true },

  // Birchmount
  { venue: "Birchmount Stadium", name: "Main Field", surface: "turf", size: "11v11", price_per_hour: 145, booking_platform: "none", is_active: true },
  { venue: "Birchmount Stadium", name: "West Field", surface: "grass", size: "11v11", price_per_hour: 70, booking_platform: "none", is_active: true },

  // Soccer World — Esandar
  { venue: "Soccer World", name: "Pitch 1", surface: "indoor", size: "7v7", price_per_hour: 160, booking_platform: "none", is_active: true },
  { venue: "Soccer World", name: "Pitch 2", surface: "indoor", size: "7v7", price_per_hour: 160, booking_platform: "none", is_active: true },
  { venue: "Soccer World", name: "Mini Pitch", surface: "indoor", size: "5v5", price_per_hour: 95, booking_platform: "none", is_active: true },

  // Paramount Fine Foods Centre — Sportszone
  { venue: "Paramount Fine Foods Centre", name: "Sportszone Field A", surface: "indoor", size: "7v7", price_per_hour: 170, booking_platform: "none", is_active: true },
  { venue: "Paramount Fine Foods Centre", name: "Sportszone Field B", surface: "indoor", size: "7v7", price_per_hour: 170, booking_platform: "none", is_active: true },

  // Iceland Mississauga
  { venue: "Iceland Mississauga", name: "Indoor Field 1", surface: "indoor", size: "7v7", price_per_hour: 140, booking_platform: "none", is_active: true },
  { venue: "Iceland Mississauga", name: "Indoor Field 2", surface: "indoor", size: "7v7", price_per_hour: 140, booking_platform: "none", is_active: true },

  // Vic Johnston
  { venue: "Vic Johnston Community Centre", name: "Indoor Pitch", surface: "indoor", size: "5v5", price_per_hour: 105, booking_platform: "none", is_active: true },
  { venue: "Vic Johnston Community Centre", name: "Outdoor Field", surface: "grass", size: "11v11", price_per_hour: 65, booking_platform: "none", is_active: true },

  // Sawmill Valley
  { venue: "Sawmill Valley Community Park", name: "North Field", surface: "grass", size: "11v11", price_per_hour: 65, booking_platform: "none", is_active: true },
  { venue: "Sawmill Valley Community Park", name: "South Field", surface: "grass", size: "11v11", price_per_hour: 65, booking_platform: "none", is_active: true },

  // Frank McKechnie
  { venue: "Frank McKechnie Community Centre", name: "Field 1", surface: "grass", size: "11v11", price_per_hour: 70, booking_platform: "none", is_active: true },
  { venue: "Frank McKechnie Community Centre", name: "Field 2", surface: "grass", size: "7v7", price_per_hour: 60, booking_platform: "none", is_active: true },

  // Save Max Sports Centre — Brampton's main indoor venue
  { venue: "Save Max Sports Centre", name: "Field 1", surface: "indoor", size: "11v11", price_per_hour: 200, booking_platform: "none", is_active: true },
  { venue: "Save Max Sports Centre", name: "Field 2", surface: "indoor", size: "7v7", price_per_hour: 155, booking_platform: "none", is_active: true },
  { venue: "Save Max Sports Centre", name: "Field 3", surface: "indoor", size: "7v7", price_per_hour: 155, booking_platform: "none", is_active: true },

  // CAA Centre
  { venue: "CAA Centre", name: "Field House", surface: "indoor", size: "11v11", price_per_hour: 185, booking_platform: "none", is_active: true },
  { venue: "CAA Centre", name: "Mini Field", surface: "indoor", size: "7v7", price_per_hour: 140, booking_platform: "none", is_active: true },

  // Chinguacousy Park
  { venue: "Chinguacousy Park", name: "North Soccer Field", surface: "grass", size: "11v11", price_per_hour: 65, booking_platform: "none", is_active: true },
  { venue: "Chinguacousy Park", name: "South Soccer Field", surface: "grass", size: "11v11", price_per_hour: 65, booking_platform: "none", is_active: true },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/**
 * Refuse to run against anything that isn't a local Supabase stack. `wipe()`
 * hard-deletes every operator/venue/field, so one `npm run seed` with a prod
 * `.env` would destroy the live catalog. Local Supabase is always on
 * 127.0.0.1/localhost; override with SEED_ALLOW_NONLOCAL=1 only if you truly
 * mean to reseed a remote (you almost never do).
 */
function assertLocalTarget() {
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(String(SUPABASE_URL));
  if (isLocal || process.env.SEED_ALLOW_NONLOCAL === "1") return;
  console.error(
    `Refusing to seed: SUPABASE_URL is not local (${SUPABASE_URL}). seed.ts wipes ` +
      `operators/venues/fields. Point apps/api/.env at the local stack, or set ` +
      `SEED_ALLOW_NONLOCAL=1 if you really mean to wipe a remote database.`
  );
  process.exit(1);
}

async function wipe() {
  // Delete dependents first. Supabase requires a filter on .delete(), so we
  // use a guaranteed-no-match UUID to mean "all rows".
  const ALL = "00000000-0000-0000-0000-000000000000";

  const { error: e1 } = await supabase.from("fields").delete().neq("id", ALL);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("venues").delete().neq("id", ALL);
  if (e2) throw e2;
  const { error: e3 } = await supabase.from("operators").delete().neq("id", ALL);
  if (e3) throw e3;
}

async function seed() {
  assertLocalTarget();
  console.log("→ Wiping operators / venues / fields…");
  await wipe();

  console.log(`→ Inserting ${OPERATORS.length} operators…`);
  const { data: operatorRows, error: opErr } = await supabase
    .from("operators")
    .insert(OPERATORS)
    .select("id, name");
  if (opErr) throw opErr;
  if (!operatorRows) throw new Error("No operators returned from insert");
  const operatorByName = new Map(operatorRows.map((r) => [r.name, r.id]));

  console.log(`→ Inserting ${VENUES.length} venues…`);
  const venueInserts: TablesInsert<"venues">[] = VENUES.map(({ operator, ...rest }) => {
    const operator_id = operatorByName.get(operator);
    if (!operator_id) throw new Error(`Unknown operator: ${operator}`);
    return { ...rest, operator_id };
  });
  const { data: venueRows, error: vErr } = await supabase
    .from("venues")
    .insert(venueInserts)
    .select("id, name");
  if (vErr) throw vErr;
  if (!venueRows) throw new Error("No venues returned from insert");
  const venueByName = new Map(venueRows.map((r) => [r.name, r.id]));

  console.log(`→ Inserting ${FIELDS.length} fields…`);
  const fieldInserts: TablesInsert<"fields">[] = FIELDS.map(({ venue, ...rest }) => {
    const venue_id = venueByName.get(venue);
    if (!venue_id) throw new Error(`Unknown venue: ${venue}`);
    return { ...rest, venue_id };
  });
  const { error: fErr } = await supabase.from("fields").insert(fieldInserts);
  if (fErr) throw fErr;

  console.log(
    `✓ Seeded ${OPERATORS.length} operators, ${VENUES.length} venues, ${FIELDS.length} fields.`
  );
}

seed().catch((err) => {
  console.error("Seed failed:");
  console.error(err);
  process.exit(1);
});
