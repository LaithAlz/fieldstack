---
name: onside-failure-archaeology
description: >-
  The incident chronicle of the Onside repo (GTA soccer-field discovery: Expo app, Fastify API, scrape
  pipeline, Next.js site). Load when a crash or regression feels like it may have happened before ("has
  this broken before?", "why does this weird comment exist?"), before touching any known-scarred surface
  (map Markers / tracksViewChanges, Animated drivers, Supabase migrations that change function signatures,
  scrape.yml step gating, price/FREE display, booking-history cloud sync, theme hydration), when someone
  proposes relitigating a settled decision (use bun for the app, squash merges, flip tracksViewChanges,
  resize the marker pool), or when you need the commit-level evidence trail for a past fix. Also load to
  APPEND a new incident entry after a fix.
---

# Onside failure archaeology

This is the single home for incident detail in this repo. Sibling skills cite these entries; do
not duplicate the stories elsewhere. Every claim below was verified against git and the working
tree at HEAD `99a660d` (as of 2026-07-05). Line numbers drift; commit hashes do not. When a
line reference looks stale, grep for the quoted phrase.

Jargon used once, defined once:
- **Fabric interop**: React Native New Architecture's compatibility layer for old-arch native
  components. `react-native-maps` (internally "AIRMap") runs through it in this app.
- **EAS**: Expo Application Services, Expo's hosted build/submit system.
- **PR #N**: every change lands as a GitHub PR merged with a merge commit whose subject is
  "Merge pull request #N from LaithAlz/branch-slug". The slug is the de facto title.

## When NOT to use this skill

| You actually want | Go to |
|---|---|
| First discriminating check for a live symptom | onside-debugging-playbook |
| The rules that prevent these incidents (invariants) | onside-architecture-contract |
| How to ship the fix (branch, PR, CI, merge policy) | onside-change-control |
| Dedup math, licensing, platform landscape theory | venue-data-reference |
| Env vars, secrets, flags involved in an incident | onside-config-and-flags |

## Entry format

Every entry: **Symptom** (what a user/CI saw), **Root cause**, **Evidence** (commits, PRs, file:line
of surviving comments or guards), **Status** (`fixed`; `guarded` = fixed plus a tripwire; `open`).

## Incident index

| # | Incident | Surfaces | Status |
|---|---|---|---|
| 1 | AIRMap/Fabric marker crash war | app map | guarded (by convention + comments) |
| 2 | On-device pin sequel: frozen first rasterization + red balloon fallback | app map | fixed |
| 3 | Gallery dots mixed-driver crash | app venue detail | fixed |
| 4 | Icon/rebrand saga (11 iterations, 1 revert) | app assets | closed |
| 5 | Migration 019 return-type break | Supabase | guarded (migrations.yml) |
| 6 | Stuck splash / EAS bun-hoisting cluster | app builds | guarded (CI on npm) |
| 7 | The dead-code era (WhenPill, booking history, reminders) | app booking flow | fixed |
| 8 | $0/hr shown for FREE venues (app, then site parity) | app + site pricing | fixed |
| 9 | Scrape exit 1 silently skipped photo enrichment + dedupe | scrape CI | guarded (always()) |
| 10 | GOOGLE_PLACES_API_KEY absent from the scrape step | scrape CI | fixed |
| 11 | Toronto ROLLUP_TO suffix duplicates evading dedupe | scrape data | fixed |
| 12 | Booking-history NOT NULL batch poisoning | app cloud sync | guarded (tests) |
| 13 | Playtomic endpoint drift | scrape source | fixed (documented) |
| 14 | Theme flash before hydration | app startup | fixed |
| 15 | Minor incidents (Redis crash, recovery-redirect revert, App Store binary) | various | fixed |
| 16 | Open wounds (Sentry DSN, dead calendar prompt, split scraper UA) | various | open |
| 17 | Untracked deploy workflow believed to auto-deploy the API | API deploys | documented (deploys are manual) |
| 18 | git checkout wiped uncommitted agent work | dev workflow | recovered (rule in entry) |
| 19 | Vercel dropped the production deploy for a merge | site deploys | fixed (trigger commit) |

---

## 1. AIRMap/Fabric marker crash war (May 14 to Jun 2, 7 PRs)

**Symptom**: native crash on map pin interaction (select a pin, toggle a filter, pan) under the
RN New Architecture. Recurred repeatedly; each fix moved the crash, none killed it until #193.

**Root cause**: `react-native-maps` Markers under the Fabric interop layer cannot tolerate
(a) unstable React keys, (b) mounting/unmounting Marker children while the map lives, or
(c) flipping `tracksViewChanges` at runtime. Any of these corrupts AIRMap's native subview
index; the next touch on the map dereferences a stale index and crashes.

**Fix chain**:

| PR | Merge | Branch commit | What it tried |
|---|---|---|---|
| #100 | `120b931` (May 14) | `0b238ef` | Stable marker keys |
| #137 | `4fc9174` (May 17) | | Memoized markers, stable coordinate objects |
| #188 | `6d8ad25` (May 31) | `3c1d259` | Stable `venue.id` key; tracksViewChanges only on content change |
| #189 | `2b7f87a` (Jun 2) | `e652a57` | Removed tracksViewChanges toggling entirely |
| #191 | `b8e2ec9` (Jun 2) | `1b0b338` | `useNativeDriver:false` on the selection ring animation |
| #192 | `c5b9ccf` (Jun 2) | `6d5a954` | Selection `Circle` kept always-mounted |
| #193 | `ae2f8eb` (Jun 2) | `95ed4eb` | THE fix: pre-allocated fixed Marker pool |

**Standing constraints** (survive in code, do not remove):
- Fixed pool of `MAX_MARKERS = 50` slots (`fieldstack-app/src/screens/main/ExploreScreen.tsx:68`).
  Inactive slots render at null-island (0,0) with `opacity 0` but stay MOUNTED, so the pool never
  changes length (comment at `ExploreScreen.tsx:102-111`; pool fill at 316-324; overflow banner
  "Showing 50 of N venues" near line 571).
- The selected-pin halo is one always-mounted Marker + Circle whose content never varies; that is
  the only Marker allowed `tracksViewChanges={false}`, and also why it cannot show price digits.

The war predates the Jul 5 Explore rebuild (PR #474 `7f5ea4d` deleted MapViewScreen.tsx); the
constraints were carried into ExploreScreen.tsx and re-tested there. See incident 2 for the
sequel that set `tracksViewChanges` to its final value.

**Status**: guarded by the surviving comments and the fixed-pool structure. There is no automated
test for this (Fabric crashes need a device); treat the comments as the regression suite.

## 2. On-device pin sequel: frozen pins and red balloons (PR #485, Jul 5)

**Symptom** (found in on-device verification after the Explore rebuild): every pin rendered as a
placeholder teardrop or showed a stale/wrong price after filter toggles; the FREE pin sometimes
rendered as MapKit's default red balloon.

**Root causes** (two, both rasterization):
1. `tracksViewChanges={false}` froze each marker's FIRST rasterization. The pool mounts before
   the search resolves, so slots snapshot themselves empty; slot reassignment then showed the
   previous venue's image. Permanently TRUE is safe (it is the FLIP that crashes, see incident 1)
   and children are memoized to keep idle cost low.
2. A fully transparent root view rasterizes to an empty annotation image and MapKit falls back to
   its default balloon. The free pin's 44pt hit area therefore carries
   `backgroundColor: "rgba(0, 0, 0, 0.01)"` (any non-zero alpha keeps the snapshot real), and the
   free pin is a glyph rather than a bare tinted dot.

**Evidence**: PR #485 merge `2999a09`, commit `9d5080e` ("Fix map pin rendering found in
on-device verification") flips false to true and rewrites the comment; constraints live at
`ExploreScreen.tsx:102-111` and `fieldstack-app/src/components/VenuePin.tsx:142-146, 201-209`.
**Status**: fixed. `tracksViewChanges={true}` is now a settled decision (see Settled battles).

## 3. Gallery dots mixed-driver crash (issue #454, PR #455, Jul 4)

**Symptom**: crash on the second photo-swipe in the venue photo gallery. Latent for weeks: it
only fires once venues have 2+ photos, which is when pagination dots first render (photos arrived
via the Google Places enrichment, PR #448).

**Root cause**: the active-dot animation mixed drivers on the same `Animated.View`. The native
driver claims the node on its first run; the next JS-driven width update on that node throws
(width is not native-driver eligible). **Fix**: both tweens `useNativeDriver: false`; two 220ms
JS tweens on 6px dots are imperceptible.

**Evidence**: merge `03d3243`, commit `a55c7d9`; surviving comment above the `Dot` component,
`fieldstack-app/src/components/PhotoGallery.tsx:265-272`. **Status**: fixed. Rule: never animate
one Animated node with both drivers; when in doubt in this codebase, use the JS driver (same
lesson as incident 1's PR #191).

## 4. The icon/rebrand saga (May 17-24)

**Symptom**: not a bug; a 12-branch design thrash worth remembering. During the FieldStack to
Onside rebrand window (PR #161, commit `b52db9d`), the app icon went through 11 iteration PRs in
8 days: #159, #162, #164, #166, #168, #170, #172, #174, #176, #178, #180. Revert PR #181 (merge
`6eac5cf`, commit `264464a`) restored the PR #176 design (subtle field + black player, no goal,
no wordmark); PR #182 (`656272c`) shrank and centered it.

**Status**: closed. Lesson: icon/visual taste iteration through the one-PR-per-issue pipeline is
expensive; batch design exploration locally, ship one decided PR.

## 5. Migration 019 return-type break (Jun 13)

**Symptom**: migration 019 applied fine on the linked prod DB but broke every FRESH database
replay (local `db reset`, CI, future environments).

**Root cause**: 019 narrows the `venues_within` RPC from `SETOF venues` to `table(id uuid)`
(the wide version exposed operator_id, data_source, external_id, booking_notes to anon). It
shipped as `CREATE OR REPLACE FUNCTION`, but Postgres forbids OR REPLACE across return types.
Replays failed; prod survived only because prod already had the old function replaced in place.

**Fix**: commit `310e907` (PR #323, merge `a33233c`) adds `drop function if exists` first. Safe
on replay because migration 002 recreates the function before 019 runs. Original bad commit:
`094fd3d`. See `supabase/migrations/019_venues_within_id_only.sql:1-10`.

**Guard**: PR #325 (merge `167bc93`) added `.github/workflows/migrations.yml`: on any PR touching
`supabase/`, CI boots a fresh local stack (`supabase start`) and applies every migration from
scratch; the comment at `migrations.yml:34-38` names 019 as the reason. An optional secret-gated
step also fails if the linked prod project is missing merged migrations. **Status**: guarded.

## 6. Stuck splash / EAS bun-hoisting cluster (Jun 18-24, PRs #409 to #429)

**Symptom**: production App Store build stuck on the splash screen forever. Multiple stacked
causes; each got its own PR (all branch `fix/NNN-slug`, merge dates Jun 18 to Jun 24, 2026):

| PR | Commit | Cause fixed |
|---|---|---|
| #409 | `eee07fd` | Splash render gate and hide gate could diverge; unified into one `appReady` value + hard safety timeout |
| #411 | `6088cbc` | Module-load and startup inits could throw uncaught |
| #413 | `c9894b0` | Supabase env missing from EAS build profiles; supabase client threw AT IMPORT TIME with no env |
| #417 | `bc4f063` | expo-calendar / expo-linear-gradient versions misaligned with SDK 54 |
| #419 | `fd49d89` | `babel-preset-expo` was an undeclared devDependency; worked under bun's hoisting, unresolvable under npm/EAS |
| #429 | `e79cfa8` | ROOT CAUSE of the drift: bun and npm hoist node_modules differently, diverging the EAS build fingerprint and dropping a hoisted dep. Mobile CI unified on npm to match EAS |

**Surviving guards**: `fieldstack-app/src/lib/supabase.ts` falls back to placeholder URL/key and
warns instead of throwing at import (comment near line 23); same posture in `src/api/client.ts`.
CI comment at `.github/workflows/ci.yml:40-44` explains the npm decision. `package-lock.json` is
the lockfile of record; `bun.lock` is gitignored repo-wide (`.gitignore:6-8`).

**Status**: guarded. "npm, not bun, for fieldstack-app" is a settled battle (below). Note: apps/api
CI still deliberately uses bun; only the mobile app is npm-locked.

## 7. The dead-code era (May 23 to Jul 5)

**Symptom**: for six weeks the app carried booking machinery that nothing could reach, plus a
prominent date pill that filtered nothing.

**Timeline**:
- May 11, commit `a2cb4ad`: WhenPill lands on the VenueList header ("When do you want to play?").
  The preferred slot it set was NEVER consumed by search (`useFieldSearch` has never read
  `preferredSlot`); it only seeded detail-screen pickers and later a share-message string.
- May 23, commit `9ab8db8` (PR #139, merge `18cc5db`): mocked availability dropped, booking became
  a one-tap operator redirect. Its own commit message and the then-current `openBooking.ts` header
  explicitly list what went dead: `recordAttempt` (booking history writes), reminder scheduling,
  the calendar prompt, and `buildBookingUrl` ("stays alive for any future dated path").
- Jul 5, PR #474 (`7f5ea4d`): Explore rebuild deletes VenueListScreen and the WhenPill with it.
- Jul 5, PR #478 (commit `e3b2bbe`): the Matchday reserve bar re-wires everything: slot threads
  through `buildBookingUrl`, `record()` logs real attempts, reminders schedule again. The current
  `fieldstack-app/src/lib/openBooking.ts:1-26` header narrates the un-deadening.

**Status**: fixed, with one leftover: `promptAddToCalendarOnReturn` in `src/lib/calendar.ts` still
has zero importers (as of 2026-07-05). See incident 16.

**Lesson**: this repo deliberately parks dead-but-tested code with a header explaining WHY it is
parked and what would revive it. Before deleting "dead" code, check the file header and this
chronicle; before parking code, write that header.

## 8. $0/hr shown for FREE venues (Jul 3-5, app then site)

**Symptom**: free municipal park venues rendered "$0/hr" instead of the FREE badge; separately, a
venue could show FREE on its pin/card while its reserve bar showed a $50 price.

**Root causes and fix sequence** (order matters, it is the "app fix then site parity" story):
1. PR #451 (`e5cd552`, Jul 3): fields with `null` price got a "rates on site" fallback (display
   gap, not yet the $0 bug).
2. PR #474 (Jul 5): `isFreeVenue` born in `src/lib/filters.ts` (explicit $0 is FREE on any venue
   type; `null` price is FREE only for `public_park`; null on private is UNKNOWN, not free).
3. PR #478 (`e3b2bbe`): `src/lib/priceDisplay.ts` created. Its header records the bug: detail
   screens checked `price !== null` without asking `isFreeVenue`, so an explicit `0` fell into
   the priced branch and printed "$0/hr".
4. PR #480 (`89a5ff4`): two more layers. (a) FREE rollup: pin/card call sites each rolled their
   own `Math.min` over ALL fields, so an unbookable $0 field plus a bookable $50 field showed
   FREE everywhere except the reserve bar; `venuePriceSummary` now mirrors
   `cheapestBookableField`'s candidate set (bookable fields when any exist). (b) Site parity:
   `site/lib/venues.ts` had the identical `pricePerHour != null` ordering bug; `fieldPriceState`
   and `venuePriceState` now check $0 FIRST, with comments citing the app functions.

**Evidence**: headers of `fieldstack-app/src/lib/priceDisplay.ts:1-11` and rollup doc at 38-55;
`site/lib/venues.ts:242-280`; tests in `src/lib/__tests__/priceDisplay.test.ts`. **Status**:
fixed. Rule: never render a price without going through `priceDisplayFor`/`venuePriceSummary`
(app) or `fieldPriceState`/`venuePriceState` (site).

## 9. Scrape exit 1 silently skipped photo enrichment and dedupe (Jul 5)

**Symptom**: a red weekly Scrape run (GitHub Actions run 28731318093, failed 2026-07-05) revealed
that when the scrape step exits 1 (zero-rows guard trip or one failed source), the
photo-enrichment and dedupe steps NEVER RAN for that week. That is severe, not cosmetic: stored
venue photo URIs are keyless short-lived `lh3.googleusercontent.com` links (Google's
no-durable-cache terms); the weekly enrichment run is what re-resolves them, and skipping it lets
photos rot into broken images across the app and site.

**Fix**: PR #469 (`7ab2494`, commit `7883ab1`) put `if: ${{ always() }}` on both follow-on steps.
See `.github/workflows/scrape.yml:57-64` (enrichment, with the rot rationale) and 80-83 (dedupe).
The zero-rows guard itself came from PR #461 (`33f0d0e`, commit `555f8dc`). **Status**: guarded.
Do not remove the `always()` gates; a red scrape step must stay red without suppressing them.

## 10. GOOGLE_PLACES_API_KEY absent from the scrape step env (Jul 5)

**Symptom**: after the google source was registered in `ADAPTERS`, EVERY scheduled scrape run had
the google source fail (fail-soft, so quietly), because the key was set only on the
photo-enrichment step's env block, not the scrape step's.

**Fix**: same PR #469; env added to the "Run scrape (all sources)" step, comment at
`.github/workflows/scrape.yml:46-49`. **Status**: fixed. Lesson: GitHub Actions env is PER STEP;
a secret on one step does nothing for its siblings.

## 11. Toronto ROLLUP_TO suffix duplicates that evaded both dedupe tiers (Jul 5)

**Symptom**: one physical Toronto park appeared as two venues (live-verified pairs, e.g.
"BILL HANCOX PARK" vs "BILL HANCOX PARK - Sports Field Area", pins 17-116m apart).

**Root cause**: Toronto's PFR ArcGIS layer uses inconsistent `ROLLUP_TO` variants for the same
park. Grouping on the raw string split the park; the two resulting venues were far enough apart
in name similarity AND distance to evade both the AUTO and REVIEW dedupe tiers, and the suffix
also broke the CKAN parks-file address join (it carries only bare park names).

**Fix**: `parkKey()` strips the "- Sports Field Area" suffix (case-insensitive regex) before
grouping. Shipped in PR #469 commit `7883ab1`; NOT present in the source's creating commit
`7e2fc71` (PR #467). Comment + function: `apps/api/scripts/scrape/sources/toronto.ts:92-104`.
**Status**: fixed. For the dedupe-tier math this bypassed, see venue-data-reference.

## 12. Booking-history NOT NULL batch poisoning (Jul 5)

**Symptom** (caught in review, shipped as part of PR #480 "booking sync"): after the reserve-bar
rewire made slot-less bookings possible again, one slot-less local booking attempt included in
the sign-in cloud-sync batch upsert would fail its row and ABORT THE WHOLE BATCH, silently losing
every other pending attempt.

**Root cause**: `user_booking_history.start_time` and `duration` are NOT NULL (migration
`supabase/migrations/004_user_data.sql`), but `BookingAttempt.startTime/duration` became nullable
for slot-less attempts. PostgREST batch upserts are all-or-nothing.

**Fix**: `cloudSyncableAttempts()` pure filter (only rows with non-null startTime AND duration
reach the upsert); applied on both the sign-in merge path and `record()`. Slot-less attempts stay
local-only forever rather than lying with a placeholder time. Evidence:
`fieldstack-app/src/lib/bookingHistory.tsx:169-180` (merge), ~239 (record guard), 308-330 (the
filter + warstory docstring); tests added in the same commit `89a5ff4`. **Status**: guarded.

## 13. Playtomic endpoint drift (Jul 4)

**Symptom**: the documented-by-the-community endpoint `playtomic.io/api/v1/tenants` is dead
(redirects/404s). Naive adapter attempts fail before writing anything.

**Ground truth, live-verified 2026-07-04**: the working endpoint, the two valid sport ids,
the loose server-side filter, the ACTIVE-only club URLs, and the measured ZERO GTA tenants
(the expected steady state; do not "fix" a 0-row result) are recorded in the adapter header
(`apps/api/scripts/scrape/sources/playtomic.ts:1-25`). Fact home for those numbers:
venue-data-reference section 2.4 and its `references/source-anatomy.md`; cite, do not restate.

**Evidence**: PR #457 (`b9336f9`, commit `4f97534`). **Status**: fixed/documented. ToS posture
(discovery-only, sparing, clear UA) is owned by docs/scraping.md section 4.4; never route around it.

## 14. Theme flash before hydration gating (Jul 5)

**Symptom**: on cold start, the first visible frame rendered in the OS "system" scheme, then
snapped to the user's persisted light/dark choice one tick later.

**Root cause**: `App.tsx`'s `PersistenceGate` blocked first render on every persisted store
EXCEPT the theme preference, which hydrates from AsyncStorage asynchronously like the rest.
**Fix**: `ThemeProvider` exposes `hydrated`; `PersistenceGate` now includes it in the gate.
Shipped in PR #480 (`89a5ff4`). Evidence: `fieldstack-app/src/theme/useTheme.tsx:26-34` and
`fieldstack-app/App.tsx:317-343`. The site solved the same class of bug differently: an inline
pre-paint script stamps `data-theme` from localStorage (`site/app/layout.tsx`). **Status**: fixed.

## 15. Minor incidents (one-liners with evidence)

| When | What happened | Evidence | Status |
|---|---|---|---|
| Jun 3 | Recovery-redirect commit `7303c88` landed on the wrong in-flight branch with unrelated account-deletion hunks tangled in; reverted the same minute (`5def4ef`), cleanly re-landed as `b7da09a` via PR #279 | all three commits, 02:08-02:13 same night | fixed; lesson: one concern per branch, always |
| Jun 16 | API crashed on missing/malformed `REDIS_URL` during Fly bring-up | PR #367 `5dd1bad`; cache is now strictly best-effort (`apps/api/src/lib/redis.ts`, `cache.ts` swallow all Redis errors) | fixed |
| Jun 18 | App Store submission binary rejected/broken | PR #377 `e6d13b9` (branch fix/376-appstore-binary) | fixed |
| May 26 | Overpass API timeouts killed the OSM scrape | PR #185 `aeb0717`; backoff + per-city queries survive in `sources/osm.ts` | fixed |

## 16. Open wounds (as of 2026-07-05, unresolved; do not report these as fixed)

| Item | Detail | Evidence |
|---|---|---|
| Prod crash reporting gap | Sentry is fully wired (PR #439 `a55f975` forwards ErrorBoundary catches) but no DSN ships in builds; needs a Sentry project + DSN in eas.json + new build. Current status is homed in onside-config-and-flags (known gap 1); check there before reporting this open or closed | grep `SENTRY` in `fieldstack-app/eas.json` |
| Calendar prompt still dead | `promptAddToCalendarOnReturn` (`src/lib/calendar.ts`) has zero importers since May 23; the Jul 5 rewire (incident 7) revived reminders but not this | grep `promptAddToCalendarOnReturn` in `fieldstack-app/src` |
| Split scraper identity | Two User-Agents in one pipeline: Onside-branded in `sources/osm.ts`, legacy FieldStack-branded in `lib/arcgis.ts` and `sources/playtomic.ts`. Unverified which is intended canonical | grep `scraper/1.0` in `apps/api/scripts/scrape` |

## Settled battles (do NOT relitigate without new evidence)

| Ruling | Why (incident) | Enforced at |
|---|---|---|
| npm, not bun, for fieldstack-app installs/CI | 6: bun hoisting diverged the EAS fingerprint and dropped a dep | `.github/workflows/ci.yml:40-44`; e79cfa8 |
| `bun.lock` stays untracked; `package-lock.json` is the lockfile of record everywhere | 6 | `.gitignore:6-8` |
| `tracksViewChanges={true}` permanently on pool markers; NEVER flipped, never set false | 1 + 2: flip crashes, false freezes first rasterization | `ExploreScreen.tsx:102-111` |
| Marker pool is fixed-size (50); slots never unmount, pool never resizes live | 1 (PR #193) | `ExploreScreen.tsx:68, 316-324` |
| Never mix native + JS Animated drivers on one node | 3 (and 1's PR #191) | `PhotoGallery.tsx:265-272` |
| Migrations must apply on a FRESH database; never `CREATE OR REPLACE` across a return-type change (drop first) | 5 | `migrations.yml:34-38` |
| scrape.yml enrichment + dedupe steps keep `if: always()` | 9 | `scrape.yml:57-64, 80-83` |
| Merge commits, not squash (`gh pr merge --merge`); one PR per issue | project change-control rule; all 286 PR merges in history are merge commits | see onside-change-control |
| AsyncStorage keys keep the legacy `@fieldstack/` prefix; renaming orphans user state | rebrand survived it deliberately | see onside-architecture-contract |

## Incident 17: the untracked deploy workflow (2026-07-09)

Symptom: after merging an API change, no deploy runs; prod behavior unchanged; a session searching for the "Fly Deploy" workflow on GitHub finds nothing despite `.github/workflows/fly-deploy.yml` sitting in the working tree.

Root cause: fly-deploy.yml was drafted but never committed. `git ls-files .github/workflows/` lists only ci.yml, migrations.yml, scrape.yml, and `gh api repos/LaithAlz/fieldstack/actions/workflows` returns exactly those three. Every API deploy in this repo's history was a manual `flyctl deploy`. The first skill-library edition and its discovery dossier stated the auto-deploy as fact because the reader trusted the working tree without checking `git ls-files`.

Evidence: `git log --follow -- .github/workflows/fly-deploy.yml` is empty; workflow registry count is 3; migration 026 shipped its behavior to prod via `db:push` alone, proving the read API passes RPC jsonb through without redeploy (live probe 2026-07-09 showed the new `hours` key with no Fly deploy).

Status: documented; deploys are manual. Committing the workflow plus a `FLY_API_TOKEN` secret is an open owner decision (issue #492 footnote). Lesson: a file in the tree is not a fact about the system; verify workflows with `git ls-files` and the GitHub workflow registry before stating deploy behavior.

## Incident 18: git checkout wiped uncommitted agent work (2026-07-11, near miss)

Symptom: after an on-device verification pass, the Explore map silently lost its clustering integration; pins rendered as unclustered singles again with no error anywhere.

Root cause: the coordinator made a temporary zoom-level edit to ExploreScreen.tsx in a worktree carrying UNCOMMITTED agent work, then reverted it with `git checkout <file>`, which restored the file to HEAD and destroyed the agent's entire uncommitted integration along with the temp edit.

Evidence: verification screenshots before and after the wipe in the #498 PR trail; the file was restored from the authoring agent's context and re-verified identical in intent.

Status: recovered same day. Rule: NEVER `git checkout`/`git restore` a file in a worktree holding uncommitted work. Revert temporary instrumentation with an exact-string replace of only what you added, or `git stash push`/`pop` scoped to your own edit. Cost: ~30 minutes plus a full re-verification cycle.

## Incident 19: Vercel dropped the production deploy for a merge (2026-07-12)

Symptom: a site fix (PR #502, day-map hero in light theme) merged with CI green at 07:03 UTC,
but getonside.ca kept serving the old CSS; the owner reported the hero still dark well after
the merge. The live stylesheet still contained the pre-fix rule
(`background: var(--hero-surface)` on `.night-map`).

Root cause: Vercel's GitHub integration created the Preview deployment for the branch push at
07:03:15Z but never created a Production deployment for the main push (merge `99d15c0` at
07:03:28Z, 13 seconds later). Most likely a dropped webhook delivery on Vercel's side; nothing
in the repo caused it and nothing in the repo can prevent it. The failure is silent: CI is
green, the merge is on main, and only the deployments list shows the gap.

Evidence: `gh api repos/LaithAlz/fieldstack/deployments` on 2026-07-12 listed Preview
`4a86a1d` (07:03:15Z) and no Production entry newer than the previous day's `594c794`;
a live-CSS probe (curl the homepage, extract the stylesheet href, grep the chunk for
`.night-map{`) showed the stale rule; empty trigger commit `d4ee59b` ("Trigger site deploy")
produced a successful Production deployment, after which the same probe showed the fixed rule.

Status: fixed by the trigger commit. Rule: after merging a site change, confirm a Production
deployment exists for the merge SHA before concluding anything about the change itself
(command home: onside-run-and-operate, section 5); if none arrives, push an empty commit to
main. Lesson: check what is deployed before debugging what is written.

## How to add an entry

1. Fix first, chronicle second. The entry must cite a MERGED commit hash (from
   `git log --oneline --merges`; branch commit via `git show <merge>^2` if needed).
2. Write the four fields: Symptom (observable, user/CI point of view), Root cause (mechanism, not
   blame), Evidence (commits, PR numbers, file:line of surviving comments or guards), Status.
3. If the fix leaves a rule future sessions must obey, add a Settled battles row AND make sure a
   comment stating the rule survives in the code near the danger (this repo's pattern: the code
   comment is the tripwire, the chronicle is the story).
4. Add the incident to the index table, and a re-verification line to Provenance if anything can drift.
5. Keep incident DETAIL here only; siblings may cite "failure-archaeology incident N" but must not
   duplicate the narrative.
6. House style: no em or en dashes in this file; paraphrase quoted text that contains them.

## Provenance and maintenance

All facts verified against `/Users/laith/code/soccer` at HEAD `99a660d`, 2026-07-05. Run these
from the repo root to re-verify the drift-prone claims:

| Claim | Re-verify with |
|---|---|
| Merge commit for any PR #N | `git log --oneline --merges --grep="#N "` |
| AIRMap constraints comment intact | `grep -n "permanently TRUE" fieldstack-app/src/screens/main/ExploreScreen.tsx` |
| Free-pin alpha trick intact | `grep -n "non-zero alpha" fieldstack-app/src/components/VenuePin.tsx` |
| Gallery JS-driver comment intact | `grep -n "mixing drivers" fieldstack-app/src/components/PhotoGallery.tsx` |
| Migration 019 drop-first guard | `sed -n '1,12p' supabase/migrations/019_venues_within_id_only.sql` |
| Fresh-replay CI guard cites 019 | `grep -n "019" .github/workflows/migrations.yml` |
| npm-not-bun CI comment | `sed -n '40,44p' .github/workflows/ci.yml` |
| always() gates on scrape steps | `grep -n "always()" .github/workflows/scrape.yml` |
| Scrape-step Places key + comment | `sed -n '43,49p' .github/workflows/scrape.yml` |
| parkKey suffix strip | `grep -n "parkKey" apps/api/scripts/scrape/sources/toronto.ts` |
| Playtomic live-API facts header | `sed -n '1,25p' apps/api/scripts/scrape/sources/playtomic.ts` |
| cloudSyncableAttempts guard | `grep -n "cloudSyncableAttempts" fieldstack-app/src/lib/bookingHistory.tsx` |
| Theme gate includes hydrated | `grep -n "themeHydrated" fieldstack-app/App.tsx` |
| Sentry DSN still absent from EAS | `grep -n "SENTRY" fieldstack-app/eas.json` (only DISABLE_AUTO_UPLOAD = still open) |
| Calendar prompt still unwired | `grep -rn "promptAddToCalendarOnReturn" fieldstack-app/src --include="*.ts*"` (1 file = still dead) |
| Failed scrape run that exposed incident 9 | `gh run view 28731318093 --json workflowName,conclusion,createdAt` |
| Price single-sources intact | `grep -n "isFreeVenue" fieldstack-app/src/lib/priceDisplay.ts site/lib/venues.ts` |
| Incident 19 trigger commit on main | `git log --oneline -1 d4ee59b` |

Unverified items are labeled inline: the canonical scraper User-Agent (incident 16) and the
original intent behind the `7303c88` mis-commit (incident 15) are not recoverable from git alone.
