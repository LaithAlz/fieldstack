/**
 * Scrape runner. Usage:
 *
 *   bun run scrape -- <source>      # e.g. `bun run scrape -- mississauga`
 *   bun run scrape -- list          # list available sources
 *
 * Auth: uses the service_role key from env (bypasses RLS) so DDL-equivalent
 * inserts/upserts succeed without an authed user session.
 *
 * Idempotency: every venue + field carries an `externalId`; the runner
 * upserts on conflict so re-runs update the same rows instead of duplicating.
 */

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import { mississaugaAdapter } from "./sources/mississauga.js";
import type { ScrapeAdapter, ScrapedField, ScrapedVenue } from "./types.js";

const ADAPTERS: Record<string, ScrapeAdapter> = {
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

async function main() {
  const arg = process.argv[2] ?? "";
  if (arg === "" || arg === "list") {
    console.log("Available sources:");
    for (const a of Object.values(ADAPTERS)) {
      console.log(`  ${a.source}\t${a.label}`);
    }
    process.exit(0);
  }
  const adapter = ADAPTERS[arg];
  if (!adapter) {
    console.error(`[scrape] Unknown source: ${arg}`);
    console.error(`Try: ${Object.keys(ADAPTERS).join(", ")}`);
    process.exit(1);
  }

  console.log(`[scrape] Running ${adapter.label}…`);
  const t0 = Date.now();
  const venues = await adapter.run();
  console.log(`[scrape] Fetched ${venues.length} venues in ${Date.now() - t0}ms`);

  await ensureScrapedOperator();
  let venuesUpserted = 0;
  let fieldsUpserted = 0;
  for (const v of venues) {
    const venueId = await upsertVenue(v);
    if (!venueId) continue;
    venuesUpserted++;
    for (const f of v.fields) {
      const ok = await upsertField(venueId, f);
      if (ok) fieldsUpserted++;
    }
  }
  console.log(
    `[scrape] Done: ${venuesUpserted} venues, ${fieldsUpserted} fields`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------

// Placeholder operator that owns every scraped row until/unless an operator
// claims their venues. Matched by name (operators table has no unique slug
// column today; name dedupe is good enough at this scale).
const PLACEHOLDER_OPERATOR_NAME = "Scraped (unclaimed)";
let cachedOperatorId: string | null = null;

async function ensureScrapedOperator(): Promise<string> {
  if (cachedOperatorId) return cachedOperatorId;
  const { data: existing } = await supabase
    .from("operators")
    .select("id")
    .eq("name", PLACEHOLDER_OPERATOR_NAME)
    .maybeSingle();
  if (existing?.id) {
    cachedOperatorId = existing.id as string;
    return cachedOperatorId;
  }
  const { data: created, error } = await supabase
    .from("operators")
    .insert({
      name: PLACEHOLDER_OPERATOR_NAME,
      integration_type: "none",
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[scrape] Could not create placeholder operator", error);
    process.exit(1);
  }
  cachedOperatorId = created.id as string;
  return cachedOperatorId;
}

async function upsertVenue(v: ScrapedVenue): Promise<string | null> {
  const operatorId = await ensureScrapedOperator();
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

async function upsertField(venueId: string, f: ScrapedField): Promise<boolean> {
  const { error } = await supabase.from("fields").upsert(
    {
      external_id: f.externalId,
      venue_id: venueId,
      name: f.name,
      surface: f.surface,
      size: f.size,
      price_per_hour: f.pricePerHour ?? null,
      booking_url: f.bookingUrl ?? null,
      booking_platform: "none",
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
