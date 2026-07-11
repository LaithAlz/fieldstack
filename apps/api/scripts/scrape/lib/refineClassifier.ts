/**
 * Pure classification logic for refine.ts (issue #497): decide whether a
 * scraped Google row names a bookable facility, a club/academy/league "org"
 * row that sits at a facility's address without being one itself, or a
 * hard-deny non-venue (retail, a different primary sport, a kids' party
 * venue). Also implements the facility-evidence override that stops a real
 * organization-run facility from being swept up by the org heuristic, and
 * the Pass-2 address-cluster dedupe protections (resolutions respect +
 * facility-evidence shield, see resolveAddressCluster at the bottom).
 *
 * No I/O here — refine.ts wires this to Supabase, operators.yaml, and
 * data/dedupe-resolutions.yaml.
 */

import type { Operator } from "./registry.js";
import { findOperator } from "./operatorMatcher.js";

// ---------------------------------------------------------------------------
// Name-only classification
// ---------------------------------------------------------------------------

// Facility names that are unambiguous even standing alone — no org ever
// legitimately uses these as its primary descriptor. These are the ONLY
// signals allowed to shield an ORG_SIGNAL match (see FACILITY_SIGNAL below
// for the full, weaker list): a name matching one of these always survives
// classification, even if it also says "academy" or "league".
export const STRONG_FACILITY_SIGNAL: RegExp[] = [
  /\bdome\b/i,
  /\bturf\b/i,
  /\bsports?\s?(complex|plex)\b/i,
  /\bsports?\s?(centre|center)\b/i,
  /\bfutsal\b/i,
  /\bfield\s?house\b/i,
  /\barena\b/i,
  /\bcomplex\b/i,
];

// Full signal list, ordered loosely by strength, used ONLY for dedupe
// tie-breaking among venues that already survived classification
// (facilityScore below) — includes the weak/generic "indoor" signal so a
// genuine "X Indoor Soccer Centre" still outranks a plain "X" in a tie.
//
// "indoor" must NEVER be used to shield an ORG_SIGNAL match: org names
// routinely contain it too — "Greater Toronto Indoor Soccer League" and
// "Downsview Indoor Soccer League" both read as facilities under a bare
// `\bindoor\b` test despite being leagues, not venues. That was the
// concrete classifier gap issue #497 opened on. Classification below uses
// isStrongFacility(), never facilityScore(), to decide org-shielding.
export const FACILITY_SIGNAL: RegExp[] = [...STRONG_FACILITY_SIGNAL, /\bindoor\b/i];

// Org/program tokens. A venue matching one of these, with no STRONG
// facility signal, is treated as a club/academy/team/league/program rather
// than a rentable place. "fc"/"sc" match as their own word, leading or
// trailing ("FC Barcelona Academy", "Toronto FC", "Barcelona SC") — see
// refineClassifier.test.ts for the "Soccer FC Arena" ambiguous case and how
// it's resolved (strong facility signal wins: kept active). Plurals matter:
// "Allstar Soccer Leagues" (a tenant league at 360 Soccer Centre per
// data/dedupe-resolutions.yaml) slipped through a singular-only \bleague\b.
export const ORG_SIGNAL =
  /\b(clubs?|academ\w*|training|camps?|develop\w*|schools?|youth|oldtimers|leagues?|associations?|f\.?c\.?|s\.?c\.?)\b/i;

// Hard deny: never a soccer venue you'd book by the hour, no matter what
// else the name says (these override facility signal AND skip the
// facility-evidence override below — a warehouse or a kids' playground
// isn't a deactivation "candidate" pending evidence, it's just wrong data).
// "playground" catches Kidsports Indoor Playground and similarly-shaped
// kids'-party venues that the wide Google Places net pulls in alongside
// real facilities (issue #497).
export const DENY_SIGNAL =
  /\b(supplies|warehouse|depot|equipment|retail|store|playground)\b|\bindoor golf\b|\b(baseball|softball)\b|\b(bubble soccer|archery|paintball|trampoline)\b/i;

/** Higher = stronger facility signal. 0 = no signal at all. Dedupe
 * tie-break only — do not use this to decide org-shielding, use
 * isStrongFacility() instead. */
export function facilityScore(name: string): number {
  for (let i = 0; i < FACILITY_SIGNAL.length; i++) {
    if (FACILITY_SIGNAL[i]!.test(name)) return FACILITY_SIGNAL.length - i;
  }
  return 0;
}

/** True when a name carries an unambiguous, standalone facility signal. */
export function isStrongFacility(name: string): boolean {
  return STRONG_FACILITY_SIGNAL.some((re) => re.test(name));
}

export type NameClass = "deny" | "org" | "facility";

/** Classify a name from its text alone (no field/hours/operator evidence). */
export function classifyName(name: string): NameClass {
  if (DENY_SIGNAL.test(name)) return "deny";
  if (!isStrongFacility(name) && ORG_SIGNAL.test(name)) return "org";
  return "facility";
}

// ---------------------------------------------------------------------------
// Facility-evidence override (issue #497, mandatory): an org-classified row
// is only a deactivation CANDIDATE. It survives if there's real evidence
// it's actually a bookable facility rather than a club registered at a
// host's address. DENY rows never reach this check — see classifyName.
// ---------------------------------------------------------------------------

export type EvidenceField = {
  price_per_hour: number | string | null;
  booking_url: string | null;
};

export type EvidenceInput = {
  name: string;
  /** venues.hours — jsonb, null or {} when unset. */
  hours: Record<string, unknown> | null;
  /** Only the venue's ACTIVE fields. */
  fields: EvidenceField[];
};

export type EvidenceResult = { fires: boolean; reason: string | null };

// A booking_url counts as evidence only when it points at an actual
// booking/reservation destination — a known booking-platform domain, or a
// path that reads as "go book a slot here" — not a plain marketing
// homepage. This is a deliberate reading of the issue #497 override
// ("a booking_url beyond an operator-inherited fallback"): for these
// Google-scraped org rows there is no operator to inherit a link FROM (no
// operators.yaml match reached this branch), so the literal "not
// inherited" test is vacuously true for almost every row — googlePlaces.ts
// fills a field's booking_url from the place's own scraped website
// (sources/googlePlaces.ts), and nearly every club/academy has a website.
// Treating any non-null booking_url as override evidence was checked
// empirically against a prod dry run and kept ~130 of ~150 org candidates
// active purely because they have a homepage, which defeats the pass. A
// homepage link is exactly what an operator-inherited fallback ALSO looks
// like (op.bookingUrl / op.website, see lib/platformLinks.ts) — so "beyond"
// it must mean a link that actually goes further than that: a real
// reservation/rental page or a recognized booking platform.
const BOOKING_INTENT_URL_RE =
  /catchcorner\.com|courtreserve\.com|amilia\.com|playtomic\.com|\/(book|booking|reserve|reservations?|rental|rentals|schedule|scheduling)(?:[/?#]|$)/i;

/**
 * Fires when an org row is NOT actually deactivation-safe. Three
 * independent triggers, checked in this order:
 *
 *   1. Name matches an operators.yaml entry (name or alias) — the row is a
 *      registry-known operator, so run.ts already trusts it enough to
 *      resolve booking info for it.
 *   2. venues.hours is populated — an org whose hours we've hand-verified
 *      is being treated as a real facility elsewhere in the pipeline
 *      (issue #492); refine must agree.
 *   3. Any active field carries a price_per_hour, OR a booking_url that
 *      looks like a genuine booking destination (see BOOKING_INTENT_URL_RE
 *      above) rather than a plain homepage.
 */
export function evaluateFacilityEvidence(
  input: EvidenceInput,
  operators: Operator[]
): EvidenceResult {
  const op = findOperator(input.name, operators);
  if (op) {
    return { fires: true, reason: `matches operators.yaml entry "${op.name}"` };
  }
  if (input.hours && Object.keys(input.hours).length > 0) {
    return { fires: true, reason: "venue carries hours" };
  }
  for (const f of input.fields) {
    const price =
      typeof f.price_per_hour === "string" ? Number(f.price_per_hour) : f.price_per_hour;
    if (price != null && !Number.isNaN(price)) {
      return { fires: true, reason: `active field has a price ($${price}/hr)` };
    }
    if (f.booking_url && BOOKING_INTENT_URL_RE.test(f.booking_url)) {
      return {
        fires: true,
        reason: `active field has a booking-intent URL (${f.booking_url})`,
      };
    }
  }
  return { fires: false, reason: null };
}

// ---------------------------------------------------------------------------
// Pass-2 protections: address-cluster dedupe with resolutions respect and a
// facility-evidence shield (issue #497 extension).
//
// refine.ts's Pass-2 keeps one venue per address cluster and deactivates the
// rest, tie-breaking on facilityScore then shortest name. That tie-break is
// blind to two things the rest of the pipeline knows:
//
//   1. Human dedupe adjudications (data/dedupe-resolutions.yaml). The
//      registry's "Scarborough Soccer Centre vs East Toronto Soccer" pair is
//      verdict DISTINCT (tenant club at a host facility, both real) — yet
//      the raw tie-break deactivated the Scarborough facility because
//      "East Toronto Soccer" is the shorter name ("Soccer Centre" matches
//      no FACILITY_SIGNAL, so both scored 0).
//   2. Facility evidence. "Soccer Centre Parking" (a parking-lot POI, no
//      evidence) beat "Brampton Soccer Centre" (operator match + verified
//      hours) on name length alone.
//
// resolveAddressCluster fixes both, in this order: a resolution verdict on
// the (current winner, candidate) pair is authoritative — DISTINCT means
// neither side may dedupe-deactivate the other, MERGE means the registry's
// keeper wins regardless of the tie-break. Only unresolved pairs fall
// through to the evidence shield: a side with facility evidence never loses
// to a side without any (the winner swaps instead), and a pair where BOTH
// sides carry evidence is skipped and surfaced as needs-human — two real
// facilities at one address belong in dedupe.ts's REVIEW flow, not in an
// address-string tie-break.
// ---------------------------------------------------------------------------

export type ClusterVenue = { id: string; external_id: string; name: string };

export type PairVerdict = { verdict: "merge" | "distinct"; keep?: string };

/**
 * Unordered pair lookup over the dedupe-resolutions registry: the YAML may
 * record (a, b) in either order, so both orders resolve to the same entry
 * (mirrors resolutionKey in lib/dedupe.ts, which is not exported).
 */
export function buildResolutionLookup(
  resolutions: Array<{ a: string; b: string; verdict: "merge" | "distinct"; keep?: string }>
): (aExternalId: string, bExternalId: string) => PairVerdict | null {
  const key = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  const byKey = new Map<string, PairVerdict>();
  for (const r of resolutions) {
    byKey.set(key(r.a, r.b), { verdict: r.verdict, keep: r.keep });
  }
  return (a, b) => byKey.get(key(a, b)) ?? null;
}

export type ClusterDecision<V extends ClusterVenue> =
  | { type: "deactivate"; venue: V; winner: V; reason: string }
  | { type: "needs-human"; a: V; b: V };

/**
 * Resolve one address cluster. Venues are considered in the original
 * tie-break order (facilityScore desc, then shortest name); each candidate
 * is judged against the current winner:
 *
 *   resolution DISTINCT — candidate stays active, no deactivation either way.
 *   resolution MERGE    — the registry keeper becomes the winner; the other
 *                         side is deactivated with a registry-citing reason.
 *   both have evidence  — needs-human, nobody deactivated.
 *   only candidate does — winner swaps; the old winner is deactivated.
 *   otherwise           — candidate is deactivated (original behavior).
 */
export function resolveAddressCluster<V extends ClusterVenue>(
  group: V[],
  resolutionFor: (aExternalId: string, bExternalId: string) => PairVerdict | null,
  hasEvidence: (venue: V) => boolean
): Array<ClusterDecision<V>> {
  const sorted = [...group].sort((a, b) => {
    const fs = facilityScore(b.name) - facilityScore(a.name);
    if (fs !== 0) return fs;
    return a.name.length - b.name.length;
  });
  const out: Array<ClusterDecision<V>> = [];
  let winner = sorted[0]!;
  for (const candidate of sorted.slice(1)) {
    const res = resolutionFor(winner.external_id, candidate.external_id);
    if (res?.verdict === "distinct") {
      // Human-adjudicated: both are real venues. Never dedupe-deactivate
      // either side of this pair.
      continue;
    }
    if (res?.verdict === "merge") {
      const keeper =
        res.keep === winner.external_id
          ? winner
          : res.keep === candidate.external_id
            ? candidate
            : null;
      if (keeper) {
        const loser = keeper === winner ? candidate : winner;
        out.push({
          type: "deactivate",
          venue: loser,
          winner: keeper,
          reason: `dup of "${keeper.name}" (per dedupe-resolutions.yaml)`,
        });
        winner = keeper;
        continue;
      }
      // keep matches neither side — loadResolutions validates against this,
      // so it can't happen with registry data; fall through to the shield.
    }
    const winnerHasEvidence = hasEvidence(winner);
    const candidateHasEvidence = hasEvidence(candidate);
    if (winnerHasEvidence && candidateHasEvidence) {
      out.push({ type: "needs-human", a: winner, b: candidate });
      continue;
    }
    if (candidateHasEvidence && !winnerHasEvidence) {
      out.push({
        type: "deactivate",
        venue: winner,
        winner: candidate,
        reason: `dup of "${candidate.name}"`,
      });
      winner = candidate;
      continue;
    }
    out.push({
      type: "deactivate",
      venue: candidate,
      winner,
      reason: `dup of "${winner.name}"`,
    });
  }
  return out;
}
