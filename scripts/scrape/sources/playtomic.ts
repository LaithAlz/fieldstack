/**
 * STUB — Playtomic discovery adapter. NOT IMPLEMENTED, NOT REGISTERED.
 *
 * This file is intentional scaffolding for the booking-platform connection
 * model described in docs/scraping.md §3.2. It is **not** wired into
 * run.ts's ADAPTERS map, makes **no** network calls, and throws if run. It
 * exists to (a) lock in the intended shape and (b) document the research
 * findings next to the code that will eventually use them.
 *
 * Do not register this in run.ts until the discovery flow below is actually
 * implemented and the ToS posture (see §4.4) has been confirmed.
 *
 * ── Research summary (docs/scraping.md §3.2) ──────────────────────────────
 *
 * Playtomic has two data surfaces:
 *
 *   1. Official Club API (third-party.playtomic.io, base
 *      https://api.playtomic.io/v1) — read-only, *club-scoped*. A club
 *      generates External API credentials in Playtomic Manager
 *      (Settings → Developer Tools). This is the path for a real
 *      partnership: it exposes the club's own resources/bookings, with
 *      rate limits (~1 call/min) and a 1-month change-notice clause.
 *      USE THIS for authorised, load-bearing data — behind a credential.
 *
 *   2. Internal/undocumented consumer API used by playtomic.io itself:
 *        - GET https://playtomic.io/api/v1/tenants
 *            ?coordinate=<lat>,<lng>&radius=<m>&sport_id=<SPORT>
 *            &with_properties=true&size=<n>
 *          → venue ("tenant") discovery by location.
 *        - GET https://api.playtomic.io/v1/availability
 *            ?tenant_id=<id>&sport_id=<SPORT>&start_min=<iso>&start_max=<iso>
 *          → slots/resources (≤25h window per request).
 *      This is NOT a published partner API. It powers their own app, is
 *      rate-limited, and can change/break without notice. Treat it as
 *      discovery-only + legally cautious: at most, find which GTA venues
 *      are on Playtomic so we can deep-link out. Do NOT build core booking
 *      on it.
 *
 * ── Intended flow when implemented (discovery tier only) ──────────────────
 *
 *   1. For each GTA search centre (city coordinates), query the `tenants`
 *      endpoint with sport_id = soccer/football, a sensible radius, and a
 *      conservative rate limit + User-Agent (mirror osm.ts's politeness).
 *   2. Map each tenant → ScrapedVenue:
 *        externalId  = `playtomic:<tenant_id>`
 *        bookingUrl  = the tenant's playtomic.com page (Tier-1 deep link)
 *        fields[].bookingPlatform = "playtomic"
 *        confidence  = platform-tier (high)
 *   3. Dedupe against existing venues (docs/scraping.md §4.3) so a venue
 *      already known from OSM/municipal doesn't double-insert.
 *
 * Live resources/prices/availability are deliberately OUT OF SCOPE here —
 * those come from the official Club API under a partnership (a separate,
 * credentialed adapter), per docs/scraping.md §3.3.
 */

import type { ScrapeAdapter, ScrapedVenue } from "../types.js";

/** Sport id for soccer/football on Playtomic. Confirm before use. */
// const SPORT_SOCCER = "SOCCER"; // TODO: verify exact value via a tenants probe.

/** GTA search centres for the `tenants` discovery sweep. TODO: tune list/radius. */
// const SEARCH_CENTRES: Array<{ name: string; lat: number; lng: number }> = [];

export const playtomicAdapter: ScrapeAdapter = {
  source: "playtomic",
  label: "Playtomic (STUB — not implemented)",
  async run(): Promise<ScrapedVenue[]> {
    // TODO(docs/scraping.md §3.2): implement the discovery flow above.
    // Until then, fail loudly so this can never be accidentally registered
    // and run as a no-op (which would look like "Playtomic has zero venues").
    throw new Error(
      "[playtomic] adapter is a stub — not implemented. See docs/scraping.md §3 " +
        "before wiring this into run.ts."
    );
  },
};
