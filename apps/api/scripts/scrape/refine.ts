/**
 * Refinement pass for scraped venues. Usage:
 *
 *   bun run scrape:refine            # dry run — prints the plan, writes nothing
 *   bun run scrape:refine -- --apply # actually deactivate
 *
 * The Google Places sweep is a wide discovery net: great coverage, but it
 * also pulls in (a) the same physical facility under several Google listings
 * and (b) clubs / academies / training orgs registered at office addresses
 * that you can't rent by the hour. This pass cleans that up *reversibly* —
 * it never deletes, it flips `is_active` to false on the venue and its
 * fields, so a venue can be brought back with a single update if we got it
 * wrong. Every read path (list API, map RPC, search, RLS) gates on
 * `is_active`, so a deactivated venue simply stops appearing.
 *
 * Rules, applied in order (classifier + evidence override + cluster logic
 * live in lib/refineClassifier.ts, unit-tested in
 * tests/refineClassifier.test.ts):
 *   1. CLASSIFY  — deactivate names that read as a club/academy/training/
 *                  league org AND carry no STRONG facility signal. Strong
 *                  facility names (dome / turf / complex / futsal / arena …)
 *                  always survive, even if they also say "academy". A bare
 *                  "indoor" is NOT strong enough to shield an org match
 *                  (issue #497 — "Greater Toronto Indoor Soccer League" read
 *                  as a facility under the old rule).
 *   2. EVIDENCE  — an org classification is only a deactivation CANDIDATE.
 *                  It's force-kept if it matches an operators.yaml entry, has
 *                  hand-verified hours, or has an active field with a price
 *                  or a booking_url (see evaluateFacilityEvidence). DENY rows
 *                  (retail, other sports, kids' playgrounds) skip this check
 *                  entirely — they're not "maybe a facility", they're wrong
 *                  data.
 *   2b. MERGE-LOSER GUARD — a venue recorded as the drop side of a "merge"
 *                  verdict in data/dedupe-resolutions.yaml that is currently
 *                  INACTIVE is held inactive: reactivating it would undo a
 *                  dedupe --apply, and letting the inactive ghost into
 *                  Pass-2 clusters can knock out a real active venue (that
 *                  is exactly how "Soccer Centre Parking", deactivated by
 *                  dedupe, was beating the real Brampton Soccer Centre).
 *                  Currently-ACTIVE merge losers are NOT deactivated here —
 *                  dedupe.ts --apply owns that, because it records the
 *                  duplicate_of audit column refine doesn't write.
 *   3. DEDUPE    — among the venues still active at one address, keep the
 *                  one with the strongest facility signal (ties → shortest
 *                  name) and deactivate the rest — EXCEPT (issue #497
 *                  extension, see resolveAddressCluster): a pair with a
 *                  human verdict in data/dedupe-resolutions.yaml follows
 *                  that verdict (distinct = both stay, merge = the registry
 *                  keeper wins), and a venue with facility evidence never
 *                  loses to one without any (the winner swaps; a pair where
 *                  BOTH sides carry evidence prints as needs-human and is
 *                  left alone — it belongs in dedupe.ts's REVIEW flow).
 *
 * Idempotent: re-running re-evaluates from the current state and only flips
 * venues that should change, so it's safe to run repeatedly.
 *
 * The scrape → refine cycle: `bun run scrape -- google` always upserts venues
 * as active (it can't know which are noise), so re-running the scrape wipes
 * out a previous refine. Run this pass after every scrape. To make a manual
 * "keep this one" decision stick across that cycle, add the venue's
 * external_id to ALLOWLIST below — it'll be force-kept (and reactivated if a
 * past run deactivated it).
 *
 * Scope: only touches venues whose external_id starts with "google:". OSM and
 * manual venues are left alone.
 */

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { loadOperators } from "./lib/registry.js";
import { loadResolutions } from "./lib/dedupe.js";
import {
  buildResolutionLookup,
  classifyName,
  evaluateFacilityEvidence,
  resolveAddressCluster,
  type EvidenceField,
} from "./lib/refineClassifier.js";

const RESOLUTIONS_PATH = path.resolve(
  import.meta.dirname,
  "data",
  "dedupe-resolutions.yaml"
);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[refine] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Force-keep: external_ids we've manually confirmed are real bookable venues
// even though the heuristics would drop them (e.g. a facility whose name is
// just "<City> Soccer Club"). These survive classification AND get reactivated
// if a prior run deactivated them. Add ids as you audit the deactivation list.
const ALLOWLIST = new Set<string>([
  // "google:ChIJ...": "Oakville Soccer Club main dome",
]);

// Normalize an address for clustering: lowercase, collapse whitespace, and
// key on the leading chunk (street number + street) so unit/suite variations
// for the same building group together.
function addressKey(address: string | null): string {
  if (!address) return "";
  return address.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 28);
}

type Venue = {
  id: string;
  external_id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  hours: Record<string, unknown> | null;
};

type Decision = {
  venue: Venue;
  active: boolean; // desired end state
  reason: string;
};

async function main() {
  const apply = process.argv.includes("--apply");

  const { data, error } = await supabase
    .from("venues")
    .select("id, external_id, name, address, is_active, hours")
    .like("external_id", "google:%");
  if (error || !data) {
    console.error("[refine] failed to load venues", error?.message);
    process.exit(1);
  }
  const venues = data as Venue[];
  console.log(`[refine] ${venues.length} Google venues loaded`);

  // Active fields per venue, for the facility-evidence override (issue
  // #497): an org row survives if any active field has a price or a
  // booking_url. Fetched in one shot, keyed by venue_id.
  const fieldsByVenue = new Map<string, EvidenceField[]>();
  const venueIds = venues.map((v) => v.id);
  if (venueIds.length > 0) {
    const { data: fieldRows, error: fErr } = await supabase
      .from("fields")
      .select("venue_id, price_per_hour, booking_url")
      .in("venue_id", venueIds)
      .eq("is_active", true);
    if (fErr || !fieldRows) {
      console.error("[refine] failed to load fields", fErr?.message);
      process.exit(1);
    }
    for (const f of fieldRows as Array<EvidenceField & { venue_id: string }>) {
      const list = fieldsByVenue.get(f.venue_id) ?? [];
      list.push({ price_per_hour: f.price_per_hour, booking_url: f.booking_url });
      fieldsByVenue.set(f.venue_id, list);
    }
  }

  const operators = loadOperators();

  // Human dedupe adjudications (issue #495): distinct pairs must never
  // dedupe-deactivate each other here; merge pairs defer to the registry
  // keeper; recorded merge losers must not be resurrected.
  const resolutions = loadResolutions(fs.readFileSync(RESOLUTIONS_PATH, "utf8"));
  const resolutionFor = buildResolutionLookup(resolutions);
  const mergeLoserExtIds = new Set(
    resolutions
      .filter((r) => r.verdict === "merge" && r.keep)
      .map((r) => (r.keep === r.a ? r.b : r.a))
  );

  // Facility evidence, memoized per venue — used by the org override in
  // Pass 1 and by the Pass-2 shield.
  const evidenceMemo = new Map<string, boolean>();
  const hasEvidence = (v: Venue): boolean => {
    const cached = evidenceMemo.get(v.id);
    if (cached !== undefined) return cached;
    const fires = evaluateFacilityEvidence(
      { name: v.name, hours: v.hours, fields: fieldsByVenue.get(v.id) ?? [] },
      operators
    ).fires;
    evidenceMemo.set(v.id, fires);
    return fires;
  };

  // Pass 1: classify. Mark likely orgs for deactivation up front so they
  // don't win a dedupe tie-break over a real facility. An "org"
  // classification is only a CANDIDATE — the facility-evidence override
  // can still force it to stay active (issue #497).
  const decisions = new Map<string, Decision>();
  for (const v of venues) {
    if (ALLOWLIST.has(v.external_id)) {
      decisions.set(v.id, { venue: v, active: true, reason: "allowlisted" });
      continue;
    }
    const nameClass = classifyName(v.name);
    if (nameClass === "deny") {
      decisions.set(v.id, {
        venue: v,
        active: false,
        reason: "retail/other-sport/non-venue",
      });
      continue;
    }
    // Pass 2b (merge-loser guard, see header): an inactive registry merge
    // loser is held inactive no matter how its name classifies — it must
    // not be reactivated over a dedupe --apply, and it must not enter the
    // address clusters below as an active-looking ghost.
    if (mergeLoserExtIds.has(v.external_id) && !v.is_active) {
      decisions.set(v.id, {
        venue: v,
        active: false,
        reason: "merge-resolved loser (dedupe-resolutions.yaml)",
      });
      continue;
    }
    if (nameClass === "facility") {
      decisions.set(v.id, { venue: v, active: true, reason: "facility" });
      continue;
    }
    // nameClass === "org": a candidate, subject to the evidence override.
    const evidence = evaluateFacilityEvidence(
      { name: v.name, hours: v.hours, fields: fieldsByVenue.get(v.id) ?? [] },
      operators
    );
    decisions.set(
      v.id,
      evidence.fires
        ? { venue: v, active: true, reason: `override: ${evidence.reason}` }
        : { venue: v, active: false, reason: "club/academy/org" }
    );
  }

  // Pass 2: dedupe among the still-active venues per address, with the
  // resolutions-respect + evidence-shield protections (resolveAddressCluster
  // in lib/refineClassifier.ts — see its header for the incidents).
  const clusters = new Map<string, Venue[]>();
  for (const v of venues) {
    if (!decisions.get(v.id)!.active) continue; // already dropped as org
    const key = addressKey(v.address);
    if (!key) continue;
    clusters.set(key, (clusters.get(key) ?? []).concat(v));
  }
  const needsHuman: Array<{ a: Venue; b: Venue }> = [];
  for (const [, group] of clusters) {
    if (group.length < 2) continue;
    for (const d of resolveAddressCluster(group, resolutionFor, hasEvidence)) {
      if (d.type === "needs-human") {
        needsHuman.push({ a: d.a, b: d.b });
        continue;
      }
      decisions.set(d.venue.id, {
        venue: d.venue,
        active: false,
        reason: d.reason,
      });
    }
  }

  // Only act on venues whose state actually changes.
  const toDeactivate = [...decisions.values()].filter(
    (d) => !d.active && d.venue.is_active
  );
  const toReactivate = [...decisions.values()].filter(
    (d) => d.active && !d.venue.is_active
  );
  const keptActive = [...decisions.values()].filter((d) => d.active).length;

  const orgs = toDeactivate.filter((d) => d.reason === "club/academy/org");
  const deny = toDeactivate.filter((d) => d.reason === "retail/other-sport/non-venue");
  const dups = toDeactivate.filter((d) => d.reason.startsWith("dup of"));
  // Org candidates the facility-evidence override kept active — printed
  // separately so a human can audit whether the override was right.
  const overrides = [...decisions.values()].filter((d) =>
    d.reason.startsWith("override:")
  );
  // Merge losers held inactive (already inactive in the DB, so they appear
  // in neither toDeactivate nor toReactivate) — counted for transparency.
  const heldInactive = [...decisions.values()].filter(
    (d) => d.reason === "merge-resolved loser (dedupe-resolutions.yaml)"
  );

  console.log(
    `\n[refine] plan: keep ${keptActive} active, deactivate ${toDeactivate.length}` +
      ` (${orgs.length} orgs, ${deny.length} retail/other, ${dups.length} dupes),` +
      ` reactivate ${toReactivate.length}, ${overrides.length} org candidates kept by evidence override,` +
      ` ${heldInactive.length} merge-resolved losers held inactive, ${needsHuman.length} needs-human pairs`
  );
  console.log(`\n--- deactivating (${toDeactivate.length}) ---`);
  for (const d of toDeactivate) {
    console.log(
      `  ✗ ${d.venue.name}  (${d.venue.external_id})  [${d.reason}]  — ${d.venue.address ?? ""}`
    );
  }
  if (overrides.length) {
    console.log(`\n--- kept by facility-evidence override (${overrides.length}) ---`);
    for (const d of overrides) {
      console.log(
        `  ⚑ ${d.venue.name}  (${d.venue.external_id})  [${d.reason}]  — ${d.venue.address ?? ""}`
      );
    }
  }
  if (needsHuman.length) {
    console.log(
      `\n--- needs human: both sides carry facility evidence (${needsHuman.length}) ---`
    );
    for (const p of needsHuman) {
      console.log(
        `  ? "${p.a.name}" (${p.a.external_id}) vs "${p.b.name}" (${p.b.external_id}) — real facility pair, belongs in dedupe.ts's REVIEW flow`
      );
    }
  }
  if (toReactivate.length) {
    console.log(`\n--- reactivating (${toReactivate.length}) ---`);
    for (const d of toReactivate) {
      console.log(`  ✓ ${d.venue.name}  (${d.venue.external_id})`);
    }
  }

  if (!apply) {
    console.log(
      `\n[refine] DRY RUN — nothing written. Re-run with \`--apply\` to commit.`
    );
    process.exit(0);
  }

  // Apply: flip venue + its fields together so a deactivated venue carries no
  // orphaned active fields.
  let changed = 0;
  for (const d of [...toDeactivate, ...toReactivate]) {
    const { error: vErr } = await supabase
      .from("venues")
      .update({ is_active: d.active })
      .eq("id", d.venue.id);
    if (vErr) {
      console.warn(`[refine] venue update failed for ${d.venue.id}`, vErr.message);
      continue;
    }
    await supabase.from("fields").update({ is_active: d.active }).eq("venue_id", d.venue.id);
    changed++;
  }
  console.log(`\n[refine] applied: ${changed} venues updated`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[refine] fatal", err);
  process.exit(1);
});
