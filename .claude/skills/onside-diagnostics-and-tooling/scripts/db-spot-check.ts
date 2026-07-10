/**
 * Read-only production DB spot check for Onside.
 *
 * Usage (from repo root or anywhere):
 *   bun /Users/laith/code/soccer/.claude/skills/onside-diagnostics-and-tooling/scripts/db-spot-check.ts
 *
 * Zero npm dependencies: talks to Supabase PostgREST directly with fetch.
 * Credentials: reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
 * apps/api/.env (path resolved relative to this file), or from process env
 * if already exported. Service role bypasses RLS so inactive rows are
 * visible; every request here is a GET/HEAD (no writes anywhere).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// scripts/ -> onside-diagnostics-and-tooling/ -> skills/ -> .claude/ -> repo root
const ENV_PATH = join(HERE, "..", "..", "..", "..", "apps", "api", ".env");

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fall through to process.env */
  }
  return out;
}

const fileEnv = loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL;
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !KEY) {
  console.error(
    `[spot-check] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (looked in ${ENV_PATH} and process env)`
  );
  process.exit(1);
}

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

/** Exact row count for a PostgREST filter, zero rows transferred. */
async function count(table: string, filter: string): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id&${filter}`;
  const res = await fetch(url, {
    method: "HEAD",
    headers: { ...HEADERS, Prefer: "count=exact" },
  });
  if (!res.ok) throw new Error(`${table}?${filter} -> HTTP ${res.status}`);
  const range = res.headers.get("content-range") ?? "/0";
  return Number(range.split("/")[1]);
}

/** Page through a select (Supabase caps responses at 1000 rows per request). */
async function fetchAll<T>(table: string, select: string, filter: string): Promise<T[]> {
  const rows: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&${filter}`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok && res.status !== 416) throw new Error(`${table} page -> HTTP ${res.status}`);
    if (res.status === 416) break; // ran off the end
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const cutoffIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

async function main() {
  // ---- headline counts ------------------------------------------------
  const [
    activeVenues,
    inactiveVenues,
    dupLosers,
    activeFields,
    fieldsWithBooking,
    fieldsWithPrice,
    withPlaceId,
    withPhotos,
    staleScraped,
  ] = await Promise.all([
    count("venues", "is_active=eq.true"),
    count("venues", "is_active=eq.false"),
    count("venues", "duplicate_of=not.is.null"),
    count("fields", "is_active=eq.true"),
    count("fields", "is_active=eq.true&booking_url=not.is.null"),
    count("fields", "is_active=eq.true&price_per_hour=not.is.null"),
    count("venues", "is_active=eq.true&google_place_id=not.is.null"),
    // photos is text[] NOT NULL DEFAULT '{}' (migration 001), so not.is.null
    // matches EVERY venue; neq.{} counts venues with at least one photo.
    count("venues", "is_active=eq.true&photos=neq.{}"),
    count(
      "venues",
      `is_active=eq.true&data_source=eq.scrape&last_scraped_at=lt.${cutoffIso}`
    ),
  ]);

  console.log("== venues ==");
  console.log(`active                 ${activeVenues}`);
  console.log(`inactive (soft-deleted) ${inactiveVenues}  (dedupe losers: ${dupLosers})`);
  console.log(`with google_place_id   ${withPlaceId}`);
  console.log(`with photos            ${withPhotos}`);
  console.log(`stale (>14d unscraped) ${staleScraped}`);
  console.log("== fields ==");
  console.log(`active                 ${activeFields}`);
  console.log(`with booking_url       ${fieldsWithBooking}`);
  console.log(`with price_per_hour    ${fieldsWithPrice}`);

  // ---- active venues by external_id source prefix ----------------------
  const idRows = await fetchAll<{ external_id: string | null }>(
    "venues",
    "external_id",
    "is_active=eq.true"
  );
  const byPrefix = new Map<string, number>();
  for (const r of idRows) {
    const prefix = r.external_id ? r.external_id.split(":")[0] : "(null)";
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
  }
  console.log("== active venues by source prefix ==");
  for (const [p, n] of [...byPrefix.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${p.padEnd(14)} ${n}`);
  }

  // ---- orphaned venues: active venue, zero ACTIVE fields ---------------
  // fields.is_active=eq.true filters the embedded array, not the venues.
  const orphanRows = await fetchAll<{
    id: string;
    name: string;
    external_id: string | null;
    fields: { id: string }[];
  }>(
    "venues",
    "id,name,external_id,fields(id)",
    "is_active=eq.true&fields.is_active=eq.true"
  );
  const orphans = orphanRows.filter((v) => v.fields.length === 0);
  console.log(`== orphaned venues (active, zero active fields): ${orphans.length} ==`);
  for (const o of orphans.slice(0, 20)) {
    console.log(`  ${o.external_id ?? "(no external_id)"}  ${o.name}`);
  }
  if (orphans.length > 20) console.log(`  ... and ${orphans.length - 20} more`);
}

main().catch((err) => {
  console.error("[spot-check] fatal:", err.message ?? err);
  process.exit(1);
});
