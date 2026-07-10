---
name: onside-research-frontier
description: The open-problem map toward Onside's beyond-state-of-the-art goal (a live, complete, honest GTA-wide soccer field map with NO operator partnerships, plus category-defining UI). Load when asked "what should we work on next", "what is the research direction", "how do we get real open-now hours", "can we infer availability without partnerships", "how do we prove the every-field claim", "are there duplicate venues at scale", "what would category-defining UI look like", "how do we launch city number two", "what is the operator pitch", or when planning any work on hours truth, availability inference, coverage recall, dedupe quality, map clustering past 50 pins, the tonight answer, multi-city expansion, or the booking-demand flywheel. Each problem states why current products fail, Onside's specific asset, the first three concrete steps in this repo, and a falsifiable milestone.
---

# Onside research frontier

Repo: `/Users/laith/code/soccer`. This skill is the map of OPEN problems, the gap
between what is shipped and the owner's stated ambition: a live, complete, honest
metro-wide field map, including free public parks, built WITHOUT operator
partnerships (inference from scraped signals instead), plus a category-defining
UI (the "Matchday" design system is the visual language for it). Everything here
is unshipped by definition. Facts about the CURRENT system are verified against
the repo as of 2026-07-06 and date-stamped where they can drift; claims about
what competitors do are beliefs with a date, not proven facts.

Vocabulary used throughout:

| Term | Meaning here |
|---|---|
| Recall | Fraction of real-world fields that exist as active venues in our DB |
| Projection | The column subset a SQL function returns to clients |
| RPC | Postgres function called via Supabase (`search_fields`, `venues_within`) |
| Fabric | React Native's new architecture; source of hard map-marker constraints |
| RLS | Row-level security, Postgres per-row access policies |
| Flag | PostHog feature flag; the app has infra for these in `featureFlags.ts` |
| ODbL | OpenStreetMap's license; OSM-derived data is storable with attribution |

## When NOT to use this skill

- How to run a hunch to an accepted result (pre-registration, evidence bars): `onside-research-methodology`. Every milestone below is executed under that discipline.
- Statistical and probing recipes (threshold tuning, API probing, cost math): `onside-proof-and-analysis-toolkit`.
- Measuring the system as it is today (venue counts, API probes): `onside-diagnostics-and-tooling`.
- What may be claimed publicly and license obligations: `onside-external-positioning`.
- Geo dedup math, GIS source theory, platform landscape: `venue-data-reference`.
- How changes get classified and gated: `onside-change-control`. Frontier work gets NO exemption: one PR per issue, CI green, merge commits, scraping non-negotiables intact.
- Incident history behind constraints cited here: `onside-failure-archaeology`.

## How each problem is written

Each problem has: WHY SOTA FAILS (dated belief), ONSIDE'S ASSET (verified in
repo), FIRST THREE STEPS (concrete, in this repo), and RESULT WHEN (a
falsifiable milestone; if you cannot imagine the measurement failing, it is not
a milestone). Numeric targets marked "pre-register" must be fixed BEFORE
measuring, per `onside-research-methodology`.

## Leverage ranking and dependencies

Ranking is a judgment call (2026-07-06), ordered by user-visible truth gained
per unit of work, respecting dependencies:

| Rank | Problem | Depends on | Why this rank |
|---|---|---|---|
| 1 | P1 Hours / open-now truth | nothing; issue #475 already open | Days of work, visible honesty win, unblocks P5b and patterns for P2 |
| 2 | P4 Canonical venue resolution | nothing | Guards the dataset every other problem measures against |
| 3 | P3 Coverage completeness proof | P4 | The core public claim ("Every field in the GTA") is currently unproven |
| 4 | P5 Category-defining UI | P1 for the tonight answer (P5b) | Owner explicitly named UI; retention lever |
| 5 | P7 Booking-demand flywheel | nothing to START logging; operator loop to finish | Demand data accretes only while collection runs; start early even if the pitch comes later |
| 6 | P2 Availability inference | P7 (data volume), P1 (hours bound the feasible window) | Highest novelty, but starved without demand signals |
| 7 | P6 Multi-city replication | P3 (methodology must exist first) | Replicating unproven coverage just spreads the unproven claim |

## P1: Hours and open-now truth

WHY SOTA FAILS (belief, 2026-07-06): general map products carry business hours,
not field hours; public park fields typically have no listed hours anywhere;
booking platforms only know hours for their own partner venues. Nobody renders
a trustworthy "open now" for park fields. Onside currently does not either.

CURRENT STATE (verified 2026-07-06):
- `venues.hours` jsonb exists (migration 010; shape `{mon..sun: "HH:mm-HH:mm" | null}`), but only the playtomic adapter emits hours (`apps/api/scripts/scrape/sources/playtomic.ts:180`) and playtomic measures ZERO GTA tenants, so the column is expected to be null nearly everywhere. Confirm with the db spot check in `onside-diagnostics-and-tooling`.
- The search projection excludes `hours` (migration `020_search_fields_pagination.sql`, jsonb build around lines 87-95: only id, name, lat, lng, address, photos, venue_type). So the Explore "Open now" chip evaluates `isOpenNow(undefined, now)` (`fieldstack-app/src/screens/main/ExploreScreen.tsx:306`, also `ExploreCard.tsx:78`), which falls back to a 06:00 to 23:00 default window (`fieldstack-app/src/lib/venueHours.ts`, `DEFAULT_OPEN_MINUTES`/`DEFAULT_CLOSE_MINUTES`). Today the chip returns the same answer for every venue at a given time.
- Issue #475 (OPEN as of 2026-07-06) is the tracked pathway: add hours to the search RPC, API mapping, and the app's `SearchResult` type.
- Google Places hours are the best source for private venues but are display-time only: the no-durable-storage rule in `docs/scraping.md` (Places content may not be stored; only the Place ID may) is a NON-NEGOTIABLE. Durable hours must come from ODbL/municipal/operator/manual sources.
- The OSM Overpass query already returns tags (`out center tags;`, `apps/api/scripts/scrape/sources/osm.ts:41`) so `opening_hours` tags arrive today but are not mapped.
- TRAP: the venue upsert writes `hours: v.hours ?? null` unconditionally (`apps/api/scripts/scrape/run.ts`, venue upsert block near line 397). Any hours you backfill directly into `venues.hours` will be clobbered to null on the next weekly scrape by the venue's owning adapter, unless the write is made conditional the way `google_place_id` already is (spread only when provided).

FIRST THREE STEPS:
1. Ship issue #475. New migration (026+) replacing `search_fields` to add `hours` to the venue projection; per the migration-019 lesson, `drop function if exists` before `create` when a return type changes, and expect the Migrations CI workflow to replay everything from scratch. Then thread it through `apps/api/src/lib/queries/search.ts` (`SearchVenue` type) and `fieldstack-app/src/types/api.ts` (`SearchResult.venue`), and pass `venue.hours` at the two `isOpenNow(undefined, ...)` call sites.
2. Make hours writes non-clobbering: in `run.ts`, spread hours conditionally (`...(v.hours !== undefined ? { hours: v.hours } : {})`) so hours survive re-scrapes from adapters that do not know them. `ScrapedVenue.hours` is already `Record<string,string|null> | null | undefined` (`scripts/scrape/types.ts:58`), which supports the distinction between "unknown" and "explicitly clear".
3. Add a storable hours source: map OSM `opening_hours` tags in `osm.ts` for the simple syntax subset (e.g. `Mo-Su 06:00-23:00`), discarding anything complex rather than guessing; and investigate whether the three municipal GIS layers or city bylaws publish park-field hours (UNVERIFIED whether they do; treat as an open question, not an assumption).

RESULT WHEN: with hours in the projection, at a chosen evening hour the Open-now
filter excludes at least one venue that the default window would include, for a
pre-registered share of hours-bearing venues, AND 10 out of 10 random spot
checks (operator website or posted signage) agree with our open/closed verdict.
Falsified if spot checks contradict the stored hours.

## P2: Availability inference without partnerships

WHY SOTA FAILS (belief, 2026-07-06): booking platforms know availability only
for credentialed partner inventory; `docs/scraping.md` §3.3 records that live
availability on Playtomic/CourtReserve/Amilia requires operator credentials.
Aggregators without partnerships show static pages. The beyond-SOTA move is
statistical: predict "likely busy" / "likely free" per venue and hour-of-week
from demand signals we already collect, without reading anyone's calendar.

ONSIDE'S ASSET (verified 2026-07-06):
- `booking_requests` (migration 025): `requested_date`, `start_time` (HH:mm), `duration_hours`, status lifecycle pending/confirmed/cancelled/declined. A first-party demand ledger, gated behind the `in_app_booking` flag (default OFF).
- `user_booking_history` (migration 004): `attempted_at` timestamptz plus date, start_time, duration per redirect with a chosen slot.
- PostHog events `booking_cta_tapped` and `booking_redirect_confirmed` (`fieldstack-app/src/lib/analytics.ts`), plus the site's `venue_book_click` Vercel event with venue and city props (`site/components/book-button.tsx:29`).
- `venue_reviews.body` free text (migration 005): mentions like "always packed" are weak but parseable occupancy signals.
- P1 hours bound the feasible window (a field cannot be busy while closed).

HONEST STATUS: today's signal volume is small (one metro, flag off, single-digit
weeks of events). This is a data-accretion problem before it is a modeling
problem. Do not model before the panel and baseline are pre-registered.

FIRST THREE STEPS:
1. Build the demand baseline: a PostHog HogQL insight (or export) of `booking_cta_tapped` and `booking_redirect_confirmed` counts by venue and hour-of-week. This works today, no flag needed.
2. Write a read-only script (pattern: the diagnostics skill's `db-spot-check.ts`) joining `booking_requests` and `user_booking_history` into a venue x hour-of-week demand matrix. Needs the service-role key since those tables are RLS-protected per user.
3. Design the ground-truth harness: pick a small venue panel whose public booking pages show slot availability without login, and record predicted-busy vs observed-booked per slot. GATE: any reading of operator pages must pass the robots/ToS check required by `docs/scraping.md` §4.4 BEFORE the first fetch; if a platform disallows it, that venue leaves the panel.

RESULT WHEN: on a pre-registered venue panel and horizon, the predicted-busy
classifier's contradiction rate against observed ground truth beats the naive
"always free" baseline by a pre-registered margin. Falsified if it cannot beat
naive, which is a real possibility at current signal volume; that outcome is a
result too (it sets the data-volume bar for retry).

## P3: Coverage completeness proof

WHY SOTA FAILS (belief, 2026-07-06): partner-list products (CatchCorner et al.)
claim nothing about totality; no metro field map publishes a recall methodology.
Onside's homepage claims "Every field in the GTA" (site H1) and that claim is
currently UNPROVEN. `onside-external-positioning` owns what may be said; this
problem owns making the claim true and measurable.

ONSIDE'S ASSET (verified 2026-07-06): three live municipal adapters against the
cities' own inventories (Toronto GIS layer with `ASSET_TYPE='Soccer Field'`,
Mississauga ArcGIS GeoJSON, Brampton ParkFeatures `SOCCER FIELD`), registered in
`apps/api/scripts/scrape/run.ts` (`ADAPTERS`). Municipal data is ground truth
for public park fields in those three cities. Honest framing: recall against a
source we ingest is high by construction; the proof value is in (a) catching
silent losses (dedupe/refine deactivations, grouping bugs like the Toronto
ROLLUP_TO split, PR #469) and (b) bounding the cities and venue classes with NO
registry: seven of the ten `cities.yaml` cities (Hamilton, Burlington, Oakville,
Milton, Vaughan, Markham, Richmond Hill) have no municipal adapter, and private
indoor venues have no registry anywhere.

FIRST THREE STEPS:
1. Write a recall script under `apps/api/scripts/` : re-fetch each municipal source's feature list, group with the same park-key logic as the adapter, and report the fraction that maps to an active Onside venue by `external_id` prefix, per city. Anon key suffices (active venues are public-read).
2. For the seven no-registry cities: sampled audit. Pull K random OSM `leisure=pitch` + `sport=soccer` features per city via Overpass (politeness rules from `docs/scraping.md` apply) and hand-verify presence in the app; compute recall with a confidence interval (method: `onside-proof-and-analysis-toolkit`).
3. Draft the public methodology page for the site, but ship it ONLY after `onside-external-positioning` review; a published number must be reproducible by re-running the scripts.

RESULT WHEN: per-city recall of at least 95% against each city's own inventory
(pre-register the exact denominator rules: open-status filters, grouping),
published with a reproducible method. Falsified if any measured city is below
target, or if two runs of the method disagree materially.

DEPENDS ON P4: duplicates corrupt both numerator and denominator.

## P4: Canonical venue resolution at scale

WHY SOTA FAILS (belief, 2026-07-06): web-scale players use ML entity resolution
with human raters; small teams hand-curate and drift. Onside's asset is a
two-tier deterministic design that is already automated weekly: AUTO tier
(distance <= 200m, or 30m for all-generic names, plus name similarity >= 0.85)
soft-deletes losers with `duplicate_of` audit trail; REVIEW tier (distance <=
100m plus weak name overlap or identical street-address key) is printed for a
human. Constants in `apps/api/scripts/scrape/lib/dedupe.ts:47-52`; winner
precedence `SOURCE_PRIORITY` (manual > playtomic > municipal > google > osm).
Everything is reversible (`is_active:false`, never deleted).

OPEN GAPS (verified 2026-07-06): REVIEW pairs go only to CI logs, nothing
persists or tracks adjudication; dedupe precision/recall has never been
measured; the runner scans at most 2000 active venues (`scripts/scrape/dedupe.ts`,
`.limit(2000)`) which will silently truncate at scale; the Toronto ROLLUP_TO
incident proved a whole miss class (same park, name suffix variants, 17 to 116m
apart) evades BOTH tiers; "zero visible duplicates" has never been audited.

FIRST THREE STEPS:
1. Adjudication loop: run from `apps/api/` : `bun scripts/scrape/dedupe.ts` (dry run), hand-judge every printed REVIEW pair, record verdicts as fixtures, and convert them into regression cases in `apps/api/tests/dedupe.test.ts` so threshold changes are tested against human judgments.
2. Visible-duplicate audit probe: for each of the 10 cities, fetch the top 50 venues by proximity from the public API (50 = the map's `MAX_MARKERS` pool, so "top 50" is literally what users see) and flag pairs that are near-threshold on distance/name-sim; hand-verify flags. Extend the diagnostics skill's probes rather than duplicating them.
3. Attack the known miss class: add ROLLUP_TO-style suffix-variant cases to the dedupe tests, and grep the other municipal sources for analogous naming conventions before they bite.

RESULT WHEN: the top-50 proximity query for every city shows zero
human-confirmed duplicate pairs in an audited pass, AND measured AUTO precision
on the adjudicated fixture set is 100% (no false merges; false merges are the
one non-reversible-in-practice harm since users see merged data immediately).
Falsified by any confirmed visible duplicate or any fixture false-merge.

## P5: Category-defining UI

The owner named UI explicitly as half the ambition. Three candidates, in
decreasing verifiability. All ship behind a flag with a pre-registered retention
metric; the flag infra exists (`fieldstack-app/src/lib/featureFlags.ts`; adding
a flag = extend the `FlagName` union and `POSTHOG_FLAG_KEYS`, no redeploy needed
to flip). PostHog dashboards for retention are specified in `docs/analytics.md`.

(a) THE COVERAGE-PROVING MAP. Today the map renders at most 50 markers
(`MAX_MARKERS = 50`, `fieldstack-app/src/screens/main/ExploreScreen.tsx:68`)
with a "Showing 50 of N venues" banner. Clustering was shipped once and removed
(PR #145, commit `c8a5a55`), before the Fabric marker-pool constraints were
discovered. The open problem: render ALL venues (hundreds) without violating
the hard-won marker-pool invariants homed in `onside-architecture-contract`
section 10. A compatible shape: compute clusters in
JS (e.g. supercluster) and render cluster glyphs INTO the same fixed pool;
`VenuePin` already has a `count` mode. First steps: spike behind a dev flag,
measure frame time and crash-freedom on device, then A/B the banner away.
(b) THE TONIGHT INSTANT ANSWER. One tap answering "where can I play tonight?":
open at 19:00+ (needs P1), bookable or free, near me, ranked. Assets: the
preferred-slot picker (`{date,startTime,duration}`), the Open-now chip, the
reserved amber open-now signal token, and `venuePriceSummary`. Blocked on P1 for
honesty; shipping it on the default-window fallback would be fake truth.
(c) THE PITCH BOOK. UNBUILT CANDIDATE, no repo trace as of 2026-07-06: a
sticker-album mechanic where each venue you play becomes a collectible card
(the Matchday language fits: foil treatment like the FREE badge, Barlow
Condensed scoreboard numerals). Retention hypothesis, unvalidated. Run it
through the brainstorm gate before any code.

RESULT WHEN (any candidate): flag-on cohort shows a pre-registered D1 or D7
retention delta over flag-off in PostHog. Falsified by no delta; kill or
iterate, do not ship by default without the delta.

## P6: Multi-city replication

WHY SOTA FAILS (belief, 2026-07-06): booking platforms expand via sales teams,
city by city; a config-driven scrape stack can expand for the cost of an
adapter. Asset: `apps/api/scripts/scrape/data/cities.yaml` (10 GTA cities, each
with `osm_relation_id` + coords) drives osm/google/playtomic generically;
municipal adapters are per-city by nature.

HONEST GAP LIST: metro assumptions that are CODE today, not config (verified
2026-07-06):
- `site/lib/venues.ts:49-70`: hard-coded GTA place-name list for city extraction, fallback "Greater Toronto Area".
- `fieldstack-app/src/lib/location.ts:12-15`: `DEFAULT_COORDS` = downtown Toronto.
- `fieldstack-app/src/hooks/useFieldSearch.tsx:41-44`: `DEFAULT_RADIUS_KM = 75`, comment names GTA cities.
- Copy: site H1 "Every field in the GTA", layout title, App Store listing.

FIRST THREE STEPS:
1. Pick metro #2 by open-data quality, not market size: inventory candidate cities' ArcGIS/CKAN soccer-field layers (availability UNVERIFIED for any specific city; check before promising) and confirm license terms per city.
2. Extract the GTA-isms above into per-metro config (one issue per extraction, per change control), so the app/site can host two metros without forks.
3. Add metro #2 to `cities.yaml` (OSM relation id + centre) and run the generic sources; write the municipal adapter in the established pattern (grouped park venues, explicit license note in the file header).

RESULT WHEN: metro #2 is live in app and site with changes confined to (a) new
adapter files, (b) config/data additions, (c) copy. Falsified if any shared
logic needed forking; each fork found is itself a P6 work item.

DEPENDS ON P3: replicate the coverage proof, not just the scrape.

## P7: Booking-demand flywheel

WHY SOTA FAILS (belief, 2026-07-06): operators join platforms that bring
bookings; a neutral discovery product has no transactional pitch. The
beyond-SOTA angle: the demand ledger IS the pitch. Show an operator their own
measured, timestamped demand (requests they never saw), then let them claim it.

ASSET (verified 2026-07-06): `booking_requests` was designed for this: RLS
reserves `confirmed`/`declined` transitions for "the operator-side surface, not
shipped yet" (migration 025 comment near line 77). Outbound demand already
flows with no flag: `booking_redirect_confirmed` (app) and `venue_book_click`
(site). 21 operators exist in `operators.yaml` (as of 2026-07-06), all
`integration_type: none`.

HONEST GAPS: there is NO operator-facing anything: no operator auth, no
notification when a request lands, requests dead-end in `pending` (the user
sees "Pending" in Profile forever). Turning the flag on without an answering
loop damages user trust; the loop can start as manual email relay, but that is
a business decision for the owner, not a session.

FIRST THREE STEPS:
1. Build the demand report generator: per-venue and per-operator monthly outbound clicks (PostHog export) plus requests (service-role query of `booking_requests`), rendered as a one-page operator pitch. Read-only, no product change.
2. Define the pilot request-answering loop and get owner sign-off: who relays a pending request to the operator, on what SLA, and what flips status to confirmed. Only then enable `in_app_booking` for a pilot cohort via the PostHog flag (no redeploy; `resolveFlag` reads the live value).
3. Instrument the funnel end to end (request submitted, relayed, answered, hours-to-answer) so the operator pitch contains conversion numbers, not just volume.

RESULT WHEN: the first operator agreement (a claimed listing, a credentialed
integration, or a confirmed-request commitment) is sourced from a demand
report. Intermediate falsifiable checkpoint: a pre-registered sustained
request volume per month for the pilot cohort; if volume never materializes,
the flywheel premise is falsified at current traffic and the problem returns
to P5 (retention) first.

## Rules that bind all frontier work

1. `docs/scraping.md` non-negotiables are NOT research variables: no durable Google Places content (Place ID only), ODbL attribution stays, robots/ToS check before any new HTML source, polite rate limits and honest User-Agent, no load-bearing use of the undocumented Playtomic API.
2. Change control applies: one issue, one branch, one PR (`Closes #N`), CI green, merge commit. Research spikes still land behind flags or in scripts, not as default behavior.
3. Milestones are pre-registered before measuring (`onside-research-methodology`); numbers published anywhere outside the repo go through `onside-external-positioning` first.
4. New thresholds or panels get the derivation treatment (`onside-proof-and-analysis-toolkit`), the way the dedupe constants were derived and fixture-tested.

## Provenance and maintenance

All repo facts verified 2026-07-06 at the then-current main. One-line
re-verification per volatile fact (run from `/Users/laith/code/soccer`):

| Fact | Re-verify with |
|---|---|
| Issue #475 open (P1 pathway) | `gh issue view 475` |
| Open-now uses no per-venue hours | `grep -n "isOpenNow(undefined" fieldstack-app/src/screens/main/ExploreScreen.tsx fieldstack-app/src/components/ExploreCard.tsx` |
| Default window 06:00 to 23:00 | `grep -n "DEFAULT_OPEN_MINUTES\|DEFAULT_CLOSE_MINUTES" fieldstack-app/src/lib/venueHours.ts` |
| Search projection excludes hours | `grep -n "'venue', jsonb_build_object" -A 10 supabase/migrations/020_search_fields_pagination.sql` (or any later `search_fields` migration) |
| Hours clobber trap in upsert | `grep -n "hours: v.hours" apps/api/scripts/scrape/run.ts` |
| OSM query fetches tags | `grep -n "out center tags" apps/api/scripts/scrape/sources/osm.ts` |
| Playtomic is the only hours-emitting adapter | `grep -rn "hours" apps/api/scripts/scrape/sources/*.ts` |
| Dedupe thresholds | `sed -n '45,55p' apps/api/scripts/scrape/lib/dedupe.ts` |
| Dedupe scan cap 2000 | `grep -n "limit(2000)" apps/api/scripts/scrape/dedupe.ts` |
| Marker pool cap 50 | `grep -n "MAX_MARKERS" fieldstack-app/src/screens/main/ExploreScreen.tsx` |
| Clustering removed in PR #145 | `git log --oneline -i --grep=cluster` |
| 10 cities in registry | `grep -c "^  - name:" apps/api/scripts/scrape/data/cities.yaml` |
| 21 operators, none integrated | `grep -c "^  - name:" apps/api/scripts/scrape/data/operators.yaml && grep -c "integration_type" apps/api/scripts/scrape/data/operators.yaml` |
| booking_requests schema (incl. `duration_hours`) + operator-side reservation | `grep -n "duration_hours\|status\|operator-side" supabase/migrations/025_booking_requests.sql` |
| No operator surface exists | `grep -rn "operator-side\|operator dashboard" fieldstack-app/src/lib/bookingRequests.ts` |
| Flag infra single-flag state | `grep -n "FlagName" fieldstack-app/src/lib/featureFlags.ts` |
| Demand events wired | `grep -n "booking_redirect_confirmed\|booking_cta_tapped" fieldstack-app/src/lib/analytics.ts && grep -n "venue_book_click" site/components/book-button.tsx` |
| GTA-isms in site/app (P6 gaps) | `grep -n "PLACES" site/lib/venues.ts; grep -n "DEFAULT_COORDS" fieldstack-app/src/lib/location.ts; grep -n "DEFAULT_RADIUS_KM" fieldstack-app/src/hooks/useFieldSearch.tsx` |
| Municipal adapters registered | `grep -n "ADAPTERS" -A 8 apps/api/scripts/scrape/run.ts` |

Unverified items carried in this skill, marked inline: whether municipal GIS
layers or bylaws publish park hours (P1 step 3); availability of soccer-field
open-data layers for any specific metro #2 (P6 step 1); the Pitch Book concept
has no repo artifact (P5c); all "why SOTA fails" statements are dated beliefs
about the market, not measurements. Update the date stamps and re-rank the
leverage table whenever a P-problem's first steps land.
