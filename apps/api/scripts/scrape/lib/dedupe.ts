import { parse } from "yaml";

/**
 * Cross-source dedup logic — the pure, unit-tested half of dedupe.ts.
 *
 * Different scrape sources (OSM, Google, manual YAML) produce separate rows
 * for the same physical venue; upserts are idempotent per-source (keyed on
 * external_id) but nothing reconciles ACROSS sources. This module finds
 * those collisions.
 *
 * Two tiers, deliberately asymmetric:
 *
 *   AUTO   — same place beyond reasonable doubt: pins within AUTO_RADIUS_M
 *            *and* near-identical normalized names (token Jaccard ≥
 *            AUTO_NAME_SIM). Safe to deactivate unattended in the weekly
 *            scrape job.
 *   REVIEW — probably related, but a human decides: pins within
 *            REVIEW_RADIUS_M with weaker name overlap, or an identical
 *            street-address key. Catches tenant-club-vs-facility pairs
 *            ("East Toronto Soccer" at the Scarborough Soccer Centre) and
 *            complex-vs-facility rows ("Ontario Soccer Centre Field 1" vs
 *            "The Soccer Centre") where auto-hiding could delete a real,
 *            distinct bookable. Printed, never applied.
 *
 * Same-name venues far apart (e.g. the two Soccer Glow Kingdom locations)
 * are NOT duplicates — every tier is distance-gated first.
 */

export type DedupeVenue = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  external_id: string;
  /** Active-field count — richer row wins ties. */
  field_count: number;
};

export type DuplicatePair = {
  keep: DedupeVenue;
  drop: DedupeVenue;
  distanceM: number;
  nameSimilarity: number;
  tier: "auto" | "review";
  reason: string;
};

export const AUTO_RADIUS_M = 200;
/** Generic names ("Senior Soccer Field") must be near-coincident to auto-merge. */
export const AUTO_RADIUS_GENERIC_M = 30;
export const AUTO_NAME_SIM = 0.85;
export const REVIEW_RADIUS_M = 100;
export const REVIEW_NAME_SIM = 0.3;

// A name made only of these tokens describes a *kind* of place, not a
// specific one — two parks two blocks apart both contain a "Soccer Pitch".
const GENERIC_TOKENS = new Set([
  "soccer", "football", "futsal", "field", "fields", "pitch", "pitches",
  "park", "turf", "senior", "junior", "mini", "north", "south", "east",
  "west", "upper", "lower", "1", "2", "3", "4", "a", "b",
]);

/** True when every normalized token is generic (no identifying word). */
export function isGenericName(name: string): boolean {
  const tokens = normalizeName(name);
  return tokens.length > 0 && tokens.every((t) => GENERIC_TOKENS.has(t));
}

// Tokens that carry no identity: legal suffixes and pure glue words.
// Deliberately NOT "centre/field/dome" etc. — those distinguish real
// facilities from each other ("Milton Sports Dome" vs "Milton Sports Centre").
const STOP_TOKENS = new Set(["the", "inc", "ltd", "llc", "co", "and", "at", "of"]);

/** Lowercase, strip punctuation/diacritics, drop stop tokens. */
export function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 0 && !STOP_TOKENS.has(t));
}

/** Token Jaccard similarity of two names, on normalized token sets. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a));
  const tb = new Set(normalizeName(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Street-address key: street number + street name, before the street-type
 * word and unit/city/postal noise. "45 Fairfax Crescent, Scarborough, ON"
 * and "45 Fairfax Cres, Toronto" collide — which is the point; the type
 * token is dropped precisely because sources abbreviate it inconsistently.
 * Coarse on purpose: it only fires alongside the ≤REVIEW_RADIUS_M distance
 * gate, so "45 Fairfax" in another city can't collide.
 */
export function addressKey(address: string | null): string | null {
  if (!address) return null;
  const first = address.split(",")[0] ?? "";
  const tokens = first
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2); // number + street name
  // No leading street number → too generic to be an identity signal
  // ("Main Street" alone would collide across cities).
  if (!/^\d+$/.test(tokens[0] ?? "")) return null;
  return tokens.length === 2 ? tokens.join(" ") : null;
}

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Manual entries are curated (highest trust). Playtomic outranks municipal/
// google/osm as operator-platform data; municipal open data (Mississauga,
// Toronto, Brampton) is authoritative for public-field identity, ranked
// above Google/OSM but below platform data (docs/scraping.md §4.3
// precedence); google rows carry richer detail (photos, hours) than OSM's
// bare pins.
const SOURCE_PRIORITY: Record<string, number> = {
  manual: 4,
  playtomic: 3,
  mississauga: 2,
  toronto: 2,
  brampton: 2,
  google: 1,
  osm: 0,
};

export function sourceOf(v: DedupeVenue): string {
  return v.external_id.split(":")[0] ?? "";
}

/** Deterministic winner: source trust, then richer row, then stable id order. */
export function pickWinner(a: DedupeVenue, b: DedupeVenue): [DedupeVenue, DedupeVenue] {
  const pa = SOURCE_PRIORITY[sourceOf(a)] ?? 0;
  const pb = SOURCE_PRIORITY[sourceOf(b)] ?? 0;
  if (pa !== pb) return pa > pb ? [a, b] : [b, a];
  if (a.field_count !== b.field_count)
    return a.field_count > b.field_count ? [a, b] : [b, a];
  return a.id < b.id ? [a, b] : [b, a];
}

/** All duplicate candidates among the given venues, auto tier first. */
export function findDuplicates(venues: DedupeVenue[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < venues.length; i++) {
    for (let j = i + 1; j < venues.length; j++) {
      const a = venues[i]!;
      const b = venues[j]!;
      if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) {
        continue;
      }
      // Two OSM rows are two distinct mapped features — a park's five pitches
      // are five ways sharing a name, NOT duplicates. Only cross-source pairs
      // (and google↔google business listings) can duplicate.
      if (sourceOf(a) === "osm" && sourceOf(b) === "osm") continue;

      const dist = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (dist > Math.max(AUTO_RADIUS_M, REVIEW_RADIUS_M)) continue;

      const sim = nameSimilarity(a.name, b.name);
      const [keep, drop] = pickWinner(a, b);

      // A generic name is only evidence when the pins nearly coincide;
      // google↔google pairs never auto-merge (distinct listings at one
      // address are usually facility-vs-tenant, a human call).
      const bothGoogle = sourceOf(a) === "google" && sourceOf(b) === "google";
      const autoRadius =
        isGenericName(a.name) || isGenericName(b.name)
          ? AUTO_RADIUS_GENERIC_M
          : AUTO_RADIUS_M;

      if (!bothGoogle && dist <= autoRadius && sim >= AUTO_NAME_SIM) {
        pairs.push({
          keep,
          drop,
          distanceM: dist,
          nameSimilarity: sim,
          tier: "auto",
          reason: `same name (sim ${sim.toFixed(2)}) within ${Math.round(dist)}m`,
        });
        continue;
      }

      const ka = addressKey(a.address);
      const kb = addressKey(b.address);
      const sameAddress = ka !== null && ka === kb;
      if (dist <= REVIEW_RADIUS_M && (sim >= REVIEW_NAME_SIM || sameAddress)) {
        pairs.push({
          keep,
          drop,
          distanceM: dist,
          nameSimilarity: sim,
          tier: "review",
          reason: sameAddress
            ? `same street address ("${ka}") within ${Math.round(dist)}m`
            : `related name (sim ${sim.toFixed(2)}) within ${Math.round(dist)}m`,
        });
      }
    }
  }

  return pairs.sort((p, q) =>
    p.tier === q.tier ? p.distanceM - q.distanceM : p.tier === "auto" ? -1 : 1
  );
}

/**
 * Dedupe resolutions registry (issue #495) — a human verdict on one REVIEW
 * (or AUTO) pair, so it doesn't have to be re-adjudicated every time the
 * weekly scrape's dedupe pass finds it again. Source of truth:
 * data/dedupe-resolutions.yaml, one entry per pair, matched by `external_id`
 * pair (unordered — see `resolutionKey` below).
 */

export type ResolutionVerdict = "merge" | "distinct";

export type DedupeResolution = {
  /** external_id of one venue in the pair. */
  a: string;
  /** external_id of the other venue in the pair. */
  b: string;
  verdict: ResolutionVerdict;
  /** Required for verdict "merge"; must equal `a` or `b`. The other side is deactivated. */
  keep?: string;
  reason: string;
  /** YYYY-MM-DD */
  decided: string;
};

const DECIDED_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireNonEmptyString(value: unknown, field: string, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`dedupe-resolutions.yaml: ${context} missing "${field}"`);
  }
  return value;
}

function validateResolutionEntry(entry: unknown, index: number): DedupeResolution {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new Error(`dedupe-resolutions.yaml: entry ${index} is not a mapping`);
  }
  const e = entry as Record<string, unknown>;
  const context = `entry ${index}`;
  const a = requireNonEmptyString(e.a, "a", context);
  const b = requireNonEmptyString(e.b, "b", context);
  const pairContext = `entry ${index} (${a} / ${b})`;

  if (e.verdict !== "merge" && e.verdict !== "distinct") {
    throw new Error(
      `dedupe-resolutions.yaml: ${pairContext} has invalid "verdict" (${JSON.stringify(e.verdict)}); expected "merge" or "distinct"`
    );
  }
  const reason = requireNonEmptyString(e.reason, "reason", pairContext);
  const decided = requireNonEmptyString(e.decided, "decided", pairContext);
  if (!DECIDED_DATE_RE.test(decided)) {
    throw new Error(`dedupe-resolutions.yaml: ${pairContext} has invalid "decided" (expected YYYY-MM-DD, got ${JSON.stringify(decided)})`);
  }

  if (e.verdict === "distinct") {
    if (e.keep !== undefined) {
      throw new Error(`dedupe-resolutions.yaml: ${pairContext} has verdict "distinct" but also sets "keep" (only "merge" may set it)`);
    }
    return { a, b, verdict: "distinct", reason, decided };
  }

  // verdict === "merge"
  const keep = requireNonEmptyString(e.keep, "keep", pairContext);
  if (keep !== a && keep !== b) {
    throw new Error(`dedupe-resolutions.yaml: ${pairContext} has "keep" (${keep}) that matches neither "a" nor "b"`);
  }
  return { a, b, verdict: "merge", keep, reason, decided };
}

/**
 * Parses and validates the resolutions registry YAML. Throws on any
 * malformed entry (better to fail the whole run loudly than silently skip a
 * broken resolution) — mirrors the "throw on parse errors" convention in
 * lib/registry.ts.
 */
export function loadResolutions(raw: string): DedupeResolution[] {
  const parsed = parse(raw) as { resolutions?: unknown } | null | undefined;
  if (!parsed || !Array.isArray(parsed.resolutions)) {
    throw new Error("dedupe-resolutions.yaml: expected top-level `resolutions:` list");
  }
  return parsed.resolutions.map((entry, i) => validateResolutionEntry(entry, i));
}

/** Unordered pair key so a/b can be recorded in either order in the YAML. */
function resolutionKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

export type ResolutionPartition = {
  /** Found pairs resolved "distinct" — kept active, no longer printed as REVIEW. */
  suppressed: DuplicatePair[];
  /** Found pairs resolved "merge" — keeper forced from the resolution, even if pickWinner disagrees. */
  promoted: Array<{
    pair: DuplicatePair;
    keep: DedupeVenue;
    drop: DedupeVenue;
    resolution: DedupeResolution;
  }>;
  /** Found pairs with no matching resolution — unchanged runner behavior (AUTO applies, REVIEW just prints). */
  unresolved: DuplicatePair[];
  /** Resolutions that matched no pair in the current `pairs` list. */
  staleResolutions: DedupeResolution[];
};

/**
 * Partitions `pairs` (the output of `findDuplicates`) against the
 * resolutions registry. A resolution matches a pair when its `a`/`b`
 * external_ids equal the pair's keep/drop external_ids, in either order.
 *
 * AUTO-tier pairs pass through here too: one with no resolution lands in
 * `unresolved` exactly like today (the runner still applies AUTO pairs
 * regardless of resolution status), but a human can also mark an AUTO pair
 * "distinct" to override a wrong auto-merge.
 */
export function applyResolutions(
  pairs: DuplicatePair[],
  resolutions: DedupeResolution[]
): ResolutionPartition {
  const suppressed: DuplicatePair[] = [];
  const promoted: ResolutionPartition["promoted"] = [];
  const unresolved: DuplicatePair[] = [];
  const matched = new Set<number>();

  const byKey = new Map<string, number>();
  resolutions.forEach((r, i) => {
    byKey.set(resolutionKey(r.a, r.b), i);
  });

  for (const pair of pairs) {
    const idx = byKey.get(resolutionKey(pair.keep.external_id, pair.drop.external_id));
    if (idx === undefined) {
      unresolved.push(pair);
      continue;
    }
    matched.add(idx);
    const resolution = resolutions[idx]!;
    if (resolution.verdict === "distinct") {
      suppressed.push(pair);
      continue;
    }
    const keep = resolution.keep === pair.keep.external_id ? pair.keep : pair.drop;
    const drop = keep === pair.keep ? pair.drop : pair.keep;
    promoted.push({ pair, keep, drop, resolution });
  }

  const staleResolutions = resolutions.filter((_, i) => !matched.has(i));

  return { suppressed, promoted, unresolved, staleResolutions };
}
