/**
 * Scrape-run monitoring — the pure, unit-tested half of run.ts's
 * per-source summary + zero-rows guard (docs/scraping.md §4.5).
 *
 * Two failure modes this guards against:
 *   1. One adapter throwing shouldn't kill the rest of an `all` run —
 *      run.ts catches per-source and records `fetched: null` here.
 *   2. A source silently going empty (portal schema change) looks like a
 *      green run unless something compares today's count against history.
 */

export type SourceRunResult = {
  source: string;
  /** venues the adapter returned; null = adapter threw */
  fetched: number | null;
  venuesUpserted: number;
  fieldsUpserted: number;
  error?: string;
};

/** Sources must have at least this many pre-existing active venues before
 *  an empty fetch counts as a regression (brand-new/expected-empty sources
 *  — e.g. playtomic in the GTA today — never trip it). */
export const ZERO_GUARD_MIN = 5;

/** Count active venues per source prefix ("osm:way/1" -> "osm"). */
export function sourcePrefixCounts(externalIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of externalIds) {
    const i = id.indexOf(":");
    const prefix = i === -1 ? id : id.slice(0, i);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return counts;
}

/** Sources whose adapter returned [] while the DB already holds >= min
 *  active venues for that prefix. Adapter errors (fetched === null) are NOT
 *  zero-regressions — they're already surfaced as errors. */
export function zeroRegressions(
  results: SourceRunResult[],
  priorCounts: Map<string, number>,
  min: number = ZERO_GUARD_MIN
): SourceRunResult[] {
  return results.filter(
    (r) => r.fetched === 0 && (priorCounts.get(r.source) ?? 0) >= min
  );
}

/**
 * Sources whose adapter fetched rows but persisted none. upsertVenue warns
 * and continues per row (deliberate, one bad row shouldn't kill a source),
 * which means a SYSTEMIC write failure — missing column after a lagging
 * migration, an RLS change — would otherwise exit 0 looking healthy while
 * writing nothing.
 */
export function writeFailures(results: SourceRunResult[]): SourceRunResult[] {
  return results.filter(
    (r) => r.fetched !== null && r.fetched > 0 && r.venuesUpserted === 0
  );
}
