/**
 * Live adapter smoke for the scrape pipeline. Imports adapters directly and
 * runs them network-only: NO database writes, no env vars needed for the
 * municipal sources. Use after any change to an adapter, lib/arcgis.ts, or
 * the normalized ScrapedVenue shape, to prove the source still yields
 * plausible counts before trusting unit tests alone.
 *
 * Run (from anywhere; bun resolves imports relative to this file):
 *   bun /Users/laith/code/soccer/.claude/skills/onside-validation-and-qa/scripts/smoke-adapters.ts
 *
 * Flags:
 *   --playtomic   also run the Playtomic adapter (expected result: 0 venues,
 *                 and 0 is CORRECT; see the adapter header). Hits an
 *                 undocumented consumer API, so run sparingly.
 *
 * Deliberately excluded: google (paid quota, needs GOOGLE_PLACES_API_KEY),
 *   osm (Overpass is rate-limited and slow; be polite), manual (no network).
 *
 * Expected counts, live-verified 2026-07-05:
 *   mississauga: 140 venues / 237 fields
 *   toronto:     135 venues / 229 fields
 *   brampton:     91 venues / 195 fields
 * Municipal datasets drift slowly; within roughly 10 percent of these is
 * normal. A big drop means schema drift at the source: STOP and read the
 * raw response before merging anything.
 */
import { mississaugaAdapter } from "../../../../apps/api/scripts/scrape/sources/mississauga.js";
import { torontoAdapter } from "../../../../apps/api/scripts/scrape/sources/toronto.js";
import { bramptonAdapter } from "../../../../apps/api/scripts/scrape/sources/brampton.js";
import { playtomicAdapter } from "../../../../apps/api/scripts/scrape/sources/playtomic.js";
import type { ScrapeAdapter } from "../../../../apps/api/scripts/scrape/types.js";

const adapters: ScrapeAdapter[] = [
  mississaugaAdapter,
  torontoAdapter,
  bramptonAdapter,
];
if (process.argv.includes("--playtomic")) adapters.push(playtomicAdapter);

let failed = false;
for (const adapter of adapters) {
  const t0 = Date.now();
  try {
    const venues = await adapter.run();
    const fields = venues.reduce((n, v) => n + v.fields.length, 0);
    const noCoords = venues.filter((v) => v.lat == null || v.lng == null).length;
    console.log(
      `${adapter.source}: ${venues.length} venues / ${fields} fields` +
        (noCoords ? ` (${noCoords} without coords)` : "") +
        ` [${Date.now() - t0}ms]`
    );
  } catch (err) {
    failed = true;
    console.error(`${adapter.source}: FAILED after ${Date.now() - t0}ms:`, err);
  }
}
process.exit(failed ? 1 : 0);
