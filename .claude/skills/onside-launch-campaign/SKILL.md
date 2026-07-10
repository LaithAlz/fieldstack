---
name: onside-launch-campaign
description: The executable, decision-gated launch campaign for Onside (GTA soccer-field discovery). Load when the task is any phase of shipping the Matchday App Store release, proving data trust at scale, or turning on demand. Trigger phrasings include "ship the app", "submit to the App Store", "run the launch", "cut a production build", "take screenshots for the store", "flip the booking flag", "roll out in_app_booking", "burn down the dedupe review queue", "prove coverage", "fix open-now hours", "cluster the map pins", "check the sitemap in Search Console", "what is left before launch", "what do I do after approval", "is it safe to OTA". Every phase has exact commands, the number to expect, and the branch to take when you see something else.
---

# Onside Launch Campaign

A decision-gated runbook across the three fronts the owner named: **A, SHIP**
(the Matchday redesign build through App Store review), **B, DATA TRUST**
(venue data provably complete and honest at scale), **C, DEMAND** (booking
requests, SEO, analytics funnel). Run phases in order within a front; A and B
can run in parallel; C phases list preconditions. Every gate states the
command, the expected observation, and the branch if you see something else.
Volatile numbers are stamped (as of 2026-07-06); re-verify via "Provenance
and maintenance".

Jargon, defined once: **EAS** = Expo Application Services (cloud build/submit).
**ASC** = App Store Connect. **GSC** = Google Search Console. **OTA** =
over-the-air JS update via `eas update`. **RPC** = a Postgres function called
through Supabase. **Fabric** = React Native's new rendering architecture.

## When NOT to use this skill

| Your task | Use instead |
|---|---|
| Set up a dev environment, install deps | onside-build-and-env |
| Day-to-day running/deploying outside the campaign | onside-run-and-operate |
| A bug is blocking a phase | onside-debugging-playbook |
| How to classify/gate/merge a change | onside-change-control |
| What evidence a change needs before merge | onside-validation-and-qa |
| Measure prod health, counts, distributions | onside-diagnostics-and-tooling |
| Wording public claims, licence/attribution duties | onside-external-positioning |
| Why an incident constraint exists (full story) | onside-failure-archaeology |
| Designing the unbuilt solutions (theory work) | onside-research-frontier |

## Ground rules (non-negotiable, from change control)

- One GitHub issue per change, branch per issue, PR body contains `Closes #N`,
  wait for CI green, merge with `gh pr merge --merge` (merge commit, no squash).
- Never `git add -A`. `package-lock.json` is the lockfile of record; never
  commit `bun.lock`. Use **npm, not bun**, in `fieldstack-app`.
- `supabase/migrations/**` changes trigger the Migrations CI workflow
  (fresh-DB replay); `db:push` to prod is manual, only after merge.
- Nothing here may route around `docs/scraping.md`, especially the Google
  Places no-durable-cache rule (only the Place ID may be stored).

## Campaign status snapshot (as of 2026-07-06)

| Fact | Value |
|---|---|
| App tests | 154 pass across 21 suites (jest) |
| API tests | 119 pass across 11 files (bun test) |
| Active venues in prod DB | 754 (312 google, 140 mississauga, 135 toronto, 91 brampton, 76 osm) |
| Venues with `hours` data | **0 of 754** (see B1, this reshapes the plan) |
| Dedupe queue | 0 AUTO, 56 REVIEW pairs (dry run) |
| Sitemap (last local build) | 780 URLs = 754 venue + 21 city + 5 static |
| Prod API health | `{"data":{"supabase":"ok","redis":"error"},"error":null}` (redis "error" is tolerated, still 200) |
| Sentry DSN in eas.json | absent as of 2026-07-06 (status home: onside-config-and-flags, known gap 1) |
| `in_app_booking` flag | default false; no operator-side surface exists |
| Open issues | #475 (hours in search projection), #484 (marketing audit) |

---

# FRONT A: ship the Matchday build

## A0. Preflight: all suites green

Run all three packages. Expected counts are as of 2026-07-06; more is fine,
fewer means something was deleted, stop and investigate.

```bash
cd /Users/laith/code/soccer/apps/api && bun install && bun run typecheck && bun test
# EXPECT: "119 pass, 0 fail" across 11 files. A "[redis] invalid REDIS_URL" warning line is normal.

cd /Users/laith/code/soccer/fieldstack-app && npm ci && npm run typecheck && npm run lint && npm test
# EXPECT: "Test Suites: 21 passed", "Tests: 154 passed". Includes tokensDrift.

cd /Users/laith/code/soccer && node design/generate.mjs && \
  git diff --exit-code design fieldstack-app/src/theme/palette.ts site/app/tokens.css site/lib/tokens.generated.json
# EXPECT: exit 0, no diff.

cd /Users/laith/code/soccer/site && npm ci && npm run build
# EXPECT: build succeeds. Without site/.env.local (SUPABASE_URL + SUPABASE_ANON_KEY) it
# warns and builds an empty venue list: fine for preflight, NOT for C2 sitemap counting.
```

Branch arms: tokensDrift fails = someone hand-edited a generated file (edit
`design/tokens.json`, rerun the generator, commit both). Any other red:
onside-debugging-playbook, fix via a normal PR, re-run A0.

Then a simulator smoke in BOTH themes: use
`.claude/skills/onside-diagnostics-and-tooling/scripts/sim-verify.sh` (run from
`fieldstack-app/`). Judge: Explore map renders pins, venue detail opens,
reserve bar shows a price or FREE, no red screen. Caveats: Expo Go is expected
to render the map (the `.maestro/screenshots.yaml` header claims otherwise;
onside-build-and-env documents that conflict and sides with the README and
in-code comments), so a blank Explore in Expo Go is a real failure to triage,
with a local dev client (`npx expo run:ios`) only as a discriminating
fallback; and `.maestro/smoke.yaml` predates the Explore rebuild (asserts a
"Pick a time" flow, unverified against the current UI), so verify by eye
rather than trusting its pass/fail.

## A1. Decision gate: Sentry DSN

Verified 2026-07-06: `EXPO_PUBLIC_SENTRY_DSN` appears **zero** times in
`fieldstack-app/eas.json`; `initSentry()` no-ops without it, so production
crash reporting is OFF (status home: onside-config-and-flags, known gap 1;
re-check there before acting). Creating the Sentry project is user-only.
**Option 1 (recommended)**: user creates it, then a normal PR adds
`"EXPO_PUBLIC_SENTRY_DSN": "<dsn>"` to `build.production.env` (and preview)
in eas.json; unblocks the crash gate in C1. **Option 2**: proceed without,
writing down that C1's "zero new crash signatures" gate becomes unevaluable
(fallback: ASC crash reports, delayed and opt-in only, plus support email).

## A2. Production build

Precondition: A0 green on the exact commit you will build.

Version trap (verified): `fieldstack-app/app.json` sets
`runtimeVersion.policy: "appVersion"` while `docs/releasing.md` claims the
fingerprint policy; the doc is stale. Under appVersion policy an OTA update
reaches EVERY binary sharing `expo.version`. This release includes a native
manifest change (privacyManifests), so **bump `expo.version`** (currently
`1.1.0`) before building; otherwise a future OTA built against the new native
surface could reach the old live binary.

```bash
cd /Users/laith/code/soccer/fieldstack-app
npx eas-cli whoami            # expect: allaith (log in if not)
eas build --platform ios --profile production
```

Expected: build queues on EAS, buildNumber auto-increments remotely
(`appVersionSource: "remote"`, never hand-edit it), artifact is an .ipa.

Branch arms:
- **Fingerprint/dependency divergence** (module not found, mismatched native
  modules): almost always someone ran bun in `fieldstack-app`. Fix:
  `rm -rf node_modules && npm ci`, confirm `package-lock.json` untouched.
  Full story: onside-failure-archaeology incident 6 (splash-stuck cluster, PRs #409-#429).
- **Build OK but sticks on splash in TestFlight**: import-time env guards
  exist (supabase.ts, api/client.ts never throw); re-check that the eas.json
  production env block was not edited.

## A3. Screenshots (rewritten Maestro flow, dev build required)

`.maestro/screenshots.yaml` drives three screens and asserts real strings:
Explore must show text matching `[0-9]+ fields? near you`, venue detail must
show "Fields", the Me tab must show "Preferred time". It targets
`appId: app.onside.mobile`, so it needs a dev client or standalone build,
**not Expo Go**.

Getting a build onto a simulator: local dev client via
`cd /Users/laith/code/soccer/fieldstack-app && npx expo run:ios` (compiles
natively, installs to the booted sim), then `npm start` for Metro. Do NOT use
the `preview`/`preview-simulator` EAS profiles here: verified 2026-07-06,
their `EXPO_PUBLIC_API_URL` (`https://api-staging.getonside.ca`) resolves to
a Vercel 404 `DEPLOYMENT_NOT_FOUND`, so the app would show zero venues.

Capture on an iPhone 16 Pro Max simulator (6.9 inch slot):

```bash
cd /Users/laith/code/soccer && maestro test .maestro/screenshots.yaml
# PNGs land in the cwd: 01-explore.png, 02-venue-detail.png, 03-me.png
scripts/appstore-screens.sh . ./appstore 1320x2868   # resize to the 6.9" ASC slot
```

Branch arms: assertion `[0-9]+ fields? near you` fails or map empty = the app
is not reaching an API; check `fieldstack-app/.env` `EXPO_PUBLIC_API_URL` (the
prestart hook rewrites it to your LAN IP; the local API must be running) or
point it at `https://api.getonside.ca`. Need more than 3 shots (ASC allows
10): capture by hand (Cmd+S in Simulator) and resize with the same script.
Capture both themes if the listing shows dark mode (onside-validation-and-qa).

## A4. App Store Connect gates (user-only actions, hand off this checklist)

1. **Privacy questionnaire must match `fieldstack-app/app.json`
   `privacyManifests`** (`NSPrivacyTracking: false`, nothing "used for
   tracking"): Email + UserID (linked), Precise Location (not linked), Crash
   Data, Performance Data, Product Interaction (not linked), Other Usage Data
   (linked), Other User Content (linked). The two NEW rows this cycle are
   Other Usage Data and Other User Content (docs/app-store-checklist.md §8).
2. Upload the 6.9 inch screenshots from A3.
3. Listing text per docs/app-store-checklist.md §2; Support URL
   `https://getonside.ca/support`, Privacy URL `https://getonside.ca/privacy`.
4. Review notes must state: booking handoff is an external redirect to
   operator-owned sites by design; and describe the UGC moderation path
   (report a review + block its author + support contact), Guideline 1.2.

## A5. Submit and review

```bash
cd /Users/laith/code/soccer/fieldstack-app
eas submit --platform ios --profile production   # ascAppId 6780034337, team CX88Y8RY7Q
```

Known review risk areas, verify on device BEFORE submitting:
- **UGC (1.2)**: on a venue with a review, use the overflow menu: Report
  works signed-in; "Block this user" hides that author's reviews immediately;
  Me > Settings > Blocked users lists and unblocks them.
- **Splash (2.1)**: cold-start the production build; splash must drop within
  ~3.5s even offline (hard cap in App.tsx).
- **Sign in with Apple (4.8)**: present next to Google, native flow.

While In Review: **never** run `eas update --branch production`
(docs/releasing.md); preview-branch OTAs are safe. On rejection: read the
exact guideline cited, fix via normal PRs, new build (A2) if native or
listing, resubmit.

## A6. Post-approval baseline

1. "Manually release this version" in ASC, after a final TestFlight sanity
   pass of the exact approved build.
2. OTA baseline: the live binary is on channel `production`; future JS
   hotfixes ship with `eas update --branch production --message "<what>"`
   and reach only binaries sharing `expo.version` (appVersion policy).
3. **Flip nothing.** `in_app_booking` stays default-false until C1's gates.

---

# FRONT B: data trust at scale

## B1. Hours truth (issue #475), split in two

Hard fact that reshapes this phase (verified 2026-07-06): **0 of 754 active
venues have `hours` data** (only the playtomic adapter maps hours, and it has
0 GTA tenants, the expected steady state). The projection fix alone changes
nothing a user can see: B1a is plumbing, only B1b moves the visible gate.

**B1a, plumbing (issue #475)**: new migration `026_*` adding `hours` to the
`search_fields` venue projection (pattern: migration `020` lines 87-95), plus
`SearchVenue` in `apps/api/src/lib/queries/search.ts`, the `SearchResult`
venue type in `fieldstack-app/src/types/api.ts`, and ExploreScreen's open-now
call (`isOpenNow(undefined, now)` today, near line 306) becoming
`isOpenNow(venue.hours, now)`. Migration rule (the 019 lesson): changing the
function's arguments or return type requires `drop function if exists` with
the FULL old signature first; adding a jsonb key changes only the body, so
`create or replace` stays legal (onside-proof-and-analysis-toolkit).

Gate B1a (after merge + manual `bun run db:push` from `apps/api`): probe 4 in
`references/probes.md`. EXPECT every search result's venue object to carry an
`hours` key (null values are correct until B1b). If missing: the RPC changed
but the API projection type did not, or you hit the route's 30s Redis TTL;
wait and retry before digging.

**B1b, data (OPEN, THEORY REQUIRED)**: acquiring hours is an unsolved
problem here; see the Solution menu. The real gate once any option ships:
run the open-now probe in `references/probes.md` at 10:00 and again at 23:30
local. EXPECT: (1) non-null `hours` fraction > 0, and (2) at one probe time
the open-now count is strictly between 0 and the total, i.e. venues actually
differ from each other. Caution: the app's 06:00-23:00 default window already
makes 10:00 vs 23:30 TOTALS differ with zero data; that alone does NOT pass.

## B2. Dedupe REVIEW queue burn-down

Metric command (read-only dry run, uses `apps/api/.env` service key):

```bash
cd /Users/laith/code/soccer/apps/api && bun scripts/scrape/dedupe.ts
# EXPECT (as of 2026-07-06): "scanning 754 active venues (dry run)", then 56 REVIEW
# lines, final line reporting 0 auto, 56 review (dry run, nothing changed).
```

Gate: zero unresolved REVIEW pairs. Resolution per pair (judgment call; most
current pairs are distinct orgs sharing one address, e.g. leagues inside one
facility). Every mutation follows onside-change-control section 10: a script
shipped via a normal PR, dry-run by default with `--apply` as the explicit
opt-in, soft-delete only. No ad hoc service-role writes against prod, ever.
1. **True duplicate**: extend `dedupe.ts` (or ship a small pair-resolutions
   script through a PR, same dry-run/`--apply` shape) so the loser is
   soft-deleted exactly like AUTO does (`is_active=false,
   duplicate_of=<keeper id>`). Review the printed dry-run plan before `--apply`.
2. **Org, not a facility** (google rows): extend `refine.ts` CLASSIFY signals,
   dry-run, then `bun run scrape:refine -- --apply`. Trap: a google re-scrape
   resets `is_active=true`, so refine must re-run after every google scrape.
3. **Legitimately distinct**: NO mechanism exists to mark a pair "reviewed,
   not a duplicate"; it reprints every run (Solution menu item). Until built,
   the honest gate is: every remaining line listed in a committed audit note.

Branch arm: AUTO count > 0 in a dry run means the weekly workflow applies it
Monday 08:00 UTC; resolve wrong-looking AUTO pairs before Monday.

## B3. Clustering past MAX_MARKERS=50

Today `ExploreScreen.tsx` renders a fixed pool of `MAX_MARKERS = 50` markers
and shows "Showing 50 of N venues" downtown. Gate when a solution ships: a
downtown pan (43.6532, -79.3832) shows every venue in the viewport with no
overflow banner and no crash, verified ON DEVICE, both themes.

**Fenced wrong path**: anything that mounts/unmounts Marker children of
MapView. That is the exact Fabric-interop crash fixed across a 7-PR saga; the
standing marker-pool invariants are homed in onside-architecture-contract
section 10 (comments at `ExploreScreen.tsx` near lines 102-111; story:
onside-failure-archaeology incidents 1 and 2).
Off-the-shelf clustering libs that add/remove markers repeat the crash.
Approaches ranked in the Solution menu; all THEORY REQUIRED before code.

## B4. Coverage proof (DB vs municipal ground truth)

Compare prod DB per-source counts against the municipal sources of record.
All three matched exactly on 2026-07-06:

| Source | Ground truth (probe result) | DB (active) |
|---|---|---|
| Toronto ArcGIS layer 54 | `{"count":229}` soccer-field assets | 229 fields (135 venues) |
| Brampton ParkFeatures | `{"count":91}` park bundles | 91 venues (195 exploded fields) |
| Mississauga geojson | 237 features | 237 fields (140 venues) |

Probe commands (exact, run-from anywhere) are in `references/probes.md`.
Gate: DB field/venue counts within a few percent of ground truth, deltas
explainable (Toronto drops coordless venues; Mississauga keeps only
SERVSTAT OPEN/RCNF/blank). Branch arms:
- DB much lower: check the last weekly Scrape workflow log for a zero-rows
  guard trip (onside-diagnostics-and-tooling).
- Ground truth grew: the city added assets; a normal weekly scrape picks
  them up, re-probe after Monday.
- Coverage claims for marketing must go through onside-external-positioning.

---

# FRONT C: demand

## C1. Booking-flag activation protocol

**Decision gate first, do not skip**: `booking_requests` is request-only.
Migration 025's header states there is no operator surface; nobody but the
requesting user (and service_role) can read a request. Flag ON means real
users submit requests **no operator will see**. The owner must choose:
- (a) **Manual concierge loop**: someone polls new requests (probe in
  references/probes.md), relays to the operator by email/phone, updates
  status via service role. No automation exists; budget the labor.
- (b) **Hold C1** until an operator surface ships. Nothing else depends on C1.

If (a): in the PostHog dashboard (US cloud project, key `phc_...` in
eas.json), set flag `in_app_booking` release condition to **10% of users**.
The app honors exact `true` only (`resolveFlag`); local test:
`EXPO_PUBLIC_FF_IN_APP_BOOKING=1` in `fieldstack-app/.env`.

Gates at 10%, watch 3 to 7 days:
- `booking_request_submitted` events arriving in PostHog (name verified in
  `src/lib/analytics.ts:29`).
- Rows in `booking_requests`, each answered within the promised window.
- Zero new crash signatures in Sentry. If A1 chose Option 2 this gate is
  **unevaluable**; fallback is ASC crashes + support email volume.
- Profile shows "Booking requests" for flagged signed-in users.

Pass: raise to 100%, re-watch. Fail or ops overwhelmed: set the flag to 0%;
the OFF invariant (flag off = operator redirect regardless of auth) is
unit-tested, users fall back cleanly on the next flag fetch.

## C2. SEO gates

Precondition: the breadcrumb schema fix is on main (commit `02f5613`,
PR #488): venue-page BreadcrumbList position 2 now points at
`/soccer-fields/<city-slug>`.

**Known defect to fix before expecting 100% valid breadcrumbs** (verified in
code): the city crumb links unconditionally, but city pages exist only for
cities with >= 3 venues (`CITY_PAGE_MIN_VENUES = 3`, `dynamicParams = false`),
so a venue in a 1-or-2-venue city emits a breadcrumb URL that 404s. File an
issue; fix is a conditional link or a lower threshold.

Gates (GSC is user-only access; agent prepares, user reads):
- Rich Results Test on one venue URL shows a valid Breadcrumbs item.
- GSC > Enhancements > Breadcrumbs: valid count climbing after next crawl.
- Sitemap coverage: last local build had **780 URLs** (754 venue + 21 city +
  5 static); count after a fresh build with real env:
  `cd /Users/laith/code/soccer/site && npm run build && grep -c "<url>" .next/server/app/sitemap.xml.body`.
  Venue pages are build-time static, so **redeploy the site after
  significant scrape changes** or the live sitemap lags the DB.

## C3. Analytics funnel definition

Define in PostHog (dashboard work, no code): `app_opened` > `screen_viewed`
where `screen = "Explore"` > `booking_cta_tapped` >
`booking_redirect_confirmed` (add `booking_request_submitted` once C1 lives).

**Migration trap (verified)**: `docs/analytics.md:31` still documents routes
`VenueList` / `MapView` / `FieldSearch`; the Explore rebuild collapsed them
into one `Explore` route, so any saved insight filtering `screen="VenueList"`
reads zero going forward and dashboards spanning the rebuild need both names.
Update dashboards, fix the doc per onside-docs-and-writing. Site side:
Vercel Analytics events `venue_book_click` and `waitlist_joined`.

---

# Solution menu for the open items (ranked, with obligations)

**B3 clustering**, all THEORY REQUIRED (derive pool math and pan/zoom
stability before code; design work belongs in onside-research-frontier):
1. Client-side clustering INTO the existing fixed pool (grid or supercluster
   over fetched results; slots render venue pins or cluster-count pins).
   Obligations: pool invariants unchanged, on-device Fabric verification,
   count pins share VenuePin's transparent-view rasterization trap.
2. Server-side clusters for zoomed-out viewports (new API shape). Obligations:
   endpoint + Redis cache key design, same client pool constraints.
3. Measured MAX_MARKERS raise: profile marker cost on device first
   (onside-diagnostics-and-tooling). Cheapest; only moves the ceiling.
   FENCED: react-native-map-clustering or anything that unmounts markers.

**B1b hours acquisition**:
1. Venue-type default windows stored as labeled inference (public parks on a
   dawn-to-dusk or bylaw window). THEORY REQUIRED: verify real municipal
   bylaw hours per city; UI must label estimates as estimates. Storable.
2. Per-operator website scraping: only with robots/ToS check per
   docs/scraping.md §4.4, one adapter per source.
3. Google Places opening hours: **BLOCKED for durable storage** (no-cache
   rule); a short-TTL display-time fetch could power the venue detail line
   only, never the stored search projection.
4. User-reported hours: new table + moderation + provenance labeling;
   largest trust payoff, most product work.

**B2 reviewed-pairs suppression**: a committed list (YAML or table) of pair
ids the dedupe runner skips-but-reports. Obligations: keep `lib/dedupe.ts`
pure and unit-tested (`tests/dedupe.test.ts`), dry run stays read-only.

**Standing debts before loud marketing**: Brampton CC BY 4.0 attribution is
documented but rendered nowhere in app or site; Toronto OGL confirmation
(opendata@toronto.ca) outstanding. Owned by onside-external-positioning;
schedule inside Front C.

# Provenance and maintenance

All facts verified against the repo and live systems on 2026-07-06 at HEAD
`99a660d`. Re-verify each volatile fact before trusting it:

| Fact | Re-verify with |
|---|---|
| App test count (154/21) | `cd /Users/laith/code/soccer/fieldstack-app && npx jest --silent 2>&1 \| tail -3` |
| API test count (119/11) | `cd /Users/laith/code/soccer/apps/api && bun test 2>&1 \| tail -3` |
| Active venues + per-source counts | `bun /Users/laith/code/soccer/.claude/skills/onside-diagnostics-and-tooling/scripts/db-spot-check.ts` |
| Venues with hours = 0 | hours probe in `references/probes.md` |
| Dedupe 0 AUTO / 56 REVIEW | `cd /Users/laith/code/soccer/apps/api && bun scripts/scrape/dedupe.ts \| tail -1` |
| Sentry DSN absent | `grep -c EXPO_PUBLIC_SENTRY_DSN /Users/laith/code/soccer/fieldstack-app/eas.json` (0 = absent) |
| runtimeVersion policy appVersion | `grep -A2 runtimeVersion /Users/laith/code/soccer/fieldstack-app/app.json` |
| api-staging 404 | `curl -s -o /dev/null -w "%{http_code}" https://api-staging.getonside.ca/health` |
| Prod health shape | `curl -s https://api.getonside.ca/health` |
| Sitemap 780 | fresh `npm run build` in `site/` with env, then `grep -c "<url>" .next/server/app/sitemap.xml.body` |
| MAX_MARKERS 50 | `grep -n "MAX_MARKERS = " /Users/laith/code/soccer/fieldstack-app/src/screens/main/ExploreScreen.tsx` |
| Open issues #475/#484 | `gh issue list --state open` |
| Municipal ground-truth counts | ArcGIS/geojson probes in `references/probes.md` |
| Flag key `in_app_booking` | `grep -n in_app_booking /Users/laith/code/soccer/fieldstack-app/src/lib/featureFlags.ts` |
