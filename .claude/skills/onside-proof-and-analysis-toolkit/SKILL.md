---
name: onside-proof-and-analysis-toolkit
description: "First-principles proof recipes for the Onside repo (GTA soccer-field discovery: Expo app, Fastify API + scrape pipeline, Supabase, Next.js site), each with a worked example from this repo's real history. Load BEFORE building against an undocumented external API, tuning any numeric threshold, changing a Postgres migration or function signature, budgeting API calls or scrape politeness, verifying a UI claim that tests cannot prove, judging whether a review finding is real, or fixing a bug where two surfaces show contradictory data. Trigger phrasings: 'probe the API first', 'is this endpoint real', 'what enum values does it accept', 'how were these thresholds chosen', 'can I change 200m to 300m', 'is this migration safe to ship', 'CREATE OR REPLACE or drop first', 'how much will this API usage cost', 'rate limit math', 'prove it on device', 'the pin shows FREE but the bar shows $50', 'is this finding confirmed or just plausible', 'how do I prove this'."
---

# Onside Proof and Analysis Toolkit

Seven recipes for turning a hunch into a proof, each grounded in a worked
example from this repo's history (hashes verifiable with `git show <hash>` from
`/Users/laith/code/soccer`). The theme of all seven: measure the real system,
write the evidence where the next session will find it, pin the conclusion with
a test or CI guard. Jargon, defined once:

| Term | Meaning |
|---|---|
| Adapter | A scrape source module in `apps/api/scripts/scrape/sources/` that fetches an external dataset and maps it to venues/fields |
| Overpass | The public OpenStreetMap query API (`overpass-api.de`) used by the `osm` adapter |
| ArcGIS FeatureServer | Esri's REST API that municipal open-data portals (Toronto, Brampton, Mississauga) expose their GIS layers through |
| Field mask | An HTTP header/param listing exactly which response fields you want; Google Places bills by which fields you request |
| RPC | A Postgres function called through Supabase (`supabase.rpc(...)`), e.g. `search_fields`, `venues_within` |
| Fabric interop | React Native new-architecture compatibility layer; `react-native-maps` markers behave fragilely under it |
| Token Jaccard | Name similarity = shared tokens / union of tokens, after normalization; implemented in `apps/api/scripts/scrape/lib/dedupe.ts` |

## When NOT to use this skill

| You actually want | Go to |
|---|---|
| The mechanics of measuring (probe commands, simulator screenshots, bundle freshness, dedupe log reading) | onside-diagnostics-and-tooling |
| What evidence a change needs before merge, which tests to run/write | onside-validation-and-qa |
| The full story of a past incident | onside-failure-archaeology |
| Geo dedup math theory, GIS source landscape, licensing | venue-data-reference |
| The discipline for open research questions (hunch to accepted result) | onside-research-methodology |
| How changes are gated and reviewed | onside-change-control |

## Recipe index

| # | Recipe | Invoke when |
|---|---|---|
| 1 | Live-probe before building | About to write code against an external API or dataset |
| 2 | Empirical on-device verification | A UI claim cannot be proven by unit tests |
| 3 | Adversarial verification | You have findings or a hypothesis and need to know which are real |
| 4 | Threshold derivation from data | Any numeric threshold is being set or changed |
| 5 | Cost and rate-limit budgeting | Adding or expanding calls to a metered or shared API |
| 6 | Migration safety analysis | Writing or altering anything in `supabase/migrations/` |
| 7 | Data-contradiction proof | Two surfaces can disagree about the same fact |

---

## Recipe 1: Live-probe before building (the Playtomic method)

When to invoke: before writing any adapter, client, or integration against an
external API, especially an undocumented one. Docs (and your own training data)
lie; the wire does not.

Steps:
1. Probe the real endpoint with `curl` before writing a line of adapter code.
   Send the same User-Agent your code will send.
2. Enumerate enum values empirically: try each candidate value and record which
   succeed and which 4xx. Never assume the "obvious" value exists.
3. Verify any URL pattern you will emit (deep links, booking pages) actually
   returns 200 for the entity states you will store, and what non-200 states exist.
4. Check whether the server-side filter actually filters; if loose, plan
   client-side re-filtering from day one.
5. Write the findings INTO the source file header, date-stamped, so the next
   session inherits the proof instead of re-deriving it.
6. Record the measured baseline result, even (especially) when it is zero.

Worked example (commit `4f97534`, PR #457, adapter
`apps/api/scripts/scrape/sources/playtomic.ts`, header lines 1 to 25): the
probe found the documented host dead and the real endpoint, enumerated the two
valid sport ids by trying candidates, proved the club-URL 200-vs-404 split,
caught the loose server-side filter, and recorded a baseline of ZERO GTA
tenants as the expected steady state. The endpoint/enum/baseline numbers are
homed in venue-data-reference section 2.4 (and the adapter header); cite them,
do not restate them.

Reproduce the probe today (re-verified live 2026-07-06, both results identical):

```sh
# FUTSAL is valid (returns a JSON array, [] for downtown Toronto):
curl -sS "https://api.playtomic.io/v1/tenants?coordinate=43.6532,-79.3832&radius=20000&sport_id=FUTSAL&size=40" \
  -H "User-Agent: Onside-scraper/1.0 (https://getonside.ca)"
# SOCCER is not (HTTP 400):
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://api.playtomic.io/v1/tenants?coordinate=43.6532,-79.3832&radius=20000&sport_id=SOCCER&size=40" \
  -H "User-Agent: Onside-scraper/1.0 (https://getonside.ca)"
```

Second worked example, dataset flavor (`apps/api/scripts/scrape/sources/toronto.ts`,
mapSurface/mapSize docstrings): before mapping Toronto's `SURFACE_MATERIAL`
column to our enums, its value distribution was probed with an ArcGIS groupBy
query over all 229 rows: "Turf" 217, "Artificial Turf" 7, null 5, no plain
grass value in the layer. That measurement (not the column name) justified
mapping bare "Turf" to our `turf` enum. Re-verified live 2026-07-06:

```sh
curl -sS "https://gis.toronto.ca/arcgis/rest/services/cot_geospatial13/FeatureServer/54/query" \
  --data-urlencode "where=ASSET_TYPE='Soccer Field'" \
  --data-urlencode "groupByFieldsForStatistics=SURFACE_MATERIAL" \
  --data-urlencode 'outStatistics=[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"n"}]' \
  --data-urlencode "f=json"
```

A completed proof looks like: a date-stamped adapter header listing endpoint,
valid enums, URL-state behavior, filter looseness, and the measured baseline,
plus unit tests over the mapping functions (`apps/api/tests/playtomic.test.ts`,
`apps/api/tests/municipal.test.ts`).

## Recipe 2: Empirical on-device verification (the marker method)

When to invoke: whenever a claim is about rendered pixels or native-layer
behavior that jest cannot see. This repo's unit tests are pure-logic only
(no screen/component render tests), so "tests pass" proves nothing about map
pins, splash screens, gestures, or theme rendering. Run the app and look.

Steps:
1. Run the affected flow on the iOS simulator. Expo Go renders the map screens
   (the `.maestro/screenshots.yaml` header claims a dev build is needed; that
   conflict is documented and adjudicated in onside-build-and-env, which sides
   with the README and in-code comments). A dev build is required only for
   `onside://` deep links and the screenshots.yaml flow itself.
2. Bundle-freshness check FIRST: before concluding a code change "has no
   effect", prove the running bundle contains it. Make an unmissable sentinel
   edit (change a visible string) in the same file; if the sentinel does not
   appear, you are looking at a stale bundle, not a null result. Mechanics in
   onside-diagnostics-and-tooling.
3. Screenshot BOTH themes (Me tab, Settings, Appearance: System/Light/Dark).
4. Use a theme flip as a diagnostic instrument, not just a coverage box. Your
   custom views follow theme tokens; native fallbacks do not. Anything that
   stays visually identical across the flip was not drawn by your code.
5. Write what you verified (and on what: simulator vs device) into the code
   comment next to the constraint it proves.

Worked example (commit `9d5080e`, PR #485, "Fix map pin rendering found in
on-device verification", Jul 5 2026): typecheck, lint, and all unit tests were
green, yet on the simulator free-venue pins rendered as MapKit's default red
balloon and pooled markers froze as placeholder teardrops with stale prices.
Both causes were invisible to tests and provable only by running the app: an
empty rasterized snapshot (which the theme-flip instrument identifies
instantly, because the substituted balloon ignores theme tokens) and a frozen
first rasterization under `tracksViewChanges={false}`. The mechanisms and
fixes are documented in code (`fieldstack-app/src/components/VenuePin.tsx`
rasterization comments; `ExploreScreen.tsx` VenueMarkerSlot comment); the
story is homed in onside-failure-archaeology incident 2 and the standing
invariant in onside-architecture-contract section 10.

A completed proof looks like: both-theme screenshots of the corrected behavior,
plus a code comment stating what was verified on-simulator or on-device.

## Recipe 3: Adversarial verification (the review method)

When to invoke: whenever you hold a list of findings (from a code review, an
audit, or your own analysis) or a causal hypothesis, before spending fix effort
or asserting a conclusion.

Steps:
1. For each finding, attempt to REFUTE it, not confirm it. If working with
   subagents, spawn independent refuters with distinct lenses (code-path lens,
   live-data lens, history lens) and no shared conclusions.
2. A finding survives only with a concrete failure scenario: specific inputs
   or state that produce a specific wrong output. "This looks fragile" is not
   a finding.
3. Grade every survivor PLAUSIBLE or CONFIRMED. PLAUSIBLE means the mechanism
   is coherent but unproven. It becomes CONFIRMED only when reproduced against
   the live system or proven by tracing the exact code path with the exact data
   shapes. Never fix a PLAUSIBLE as if it were CONFIRMED; the fix for the wrong
   mechanism adds risk and hides the real one.
4. Land each confirmed fix with the regression test that would have caught it.

Worked example (commit `7883ab1`, PR #469, "Fix end-to-end review findings
across scrape pipeline", Jul 5 2026): an end-to-end review of the scrape
pipeline produced findings that were each verified against the live system
before fixing:
- Hypothesis: Toronto's `ROLLUP_TO` park names split one physical park into two
  venues that evade both dedupe tiers. CONFIRMED by measuring live pairs: the
  same park appears both bare and with a "- Sports Field Area" suffix, pins 17
  to 116 m apart (too far apart in name+distance for auto or review tier). The
  measurement is recorded in the `parkKey()` docstring,
  `apps/api/scripts/scrape/sources/toronto.ts` lines 92 to 103, and the fix
  strips the suffix before grouping.
- Finding: `GOOGLE_PLACES_API_KEY` was set only on the photo-enrichment step of
  `.github/workflows/scrape.yml`, so every scheduled run failed once the google
  source was registered. CONFIRMED by reading the workflow env blocks; fixed in
  the same commit.
- Finding: a scrape step exiting 1 suppressed the photo-refresh and dedupe
  steps, and Google photo URIs are short-lived, so photos would rot. CONFIRMED
  from workflow semantics; fixed with `if: always()` on both steps.
The same commit added `apps/api/tests/monitor.test.ts`, `municipal.test.ts`,
and `platformLinks.test.ts` to pin the fixes. Precedent at scale: the May 30 to
Jun 3 2026 blitz turned one review into GitHub issues 194 to 254 and roughly 50
`fix/` PRs, one finding per issue per PR.

A completed proof looks like: each finding carries a verdict, a concrete failure
scenario, confirming evidence, and a test; refuted findings are recorded as such.

## Recipe 4: Threshold derivation from data (the dedupe method)

When to invoke: setting or changing ANY numeric threshold (distance radii,
similarity cutoffs, cache TTLs used as correctness guards, retry counts that
gate alerts). Rule: never tune a threshold without a labeled sample of real
cases on both sides of it.

Steps:
1. Generate candidates from real data. For venue dedupe, from `apps/api` run
   `bun scripts/scrape/dedupe.ts` (dry run; prints AUTO and REVIEW pairs with
   distance in meters and name similarity; needs `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env`).
2. Label each candidate pair by hand: true duplicate or distinct place.
3. Choose thresholds by the asymmetry of the failure costs. Here the AUTO tier
   deactivates venues unattended in the weekly job, so AUTO must have ZERO
   false positives on the labeled set; false negatives are acceptable because
   they fall through to the human-reviewed REVIEW tier.
4. Encode the labeled near-misses as named regression tests so the boundary
   cases survive (`apps/api/tests/dedupe.test.ts`).
5. Add structural guards where no threshold can be safe (a category rule beats
   a magic number).

Worked example (commit `fdf0933`, PR #449, Jul 3 2026,
`apps/api/scripts/scrape/lib/dedupe.ts` lines 47 to 52): the shipped values
(as of 2026-07-06) are `AUTO_RADIUS_M=200`, `AUTO_NAME_SIM=0.85`,
`AUTO_RADIUS_GENERIC_M=30`, `REVIEW_RADIUS_M=100`, `REVIEW_NAME_SIM=0.3`.
Real labeled pairs that shaped them, named in the module header and tests:
- "Milton Sports Dome" vs "Milton Sports Centre": sibling facilities, distinct.
  Test asserts their similarity stays below 0.85, which is why facility words
  like centre/dome/field are NOT stop tokens.
- "East Toronto Soccer" inside "Scarborough Soccer Centre": tenant club vs
  facility, REVIEW tier only, a human call.
- The two "Soccer Glow Kingdom" locations: identical names far apart, so every
  tier is distance-gated FIRST; name similarity alone can never merge.
- Generic names ("Senior Soccer Field") describe a kind of place, not a place:
  two parks two blocks apart both contain one. Hence the special 30 m
  near-coincidence radius when either name is all-generic tokens.
Structural guards: osm-osm pairs are never compared (a park's five pitches are
five OSM ways, not duplicates); google-google pairs never auto-merge (two
listings at one address are usually facility vs tenant).

A completed proof looks like: a labeled pair list, thresholds justified by zero
false positives on the dangerous tier, boundary pairs pinned as tests.

## Recipe 5: Cost and rate-limit budgeting (the Places/Overpass method)

When to invoke: before adding or expanding calls to any metered API (Google
Places) or shared community resource (Overpass, municipal ArcGIS, Playtomic).

Steps:
1. Write the budget as arithmetic BEFORE shipping: requests per run = (query
   dimensions multiplied out), times runs per week, times unit cost per SKU.
   Put the arithmetic in a code comment next to the loops that generate it.
2. Find the billing lever. For Places (New) the lever is the field mask: the
   SKU tier is set by which fields you request. Keep the mask minimal
   (`apps/api/scripts/scrape/sources/googlePlaces.ts` lines 38 to 46); adding a
   field like ratings silently upgrades every call to a pricier SKU.
3. Prefer free lookups before paid ones, and write back what you learn.
   `enrichPhotos.ts` resolves place ids cheapest-first: stored
   `venues.google_place_id` (free), then the id embedded in a `google:*`
   external_id (free), then paid Text Search; the id used is written back so
   next week's run short-circuits.
4. Politeness math for shared resources: identify yourself (User-Agent), sleep
   between requests, back off on 429/503/504, and treat soft failures (Overpass
   returns HTTP 200 with a "timed out" remark) as retryable.
5. Make the schedule the throttle: scraping runs on a weekly GitHub Actions
   cron (`.github/workflows/scrape.yml`, Mondays 08:00 UTC), never per-deploy.

Current budgets (as of 2026-07-06, all verifiable in the cited files):

| Caller | Requests per run | Spacing/backoff |
|---|---|---|
| google discovery | at most 150 Text Search POSTs (5 terms x 10 cities x up to 3 pages) | 150 ms between queries, 2 s before each next-page token |
| enrichPhotos | about 1 Place Details per active venue, plus at most 4 photo-media fetches each; Text Search only for unresolved venues | 120 ms between venues |
| osm (Overpass) | 10 POSTs (one per city in `data/cities.yaml`) | 3 s between cities; backoff 8/20/40 s |
| playtomic | 20 GETs (2 sport ids x 10 cities) | 1.5 s between queries; backoff 5/15 s |

The repo deliberately records cost in prose, not dollar figures
(googlePlaces.ts header: billed per call, a few dollars per full run), because
Google reprices; keep it that way and re-check Google's pricing page whenever
the mask or query count changes.

A completed proof looks like: the multiplication written in the adapter header,
the field mask enumerated, sleeps and backoffs in code, the run wired to cron.

## Recipe 6: Migration safety analysis (the 019 method)

When to invoke: any change under `supabase/migrations/`. The invariant to
protect is fresh-replay equivalence: the full ordered set of migrations must
apply cleanly to an EMPTY database and produce the same schema the production
database reached incrementally. CI enforces exactly this
(`.github/workflows/migrations.yml` boots a fresh local stack via
`supabase start` on any PR touching `supabase/`), plus an optional secret-gated
drift check against the linked remote.

Steps:
1. Ask: will this file apply to a fresh DB where every EARLIER migration has
   run, but nothing else? (Later migrations do not exist yet at replay time.)
2. Use the decision table below for function and type changes.
3. Replay locally before pushing: from `apps/api` run `bun run db:reset`
   (recreates the local DB from all migrations plus seed) or `bun run db:start`.
4. Never edit an already-merged migration file; add a new one. Production
   pushes are manual (`bun run db:push` from `apps/api`); CI only detects drift.

Decision table (each row is a shipped precedent):

| Change | Correct form | Precedent |
|---|---|---|
| New function | `create function` | 002 `venues_within` |
| Same signature and return type, new body | `create or replace function` | 006/016/020 `search_fields` revisions drop the old signature explicitly when arity changes |
| Return type or argument type changes | `drop function if exists <name>(<argtypes>);` then `create function` | 019 |
| Add enum value | `alter type ... add value if not exists`, NOT wrapped in begin/commit (Postgres requires it outside a transaction block) | 008 |
| Unique key for PostgREST upsert (`onConflict`) | Real UNIQUE constraint, not a partial unique index (PostgREST upserts cannot target partial indexes) | 014 replacing 013 |
| Idempotent RLS policy re-runs | `drop policy if exists` then `create policy` | 004 and later |

Worked example (the incident that named the recipe): migration 019 narrowed the
`venues_within` RPC from returning full venue rows to `table(id uuid)` because
the anon role could see internal columns (operator_id, data_source, external_id,
booking_notes) through the RPC. It first shipped (commit `094fd3d`) as
`create or replace function` while changing the return type, which Postgres
forbids: it worked on the already-migrated production DB path but broke every
fresh replay. Fix (commit `310e907`, PR #323): `drop function if exists` first,
safe on replay because 002 recreates the function before 019 runs. Follow-up
PR #325 added the migrations CI workflow; its comment names the 019 bug as the
reason it exists.

A completed proof looks like: the Migrations CI job green on the PR (it runs
automatically for `supabase/**` paths), a local `db:reset` pass, and a comment
in the migration explaining any drop-first or no-transaction requirement.

## Recipe 7: Data-contradiction proof (the FREE-rollup method)

When to invoke: two or more surfaces render the same underlying fact and can
disagree (map pin vs reserve bar, app vs site, list card vs detail screen).
Point-fixing one surface treats the symptom; the recipe is to make the
contradiction structurally impossible.

Steps:
1. Name the shared question both surfaces are answering (here: "what price
   verdict does this venue get?").
2. Find why they diverge. It is almost always a different candidate set or a
   different predicate order, not a different intent.
3. Derive the single shared function, and make its candidate set explicitly
   mirror the other surface's. Prove impossibility by construction: both
   surfaces now call one function, so disagreement has no code path.
4. Route EVERY render site through it; delete the local reimplementations.
5. Pin it with a test that encodes the original contradiction as inputs.
6. If a second codebase renders the same fact, mirror the function there and
   document the mirroring in both docstrings.

Worked example (shipped in commits `e3b2bbe` PR #478 and `89a5ff4` PR #480,
Jul 5 2026): a venue with an unbookable $0 field and a bookable $50 field
showed FREE on the map pin, Explore card, and saved-venue card, while the
reserve bar showed $50. Cause: three call sites each rolled their own
`Math.min` over ALL fields, while the reserve bar only ever considers bookable
fields via `cheapestBookableField` (`fieldstack-app/src/lib/reserveField.ts`).
Separately, explicit $0 prices rendered as "$0/hr" because call sites checked
price is not null without asking `isFreeVenue`. The construction:
- `fieldstack-app/src/lib/priceDisplay.ts` now owns both verdicts:
  `priceDisplayFor` (per field) and `venuePriceSummary` (per venue). The
  venue rollup's candidate set is defined as fields with a `booking_url` when
  any exist, else all fields, explicitly mirroring `cheapestBookableField`'s
  view, and the docstring says so.
- The pinning test is
  `fieldstack-app/src/lib/__tests__/priceDisplay.test.ts`: a mixed
  unbookable-$0 plus bookable-$50 venue must roll to "from $50", never FREE,
  and an explicit $0 must never fall through to a priced "$0/hr" render.
- The site mirror: `site/lib/venues.ts` `fieldPriceState`/`venuePriceState`
  reimplement the same candidate set and $0-first predicate order, docstrings
  citing the app's `priceDisplay.ts` as the source of the ordering rule.

A completed proof looks like: one exported function per shared fact, all render
sites routed through it, the contradiction encoded as a named test, mirrors
documented on both sides.

## Provenance and maintenance

All facts verified against the repo at `/Users/laith/code/soccer` (HEAD of
2026-07-06); live probes re-run 2026-07-06. Re-verify before relying on:

| Fact | Re-verify with (run from /Users/laith/code/soccer) |
|---|---|
| Playtomic endpoint, enum set, zero-GTA baseline | the two curl probes in Recipe 1 |
| Toronto SURFACE_MATERIAL distribution (217/7/5 over 229 rows) | the ArcGIS curl probe in Recipe 1 |
| Dedupe thresholds (200/30/0.85/100/0.3) | `grep -n "_M =\|_SIM =" apps/api/scripts/scrape/lib/dedupe.ts` |
| Marker constraints (tracksViewChanges TRUE, alpha 0.01 hit area) | `grep -n "tracksViewChanges\|0.01" fieldstack-app/src/screens/main/ExploreScreen.tsx fieldstack-app/src/components/VenuePin.tsx` |
| Places query dimensions (5 terms x 10 cities x 3 pages) | `grep -n "SEARCH_TERMS\|page < 3" apps/api/scripts/scrape/sources/googlePlaces.ts; grep -c "name:" apps/api/scripts/scrape/data/cities.yaml` |
| Scrape cron and if-always steps | `grep -n "cron\|always()" .github/workflows/scrape.yml` |
| Fresh-replay CI guard exists | `grep -n "supabase start" .github/workflows/migrations.yml` |
| Migration count and 019 drop-first | `ls supabase/migrations/ \| wc -l; head -12 supabase/migrations/019_venues_within_id_only.sql` |
| priceDisplay contradiction test still pins | `cd fieldstack-app && npx jest priceDisplay` |
| Commit hashes cited | `git show --stat 4f97534 9d5080e 7883ab1 fdf0933 310e907 89a5ff4 e3b2bbe` |

Unverified from repo evidence alone (labeled here, not in the recipes as fact):
that the theme flip was the historical instrument used in the PR #485 session;
the repo records only that the balloon fallback and rasterization behavior were
verified on-simulator. The flip-as-instrument logic in Recipe 2 stands on its
own reasoning (native fallbacks ignore theme tokens).
