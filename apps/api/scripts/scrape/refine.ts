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
 * Two rules, applied in order:
 *   1. CLASSIFY  — deactivate names that read as a club/academy/training org
 *                  AND carry no facility signal. Strong facility names
 *                  (dome / turf / complex / futsal / arena …) always survive,
 *                  even if they also say "academy".
 *   2. DEDUPE    — among the venues still active at one address, keep the one
 *                  with the strongest facility signal (ties → shortest name)
 *                  and deactivate the rest.
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

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[refine] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A name that clearly names a bookable facility. These win over any
// club/academy token — "X Indoor Sports Complex" stays even if it also runs
// an academy. Ordered loosely by strength for the dedupe tie-break below.
const FACILITY_SIGNAL = [
  /\bdome\b/i,
  /\bturf\b/i,
  /\bsports?\s?(complex|plex)\b/i,
  /\bsports?\s?(centre|center)\b/i,
  /\bfutsal\b/i,
  /\bfield\s?house\b/i,
  /\barena\b/i,
  /\bindoor\b/i,
  /\bcomplex\b/i,
];

// Org/program tokens. A venue matching one of these, with NO facility signal,
// is treated as a club/academy/team/program rather than a rentable place.
const ORG_SIGNAL =
  /\b(club|academ\w*|training|develop\w*|school|youth|oldtimers|league|association|f\.?c\.?|fc)\b/i;

// Hard deny: never a soccer venue you'd book by the hour, no matter what else
// the name says (these override facility signal). Retail, a different primary
// sport, or party/event businesses.
const DENY_SIGNAL =
  /\b(supplies|warehouse|depot|equipment|retail|store)\b|\bindoor golf\b|\b(baseball|softball)\b|\b(bubble soccer|archery|paintball|trampoline)\b/i;

// Force-keep: external_ids we've manually confirmed are real bookable venues
// even though the heuristics would drop them (e.g. a facility whose name is
// just "<City> Soccer Club"). These survive classification AND get reactivated
// if a prior run deactivated them. Add ids as you audit the deactivation list.
const ALLOWLIST = new Set<string>([
  // "google:ChIJ...": "Oakville Soccer Club main dome",
]);

function facilityScore(name: string): number {
  // Higher = stronger facility signal. 0 = no signal at all.
  for (let i = 0; i < FACILITY_SIGNAL.length; i++) {
    if (FACILITY_SIGNAL[i]!.test(name)) return FACILITY_SIGNAL.length - i;
  }
  return 0;
}

// Classify a name into a drop reason, or null to keep it active.
function dropReason(name: string): string | null {
  if (DENY_SIGNAL.test(name)) return "retail/other-sport/non-venue";
  if (facilityScore(name) === 0 && ORG_SIGNAL.test(name)) return "club/academy/org";
  return null;
}

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
    .select("id, external_id, name, address, is_active")
    .like("external_id", "google:%");
  if (error || !data) {
    console.error("[refine] failed to load venues", error?.message);
    process.exit(1);
  }
  const venues = data as Venue[];
  console.log(`[refine] ${venues.length} Google venues loaded`);

  // Pass 1: classify. Mark likely orgs for deactivation up front so they
  // don't win a dedupe tie-break over a real facility.
  const decisions = new Map<string, Decision>();
  for (const v of venues) {
    if (ALLOWLIST.has(v.external_id)) {
      decisions.set(v.id, { venue: v, active: true, reason: "allowlisted" });
      continue;
    }
    const drop = dropReason(v.name);
    decisions.set(
      v.id,
      drop
        ? { venue: v, active: false, reason: drop }
        : { venue: v, active: true, reason: "facility" }
    );
  }

  // Pass 2: dedupe among the still-active venues per address.
  const clusters = new Map<string, Venue[]>();
  for (const v of venues) {
    if (!decisions.get(v.id)!.active) continue; // already dropped as org
    const key = addressKey(v.address);
    if (!key) continue;
    clusters.set(key, (clusters.get(key) ?? []).concat(v));
  }
  for (const [, group] of clusters) {
    if (group.length < 2) continue;
    // Winner: strongest facility signal, then shortest name (usually the
    // cleanest "<Place> Dome" rather than a wordier variant).
    const sorted = [...group].sort((a, b) => {
      const fs = facilityScore(b.name) - facilityScore(a.name);
      if (fs !== 0) return fs;
      return a.name.length - b.name.length;
    });
    const winner = sorted[0]!;
    for (const loser of sorted.slice(1)) {
      decisions.set(loser.id, {
        venue: loser,
        active: false,
        reason: `dup of "${winner.name}"`,
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

  console.log(
    `\n[refine] plan: keep ${keptActive} active, deactivate ${toDeactivate.length}` +
      ` (${orgs.length} orgs, ${deny.length} retail/other, ${dups.length} dupes),` +
      ` reactivate ${toReactivate.length}`
  );
  console.log(`\n--- deactivating (${toDeactivate.length}) ---`);
  for (const d of toDeactivate) {
    console.log(`  ✗ ${d.venue.name}  [${d.reason}]  — ${d.venue.address ?? ""}`);
  }
  if (toReactivate.length) {
    console.log(`\n--- reactivating (${toReactivate.length}) ---`);
    for (const d of toReactivate) console.log(`  ✓ ${d.venue.name}`);
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
