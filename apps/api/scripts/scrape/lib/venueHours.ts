/**
 * Venue-hours precedence at upsert time (issue #492 option 1). Two
 * possible sources feed `venues.hours`:
 *
 *   - Adapter-supplied hours: a source that observed real operating hours
 *     itself (today only playtomic.ts, via its `opening_hours` mapping).
 *   - Operator-registry hours: hand-verified hours recorded in
 *     `data/operators.yaml`'s optional `hours:` block for a matched
 *     operator.
 *
 * The adapter's own hours always win when present — it is closer to the
 * source of truth for that specific venue than a hand-entered registry
 * default. Pure and unit-tested — no network/DB calls here.
 *
 * `run.ts` calls this on EVERY upsert (not a one-off backfill), because
 * `venues.hours` is written unconditionally on every run.
 */

export function resolveVenueHours(
  adapterHours: Record<string, string | null> | null | undefined,
  operatorHours: Record<string, string | null> | null | undefined
): Record<string, string | null> | null {
  return adapterHours ?? operatorHours ?? null;
}
