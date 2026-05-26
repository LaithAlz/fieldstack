/**
 * Matches a scraped venue name against the operator registry. The
 * scraper uses this to figure out which operator a venue belongs to
 * so we can set venues.operator_id correctly + inherit the operator's
 * booking URL when the venue itself doesn't carry one.
 *
 * Matching is case-insensitive substring: an operator matches if its
 * name OR any of its aliases is a substring of the venue name (or
 * vice-versa). Substring covers the common patterns:
 *   - "Hershey 1" matches the alias "Hershey 1"
 *   - "Hershey Centre - Pad B" matches the alias "Hershey Centre"
 *   - Exact-name matches always win
 *
 * If multiple operators match, the one with the longest matched
 * substring wins (most specific). Ties broken alphabetically for
 * determinism.
 */

import type { Operator } from "./registry.js";

export function findOperator(
  venueName: string,
  operators: Operator[]
): Operator | null {
  const haystack = venueName.toLowerCase();
  let best: { operator: Operator; matchLength: number } | null = null;

  for (const op of operators) {
    const needles = [op.name, ...op.aliases].map((s) => s.toLowerCase());
    for (const needle of needles) {
      // Need at least 5 chars in the needle. Shorter than that and
      // generic words ("park", "field", "the") would false-positive
      // against every venue.
      if (needle.length < 5) continue;
      // ONLY allow operator-name (or alias) appearing inside the venue
      // name. The reverse direction caused false positives: a venue
      // named literally "Soccer" was matching the alias "Milliken Mills
      // Soccer Dome" because the alias contains "Soccer". Operators are
      // always more specific than venues, so the substring should run
      // one way only.
      if (!haystack.includes(needle)) continue;
      // Longest matched alias = most specific. "Hershey Centre" beats
      // "Hershey" if both are aliases of different operators.
      if (!best || needle.length > best.matchLength) {
        best = { operator: op, matchLength: needle.length };
      } else if (
        needle.length === best.matchLength &&
        op.name < best.operator.name
      ) {
        best = { operator: op, matchLength: needle.length };
      }
    }
  }

  return best?.operator ?? null;
}
