/**
 * Scrape runner. Usage:
 *
 *   bun run scrape -- <source>      # e.g. `bun run scrape -- osm`
 *   bun run scrape -- list          # list available sources
 *   bun run scrape -- all           # run every source in sequence
 *
 * Auth: service_role key from env (bypasses RLS).
 *
 * Pipeline per source:
 *   1. Upsert every operator from operators.yaml into the operators
 *      table (so they have stable ids before we link venues to them).
 *   2. Run the source adapter, get ScrapedVenue records.
 *   3. For each venue:
 *      - Match its name against the operator registry
 *      - Use matched operator's id, or fall back to the placeholder
 *        operator "Scraped (unclaimed)"
 *      - For manual venues, the YAML's explicit `operator:` field
 *        overrides name-matching
 *      - Inherit booking_url from the matched operator when the
 *        venue/field doesn't carry one
 *      - Upsert venue (idempotent on external_id)
 *   4. Upsert each field under its venue.
 *
 * Idempotency: every venue + field carries an `external_id`; the
 * runner upserts on conflict so re-runs update rather than duplicate.
 */

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import { osmAdapter } from "./sources/osm.js";
import { manualAdapter } from "./sources/manual.js";
import { googlePlacesAdapter } from "./sources/googlePlaces.js";
import { playtomicAdapter } from "./sources/playtomic.js";
import { mississaugaAdapter } from "./sources/mississauga.js";
import type { ScrapeAdapter, ScrapedField, ScrapedVenue } from "./types.js";
import {
  loadManualVenues,
  loadOperators,
  type Operator,
} from "./lib/registry.js";
import { findOperator } from "./lib/operatorMatcher.js";

const ADAPTERS: Record<string, ScrapeAdapter> = {
  [osmAdapter.source]: osmAdapter,
  [manualAdapter.source]: manualAdapter,
  [googlePlacesAdapter.source]: googlePlacesAdapter,
  [playtomicAdapter.source]: playtomicAdapter,
  [mississaugaAdapter.source]: mississaugaAdapter,
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[scrape] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Placeholder operator for venues that don't match any entry in
// operators.yaml. Kept around as a catch-all so every venue always
// has a non-null operator_id.
const PLACEHOLDER_OPERATOR_NAME = "Scraped (unclaimed)";

// Manual-venue → operator name lookup, populated from manual-venues.yaml
// (the YAML's explicit `operator:` field). Lets the runner respect
// what the YAML says instead of guessing via name match.
let manualOperatorOverrides: Map<string, string> = new Map();

async function main() {
  const arg = process.argv[2] ?? "";
  if (arg === "" || arg === "list") {
    console.log("Available sources:");
    for (const a of Object.values(ADAPTERS)) {
      console.log(`  ${a.source}\t${a.label}`);
    }
    console.log("  all\t\tRun every source in sequence");
    process.exit(0);
  }

  // 1. Upsert every operator from operators.yaml first so they have
  //    stable ids by the time we start linking venues.
  const operators = loadOperators();
  console.log(`[scrape] upserting ${operators.length} operators from registry`);
  const operatorIdsByName = await upsertOperators(operators);
  const placeholderId = await ensurePlaceholderOperator();

  // Seed the manual-override map so the manual source can use it.
  manualOperatorOverrides = new Map(
    loadManualVenues()
      .filter((v) => v.operator)
      .map((v) => [v.externalId, v.operator as string])
  );

  const sourcesToRun: ScrapeAdapter[] =
    arg === "all"
      ? Object.values(ADAPTERS)
      : ADAPTERS[arg]
        ? [ADAPTERS[arg]]
        : [];
  if (sourcesToRun.length === 0) {
    console.error(`[scrape] Unknown source: ${arg}`);
    console.error(`Try: ${Object.keys(ADAPTERS).join(", ")}, all`);
    process.exit(1);
  }

  let totalVenues = 0;
  let totalFields = 0;
  for (const adapter of sourcesToRun) {
    console.log(`[scrape] Running ${adapter.label}…`);
    const t0 = Date.now();
    const venues = await adapter.run();
    console.log(
      `[scrape] ${adapter.source}: fetched ${venues.length} venues in ${Date.now() - t0}ms`
    );

    let venuesUpserted = 0;
    let fieldsUpserted = 0;
    for (const v of venues) {
      const operator = resolveOperator(v, operators);
      const operatorId = operator
        ? operatorIdsByName.get(operator.name.toLowerCase()) ?? placeholderId
        : placeholderId;
      const venueId = await upsertVenue(v, operatorId);
      if (!venueId) continue;
      venuesUpserted++;
      // Inherit booking URL from operator if field doesn't carry one.
      const fallbackUrl = operator?.bookingUrl ?? operator?.website ?? null;
      for (const f of v.fields) {
        const ok = await upsertField(venueId, f, fallbackUrl);
        if (ok) fieldsUpserted++;
      }
    }
    console.log(
      `[scrape] ${adapter.source}: upserted ${venuesUpserted} venues, ${fieldsUpserted} fields`
    );
    totalVenues += venuesUpserted;
    totalFields += fieldsUpserted;
  }

  console.log(`[scrape] Done: ${totalVenues} venues, ${totalFields} fields total`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Operator handling
// ---------------------------------------------------------------------------

/** Look up the right operator for a scraped venue. */
function resolveOperator(
  venue: ScrapedVenue,
  operators: Operator[]
): Operator | null {
  // Manual venues with explicit operator: field win.
  const override = manualOperatorOverrides.get(venue.externalId);
  if (override) {
    const exact = operators.find(
      (o) => o.name.toLowerCase() === override.toLowerCase()
    );
    if (exact) return exact;
    console.warn(
      `[scrape] manual venue ${venue.externalId} references unknown operator "${override}" — falling back to name match`
    );
  }
  // Otherwise name/alias match.
  return findOperator(venue.name, operators);
}

/**
 * Upsert every operator from the YAML registry. Returns a map
 * lowercase-name → uuid for fast lookup during venue upsert.
 *
 * No unique constraint on operators.name, so we look up by name first
 * and update OR insert. Name dedupe is good enough at the registry's
 * scale (handful of entries).
 */
async function upsertOperators(
  operators: Operator[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const op of operators) {
    const { data: existing, error: selErr } = await supabase
      .from("operators")
      .select("id")
      .ilike("name", op.name)
      .maybeSingle();
    if (selErr) {
      console.warn(`[scrape] operator lookup failed for "${op.name}"`, selErr.message);
      continue;
    }
    if (existing?.id) {
      await supabase
        .from("operators")
        .update({
          website: op.website ?? null,
          integration_type: op.integrationType,
        })
        .eq("id", existing.id);
      out.set(op.name.toLowerCase(), existing.id as string);
      continue;
    }
    const { data: created, error: insErr } = await supabase
      .from("operators")
      .insert({
        name: op.name,
        website: op.website ?? null,
        integration_type: op.integrationType,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      console.warn(`[scrape] operator insert failed for "${op.name}"`, insErr?.message);
      continue;
    }
    out.set(op.name.toLowerCase(), created.id as string);
  }
  return out;
}

let cachedPlaceholderId: string | null = null;
async function ensurePlaceholderOperator(): Promise<string> {
  if (cachedPlaceholderId) return cachedPlaceholderId;
  const { data: existing } = await supabase
    .from("operators")
    .select("id")
    .eq("name", PLACEHOLDER_OPERATOR_NAME)
    .maybeSingle();
  if (existing?.id) {
    cachedPlaceholderId = existing.id as string;
    return cachedPlaceholderId;
  }
  const { data: created, error } = await supabase
    .from("operators")
    .insert({ name: PLACEHOLDER_OPERATOR_NAME, integration_type: "none" })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[scrape] Could not create placeholder operator", error);
    process.exit(1);
  }
  cachedPlaceholderId = created.id as string;
  return cachedPlaceholderId;
}

// ---------------------------------------------------------------------------
// Venue + field upsert
// ---------------------------------------------------------------------------

async function upsertVenue(
  v: ScrapedVenue,
  operatorId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("venues")
    .upsert(
      {
        external_id: v.externalId,
        operator_id: operatorId,
        name: v.name,
        address: v.address,
        lat: v.lat,
        lng: v.lng,
        photos: v.photos,
        amenities: v.amenities,
        venue_type: v.venueType ?? null,
        is_active: true,
        data_source: "scrape",
        last_scraped_at: new Date().toISOString(),
        hours: v.hours ?? null,
        booking_notes: v.bookingNotes ?? null,
        cancellation_policy: v.cancellationPolicy ?? null,
      },
      { onConflict: "external_id" }
    )
    .select("id")
    .single();
  if (error || !data) {
    console.warn(`[scrape] venue upsert failed for ${v.externalId}`, error?.message);
    return null;
  }
  return data.id as string;
}

async function upsertField(
  venueId: string,
  f: ScrapedField,
  fallbackBookingUrl: string | null
): Promise<boolean> {
  const { error } = await supabase.from("fields").upsert(
    {
      external_id: f.externalId,
      venue_id: venueId,
      name: f.name,
      surface: f.surface,
      size: f.size,
      price_per_hour: f.pricePerHour ?? null,
      // Use the field's own URL if present, else inherit from operator.
      booking_url: f.bookingUrl ?? fallbackBookingUrl,
      booking_platform: f.bookingPlatform ?? "none",
      is_active: true,
    },
    { onConflict: "external_id" }
  );
  if (error) {
    console.warn(`[scrape] field upsert failed for ${f.externalId}`, error.message);
    return false;
  }
  return true;
}

main().catch((err) => {
  console.error("[scrape] fatal", err);
  process.exit(1);
});
