---
name: onside-validation-and-qa
description: >
  What counts as evidence in the Onside repo (GTA soccer-field discovery: Expo app,
  Fastify API + scrape pipeline, Next.js site). Load BEFORE claiming any change is done,
  and whenever you need to know which tests to run or write, what proof a change type
  requires before merge, how to smoke-test a scrape adapter against the live source,
  what the golden regression tests protect, or how to review a large change. Trigger
  phrasings: "is this tested", "what tests should I add", "how do I test this",
  "run the test suite", "CI is green so it is done", "write a test for", "verify the
  scraper still works", "expected venue counts", "add a jest test", "the supabase import
  throws in jest", "review this big change", "pre-merge checklist", "did anyone check
  this on device", "screenshot both themes".
---

# Onside Validation and QA

This skill defines the evidence bar for changes in `/Users/laith/code/soccer`: which
suites exist, what each protects, how to add tests, when tests alone are NOT enough,
and how big changes get reviewed. Process mechanics (branching, PRs, merge rules) live
in `onside-change-control`; incident narratives live in `onside-failure-archaeology`.

Jargon, defined once:
- **bun test**: the test runner bundled with the bun JS runtime; used only by `apps/api`.
- **jest**: the Node test runner used by the Expo app (`fieldstack-app`), via the
  `jest-expo` preset.
- **Adapter**: a scrape source module in `apps/api/scripts/scrape/sources/` exposing
  `{ source, label, run(): Promise<ScrapedVenue[]> }`.
- **Drift guard**: an automated check that fails when a generated file and its source
  of truth disagree.
- **Golden test**: a regression test that pins a specific past incident. Never delete
  one to make a change pass; the incident will come back.

## Rule zero: CI green is necessary, not sufficient

CI runs typecheck, lint, unit tests, and a site build. It runs zero screens, zero
devices, zero live scrape sources. The canonical proof (as of 2026-07-05): the free-venue
map pin passed typecheck, jest, and structural code review, but on a real simulator it
rasterized to an empty annotation image and MapKit silently swapped in its default red
balloon. It shipped correct only because someone ran the app and looked (PR #485, commit
`9d5080e` "Fix map pin rendering found in on-device verification"; the surviving comment
is in `fieldstack-app/src/components/VenuePin.tsx`, free-mode render). Treat that PR as
the standing answer to "the tests pass, why run it?".

## Evidence bar by change type

Meet the row for your change type BEFORE opening the PR. CI enforces only part of this.

| Change type | Minimum evidence |
|---|---|
| Pure logic (lib function, parser, mapper) | Unit test in the correct suite (see inventory below); whole suite green |
| Scrape pipeline (adapter, `run.ts`, `scripts/scrape/lib/*`) | Unit tests green PLUS live adapter smoke (next section) with plausible counts |
| API route or query (`apps/api/src`) | `bun run typecheck` + `bun test` green; new query params get schema tests like `tests/searchQuerySchema.test.ts`; behavior changes exercised against a running local server |
| Schema (`supabase/migrations/*`) | Migrations CI green (fresh-DB apply), or locally `bun run db:reset` from `apps/api` (needs Docker); after merge, prod push is MANUAL: `bun run db:push` (nothing in CI pushes; see `onside-change-control`) |
| App UI (`fieldstack-app` screens/components) | typecheck + lint + jest PLUS on-simulator or on-device verification with screenshots in BOTH themes (see "Eyes on screens") |
| Site (`site/`) | `npm run build` green + token drift check + browser screenshots of affected pages in both themes |
| GitHub workflow (`.github/workflows/*`) | Trigger it (`gh workflow run <file>.yml` where the workflow has `workflow_dispatch`; only `scrape.yml` does) and read the logs, or watch the next scheduled run. Reasoning about YAML is not evidence |
| Design tokens (`design/tokens.json`) | `node design/generate.mjs` rerun, both drift guards green, and a visual pass on app AND site (tokens feed both) |

## Test suite inventory (as of 2026-07-05)

Three projects, three verdicts: api has 11 bun suites (119 tests), app has 21 jest
suites (154 tests, pure logic only), site has NO tests (build is the gate).

### apps/api: bun test, 11 files, 119 tests

```sh
cd /Users/laith/code/soccer/apps/api
bun test              # whole suite, sub-second
bun test dedupe       # positional filter, one file
bun run typecheck
```

`bunfig.toml` scopes bun test to `tests/` so it never picks up the app's jest suites.
CI runs this in the `backend` job of `.github/workflows/ci.yml` (bun, frozen lockfile).

| File | What it pins |
|---|---|
| `tests/cache.test.ts` | `cached()` swallows every Redis failure; points REDIS_URL at a dead port on purpose |
| `tests/redis.test.ts` | invalid/missing REDIS_URL degrades to no caching, never crashes (Fly incident, PR #367) |
| `tests/errors.test.ts` | `ApiError` shape `{statusCode, message, code?}` the global error handler reads |
| `tests/searchKey.test.ts` | search cache-key normalization: coords to 4dp, radius 1dp, arrays sorted |
| `tests/searchQuerySchema.test.ts` | `/search/fields` Zod schema: browse-all defaults, comma lists, lat/lng must pair |
| `tests/venuesQuerySchema.test.ts` | `/venues` schemas: `ids` list rules, UUID validation, filter enums |
| `tests/dedupe.test.ts` | AUTO/REVIEW dedupe tier boundaries, source-priority winner, osm-osm never paired, google-google never auto-merged |
| `tests/monitor.test.ts` | zero-rows guard and write-failure guard semantics, incl. "empty source with no prior rows does not fire" (the playtomic case) |
| `tests/municipal.test.ts` | toronto + brampton mappers; `parkKey` merges ROLLUP_TO suffix variants into one venue (PR #469) |
| `tests/platformLinks.test.ts` | booking URL precedence (field URL > platform deep link > operator booking_url > website) and platform-tag trust rules |
| `tests/playtomic.test.ts` | tenant-to-venue mapping, client-side soccer resource filter, club URL, hours mapping |

### fieldstack-app: jest, 21 suites, 154 tests

```sh
cd /Users/laith/code/soccer/fieldstack-app
npm test                  # whole suite (~3s). npm, NOT bun: see onside-change-control
npx jest priceDisplay     # one suite by name fragment
npm run typecheck && npm run lint
```

All 21 suites live in `src/lib/__tests__/`: analytics, appReady, bookingAction,
bookingHistory, bookingRequests, bookingUrl, datetime, distance, featureFlags (.tsx),
fieldPhotos, filters, freshness, priceDisplay, reserveField, reviewPrompt,
sessionTracking, socialAuth, storage, tokensDrift, venueCache, venueHours.

Honest coverage statement: this is a **pure-logic suite**. There are no screen,
component, navigation, provider, or hook render tests, and no e2e in CI.
`featureFlags.test.tsx` is the only rendering test (react-test-renderer, typed via an
ambient-any shim at `src/types/react-test-renderer.d.ts`; `@types/react-test-renderer`
was deliberately not installed). Everything screens do is verified by humans or agents
on a simulator. That is why the UI evidence bar demands eyes on screens.

### site: no tests

`cd /Users/laith/code/soccer/site && npm run build` is the whole gate, plus the CI
token drift step. The build succeeds even without Supabase env (it warns and renders
zero venues), so a green build does NOT prove venue pages generate; run with
`SUPABASE_URL`/`SUPABASE_ANON_KEY` set (from `site/.env.local`) when data pages matter.
Do not add ad hoc test files here; there is no runner wired to execute them.

## Golden checks: do not weaken these

| Check | Where | Incident it pins |
|---|---|---|
| tokensDrift test | `fieldstack-app/src/lib/__tests__/tokensDrift.test.ts` | hand-edited generated palette vs `design/tokens.json`; fix is `node design/generate.mjs` from repo root, never editing the test |
| Site token drift step | `.github/workflows/ci.yml` site job (regenerates then `git diff --exit-code` over the generated token outputs; path list homed in onside-config-and-flags) | same drift, caught for every generated output at once |
| Booking OFF-path pair | `bookingAction.test.ts` | flag OFF must resolve to operator redirect for BOTH signed-in and signed-out; the in_app_booking flag may never gate existing booking behind sign-in |
| FREE rollup ordering | `priceDisplay.test.ts` | mixed unbookable-$0 + bookable-$50 venue must show "from $50", never FREE; explicit $0 wins before the public-park fallback (PR #480) |
| Batch-filter for cloud sync | `bookingHistory.test.ts` (`cloudSyncableAttempts`) | one slot-less row in the `user_booking_history` upsert batch aborted the WHOLE batch (NOT NULL columns from migration 004), silently losing every other row (PR #480) |
| Dedupe tier boundaries | `apps/api/tests/dedupe.test.ts` | auto-merge thresholds; sibling pitches and facility-vs-tenant pairs must land in REVIEW or nothing, never AUTO |
| Monitor guard semantics | `apps/api/tests/monitor.test.ts` | zero-rows guard must not fire on adapter errors or on sources where empty is the steady state |
| parkKey merge | `apps/api/tests/municipal.test.ts` | Toronto ROLLUP_TO suffix variants split one park into two venues that evaded both dedupe tiers (PR #469) |
| Migrations fresh-apply CI | `.github/workflows/migrations.yml` | migration 019 applied fine incrementally but broke fresh replays (CREATE OR REPLACE across a return-type change); CI boots a fresh Postgres and applies all 25 migrations on any PR touching `supabase/` |

## Live adapter smoke (pipeline changes)

Unit tests cannot catch upstream schema drift (a renamed ArcGIS column, a dead
endpoint). After touching any adapter, `lib/arcgis.ts`, or the `ScrapedVenue` shape,
run the sources live. No DB writes, no env vars needed:

```sh
bun /Users/laith/code/soccer/.claude/skills/onside-validation-and-qa/scripts/smoke-adapters.ts
```

Expected output, live-verified 2026-07-05 (each source finished in under 2s):

```
mississauga: 140 venues / 237 fields
toronto:     135 venues / 229 fields
brampton:     91 venues / 195 fields
```

Reading the numbers:
- Within roughly 10 percent of the above: normal municipal drift, proceed.
- Zero rows or a huge drop: upstream schema drift or endpoint death. Fetch the raw
  endpoint (URLs are constants at the top of each adapter) and diff the property
  names before changing any code.
- `--playtomic` flag adds the Playtomic source. Expected result: **0 venues, and 0 is
  correct**. Playtomic is padel-dominant in the GTA today; the adapter exists so a
  future adopter surfaces automatically (header of
  `apps/api/scripts/scrape/sources/playtomic.ts`). It hits an undocumented consumer
  API, so run it sparingly.
- The `google` source is excluded (paid quota; needs `GOOGLE_PLACES_API_KEY`) and `osm`
  is excluded (Overpass is slow and rate limited; be polite). Test those by dispatching
  the weekly workflow instead: `cd /Users/laith/code/soccer && gh workflow run scrape.yml`
  then `gh run watch`, which also needs repo secrets and WRITES TO PROD, so treat it as
  a deliberate act, not a test run (see `onside-run-and-operate`).

A full `bun run scrape -- <source>` from `apps/api` also works as a smoke but requires
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and upserts into the real database.
Default to the read-only script above.

## Eyes on screens: UI verification

For any change a user can see, run it and capture proof. "Both themes" is mandatory:
the palette pairs in `design/tokens.json` are not mirror images (onBrand flips to
near-black in dark, heroSurface is navy in both), so one-theme checks miss real bugs.

App (simulator or device):
1. `cd /Users/laith/code/soccer/fieldstack-app && npm start` and open the app in a
   simulator. Expo Go renders the map: react-native-maps is bundled in Expo Go on
   both platforms (`fieldstack-app/README.md`; the `.maestro/screenshots.yaml`
   header claims otherwise, a documented unresolved conflict adjudicated in
   onside-build-and-env, "Expo Go vs a dev build"). A dev build is required only
   for `onside://` deep links and the screenshots.yaml flow (its
   `appId: app.onside.mobile` targets the real binary).
2. Drive the changed flow by hand or via tooling. Toggle Settings > Appearance between
   Light and Dark and screenshot the changed screens in each.
3. Watch for the known silent failures: map pins falling back to red balloons,
   FREE/price mismatches between pin, card, and reserve bar, theme flash on cold start.

Maestro flows at `/Users/laith/code/soccer/.maestro/` (local only, never CI; macOS
runner cost is documented in `.maestro/README.md`):
- `screenshots.yaml`: App Store screenshot capture, updated 2026-07-05 for the current
  Explore UI; needs a dev build. Run: `maestro test .maestro/screenshots.yaml`.
- `smoke.yaml`: STALE as of 2026-07-05. Last touched 2026-05-14; it asserts a
  "Pick a time" header and a Search tab that no longer exist after the Explore rebuild
  (PR #474). Expect it to fail against current UI; fixing it is open work, do not treat
  its failure as a regression in your change.

Site: `cd /Users/laith/code/soccer/site && npm run dev`, then screenshot affected pages
in light and dark (the toggle in the nav stamps `data-theme`; also check the OS-level
`prefers-color-scheme` path since both selectors are generated). Browser automation
(e.g. Playwright tooling available to agent sessions) is fine; there is no repo-shipped
site screenshot script.

## Adding tests: placement, naming, patterns

**apps/api**: create `apps/api/tests/<topic>.test.ts`. Import the runner explicitly:
`import { describe, expect, it } from "bun:test";`. Two house patterns:
- Modules whose import graph reaches `src/lib/supabase.ts` throw at import time without
  env. Set dummies first, then dynamic-import:
  ```ts
  process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
  const { SearchFieldsQuery } = await import("../src/routes/search.js");
  ```
  (snippet from `tests/searchQuerySchema.test.ts`; `tests/searchKey.test.ts` uses the
  same env-dummies-then-dynamic-import pattern). Note the `.js` extension on TS imports (ESM).
- Never point tests at a real Redis or network; `tests/cache.test.ts` uses a dead local
  port so failure paths are exercised deterministically.

**fieldstack-app**: create `src/lib/__tests__/<module>.test.ts` (`.tsx` only if it
renders). jest picks up `**/__tests__/**/*.test.(ts|tsx)`. House patterns:
- Any module importing `../supabase` (directly or via `./auth`) needs the stub, because
  supabase-js pulls native WebSocket that Node's jest env lacks:
  ```ts
  jest.mock("../supabase", () => ({ supabase: {} }));
  ```
  Put it above or below the import; babel-jest hoists it (see
  `bookingHistory.test.ts`, `bookingRequests.test.ts`, `socialAuth.test.ts`).
- AsyncStorage is already mocked globally in `jest.setup.ts` (official in-memory mock).
- Testing screen behavior? First extract the decision into a pure function in
  `src/lib/` and test that (the `bookingAction.ts` / `priceDisplay.ts` pattern). The
  repo has no screen-render harness; do not introduce one casually.

**site**: no runner exists. Encode invariants as build-time failures or push shared
logic into the app's tested libs; the price-state logic in `site/lib/venues.ts`
deliberately mirrors the app's tested `priceDisplay.ts` (comments cross-reference it).

Every regression fix gets a test in the same PR, with a comment naming the failure it
pins (see the header style of `bookingAction.test.ts`). That comment is what stops a
future session from deleting it.

## Review protocol for big changes

For multi-file features (a new adapter, a screen rebuild, a data-layer change), run a
structured adversarial review before merge. Precedents: PR #469 (commit `7883ab1`,
"Fix end-to-end review findings across scrape pipeline") and PR #480 (`89a5ff4`,
"Matchday review fixes"), both of which were review-findings batches that caught
shipped bugs unit tests had missed.

1. **Lens one, runtime correctness**: walk each changed file asking "what input or
   state makes this line wrong?" Hunt nulls, empty arrays, batch aborts, error paths,
   and off-by-one grouping (the parkKey split and the booking-history batch abort were
   both found this way).
2. **Lens two, cross-cutting consistency**: check the change against the system's
   invariants: app vs site parity (price/FREE logic), generated files vs sources,
   both themes, RLS assumptions, workflow step gating, external obligations
   (attribution, no Places content caching; see `onside-external-positioning`).
3. Every finding must state a **concrete failure scenario** (inputs, state, wrong
   output). "This looks fragile" is not a finding; park vague unease as a question.
4. Fix findings as a normal change: branch, PR titled after the review (the
   `fix/468-review-findings` pattern), tests pinning each confirmed bug, CI green,
   merge commit. Review findings never bypass `onside-change-control`.

## Pre-merge checklist

Run down this list before `gh pr merge`:

- [ ] The evidence-bar row for this change type is satisfied (not just CI).
- [ ] New logic has tests in the right suite; regression fixes have a pinning test
      with a comment naming the incident.
- [ ] No golden check was deleted, skipped, or loosened to make the change pass.
- [ ] UI change: screenshots of both themes exist and were actually looked at.
- [ ] Pipeline change: live smoke counts recorded in the PR body.
- [ ] Migration: Migrations CI ran on the PR (it only triggers on `supabase/` paths)
      and the post-merge `bun run db:push` step is planned.
- [ ] Tokens change: generator rerun, three generated files committed together.
- [ ] CI green on the PR head commit (`gh pr checks <n> --watch`), then merge per
      `onside-change-control` (merge commit, no squash).

## When NOT to use this skill

- Deciding how to branch, commit, gate, or merge a change: `onside-change-control`.
- Diagnosing a failure you can already see (crash, wrong data, red CI): 
  `onside-debugging-playbook`; for "has this broken before?", `onside-failure-archaeology`.
- Setting up a machine or fixing installs/builds: `onside-build-and-env`.
- Running or deploying things (scrape runs, Fly deploys, EAS builds): `onside-run-and-operate`.
- Measuring performance or data quality with numbers: `onside-diagnostics-and-tooling`.
- Env vars, secrets, and feature-flag wiring: `onside-config-and-flags`.
- Domain theory behind dedupe thresholds and GIS sources: `venue-data-reference`.

## Provenance and maintenance

All facts verified against the repo on 2026-07-05 (HEAD at that date). Re-verify with:

- API suite count/pass: `cd /Users/laith/code/soccer/apps/api && bun test` (expect "119 pass ... 11 files" to grow, never shrink).
- App suite count/pass: `cd /Users/laith/code/soccer/fieldstack-app && npm test` (expect "21 passed" suites, "154 passed" tests, or more).
- Site has no test script: `grep '"test"' /Users/laith/code/soccer/site/package.json` (expect no output).
- Adapter smoke counts: `bun /Users/laith/code/soccer/.claude/skills/onside-validation-and-qa/scripts/smoke-adapters.ts` (update the expected numbers here AND in the script header when they drift).
- Golden test files still exist: `ls /Users/laith/code/soccer/fieldstack-app/src/lib/__tests__/ /Users/laith/code/soccer/apps/api/tests/`.
- CI shape (jobs, drift step): `cat /Users/laith/code/soccer/.github/workflows/ci.yml`.
- Migrations CI trigger paths: `sed -n '1,20p' /Users/laith/code/soccer/.github/workflows/migrations.yml`.
- smoke.yaml staleness: `git -C /Users/laith/code/soccer log -1 --format='%h %ad' --date=short -- .maestro/smoke.yaml` (stale while it predates PR #474, merged 2026-07-05; delete the staleness note if the flow gets rewritten).
- PR #485 on-device story: `git -C /Users/laith/code/soccer show --stat 9d5080e`.
- Migration count (25 as of 2026-07-05): `ls /Users/laith/code/soccer/supabase/migrations/ | wc -l`.
