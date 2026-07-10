/**
 * Cross-source venue dedup runner. Usage:
 *
 *   bun scripts/scrape/dedupe.ts            # dry run — print candidates
 *   bun scripts/scrape/dedupe.ts --apply    # deactivate AUTO-tier losers
 *
 * AUTO-tier pairs (same name + same spot, see lib/dedupe.ts) are safe to
 * apply unattended and run with --apply in the weekly scrape workflow.
 * REVIEW-tier pairs are only ever printed — a human resolves those, unless
 * data/dedupe-resolutions.yaml (issue #495) already carries a verdict:
 *   - "distinct" pairs are suppressed from the printed list (summary count
 *     only); the tenant/club row is NOT deactivated, see docs/scraping.md §4.3.
 *   - "merge" pairs are applied under --apply exactly like an AUTO pair,
 *     with the keeper forced from the resolution (overriding pickWinner).
 * A resolution matching no currently-found pair prints as a stale info line.
 *
 * Applying = the standard soft-delete: is_active=false on the loser plus
 * duplicate_of=keeper.id for auditability. Never deletes, fully reversible.
 *
 * Auth: service_role key from env (bypasses RLS).
 */

import fs from "node:fs";
import path from "node:path";

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import { applyResolutions, findDuplicates, loadResolutions, type DedupeVenue } from "./lib/dedupe.js";

const RESOLUTIONS_PATH = path.resolve(import.meta.dirname, "data", "dedupe-resolutions.yaml");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[dedupe] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const apply = process.argv.includes("--apply");

async function main() {
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, address, lat, lng, external_id, fields(id)")
    .eq("is_active", true)
    .limit(2000);
  if (error) {
    console.error("[dedupe] venue fetch failed:", error.message);
    process.exit(1);
  }

  const venues: DedupeVenue[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    address: (r.address as string | null) ?? null,
    lat: r.lat as number | null,
    lng: r.lng as number | null,
    external_id: r.external_id as string,
    field_count: Array.isArray(r.fields) ? r.fields.length : 0,
  }));

  console.log(`[dedupe] scanning ${venues.length} active venues (${apply ? "APPLY" : "dry run"})`);

  const pairs = findDuplicates(venues);
  if (pairs.length === 0) {
    console.log("[dedupe] no duplicate candidates found");
    return;
  }

  const resolutionsRaw = fs.readFileSync(RESOLUTIONS_PATH, "utf8");
  const resolutions = loadResolutions(resolutionsRaw);
  const { suppressed, promoted, unresolved, staleResolutions } = applyResolutions(pairs, resolutions);

  let applied = 0;

  if (suppressed.length > 0) {
    console.log(
      `[dedupe] suppressed ${suppressed.length} pair(s) resolved "distinct" in data/dedupe-resolutions.yaml`
    );
  }

  for (const { keep, drop, resolution } of promoted) {
    const line =
      `MERGE  keep "${keep.name}" (${keep.external_id}) ← drop "${drop.name}" (${drop.external_id})` +
      ` — resolved: ${resolution.reason}`;
    console.log(line);

    if (apply) {
      const { error: upErr } = await supabase
        .from("venues")
        .update({ is_active: false, duplicate_of: keep.id })
        .eq("id", drop.id);
      if (upErr) {
        console.warn(`  ✗ apply failed for ${drop.id}:`, upErr.message);
      } else {
        applied++;
      }
    }
  }

  for (const p of unresolved) {
    const line =
      `${p.tier.toUpperCase().padEnd(6)} keep "${p.keep.name}" (${p.keep.external_id})` +
      ` ← drop "${p.drop.name}" (${p.drop.external_id}) — ${p.reason}`;
    console.log(line);

    if (apply && p.tier === "auto") {
      const { error: upErr } = await supabase
        .from("venues")
        .update({ is_active: false, duplicate_of: p.keep.id })
        .eq("id", p.drop.id);
      if (upErr) {
        console.warn(`  ✗ apply failed for ${p.drop.id}:`, upErr.message);
      } else {
        applied++;
      }
    }
  }

  if (staleResolutions.length > 0) {
    console.log(`\n[dedupe] stale resolutions (no matching pair found this run):`);
    for (const r of staleResolutions) {
      console.log(`  info: ${r.a} <-> ${r.b} (${r.verdict}, decided ${r.decided}) — ${r.reason}`);
    }
  }

  const autoUnresolved = unresolved.filter((p) => p.tier === "auto").length;
  const reviewUnresolved = unresolved.length - autoUnresolved;
  console.log(
    `\n[dedupe] done — ${autoUnresolved} auto, ${reviewUnresolved} review, ` +
      `${suppressed.length} resolved-distinct, ${promoted.length} resolved-merge, ${staleResolutions.length} stale` +
      `${apply ? `, ${applied} deactivated` : " (dry run, nothing changed)"}`
  );
}

await main();
