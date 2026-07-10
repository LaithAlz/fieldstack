---
name: onside-debugging-playbook
description: Symptom-to-triage playbook for the Onside repo (soccer). Load when something is broken and you need the first discriminating check, ranked causes, and the fix pointer. Covers app symptoms (red MapKit balloon pins, frozen or stale map pins, crash on map interaction, gallery crash, theme flash on launch, stuck splash, Expo Go cannot reach API, empty Explore list, Open-now chip wrong), API and pipeline symptoms (weekly Scrape workflow red, a source returns 0 venues, venue photos broken, migration push fails, /health 503, duplicate venues), site symptoms (getonside.ca shows old content, build green but venue pages missing), and CI symptoms (Migrations job fails, token drift step fails). Also load before touching MapView markers, Animated drivers, AsyncStorage keys, or scrape adapters, to avoid re-triggering settled incidents.
---

# Onside debugging playbook

Symptom-first triage for the four surfaces of this repo. Find your symptom in the table for the right surface, run the first check, then follow the fix pointer. Facts date-stamped (as of 2026-07-05) can drift; see Provenance at the end.

## First 60 seconds

Work out which surface you are on before anything else:

- [ ] Symptom on a phone/simulator (pins, sheets, theme, splash, empty lists): Surface 1 (app). Confirm whether it reproduces in Expo Go AND in a production build; that split discriminates env/EAS problems from code problems.
- [ ] Data wrong or missing everywhere (app AND site show it): Surface 2 (API/pipeline). Data bugs that appear in both clients are upstream, in Supabase rows or the scrape.
- [ ] getonside.ca only: Surface 3 (site). Remember the site bakes data at build time; "stale" is usually "not redeployed".
- [ ] A GitHub check is red: Surface 4 (CI). Read WHICH step failed before touching code.

Fast health checks (run from anywhere, safe, read-only):

```bash
# Is the production API and its Supabase dependency up?
curl -s https://api.getonside.ca/health

# Recent runs of each workflow (run from /Users/laith/code/soccer)
gh run list --workflow=scrape.yml --limit 5
gh run list --workflow=migrations.yml --limit 5
gh run list --workflow=ci.yml --limit 5

# Failed-step logs for one run
gh run view <run-id> --log-failed

# Latest Vercel deploys of the site (Vercel mirrors them into GitHub deployments)
gh api 'repos/LaithAlz/fieldstack/deployments?per_page=5' --jq '.[] | .environment + " " + .created_at'
```

Jargon used below, defined once:

- **Fabric interop**: React Native New Architecture's compatibility layer for old-architecture native components. `react-native-maps` (whose iOS native side is called **AIRMap**) runs through it in this app and is the source of a whole crash family.
- **Expo Go**: the dev sandbox app; loads JS from **Metro** (the dev bundler on your laptop) over LAN.
- **EAS**: Expo Application Services, the cloud build/submit system. Env per build profile lives in `fieldstack-app/eas.json`.
- **RLS**: Postgres Row Level Security. The API reads with the anon key through RLS; the scraper writes with the service role key, which bypasses it.
- **lh3 URIs**: keyless `lh3.googleusercontent.com` photo URLs from Google Places. Google marks them short-lived; they expire and must be re-resolved weekly.

## When NOT to use this skill

- Setting up an environment from scratch, or a build fails before anything runs: `onside-build-and-env`.
- Deploying, running services, data conventions: `onside-run-and-operate`.
- You want the full narrative of an incident (this file gives one paragraph per trap): `onside-failure-archaeology`.
- You need to measure (profiling, query timing, log analysis scripts): `onside-diagnostics-and-tooling`.
- Config axes, env matrices, secrets names, flag resolution: `onside-config-and-flags`.
- Architecture invariants and why they exist: `onside-architecture-contract`.

## Surface 1: iOS app (`fieldstack-app/`, Expo SDK 54, RN 0.81, New Architecture ON)

| Symptom | First discriminating check | Likely causes, ranked | Fix pointer |
|---|---|---|---|
| Map pins render as default red MapKit balloons instead of custom pins | Read the comment block at `fieldstack-app/src/components/VenuePin.tsx` (search `rasterizes`). Does the new/changed pin mode have a fully transparent root View or a bare tinted dot? | 1. A pin variant's root View is fully transparent, so it rasterizes to an empty annotation image under Fabric interop and MapKit falls back to its default balloon. 2. Pin content is a bare dot in a mostly transparent hit area (same failure). | Give the root View `backgroundColor: "rgba(0, 0, 0, 0.01)"` (any non-zero alpha keeps the snapshot real) and render a glyph, not a bare dot. Pattern: `styles.freeHitArea` in `VenuePin.tsx`. Verified on-simulator per those comments; re-verify on device (PR #485 fixed a pin bug found only on device). |
| Pins frozen: placeholder teardrops persist, or a pin shows another venue's price after filtering | `grep -n "tracksViewChanges" fieldstack-app/src/screens/main/ExploreScreen.tsx` (run from repo root). It must read `tracksViewChanges={true}` with the long comment above `VenueMarkerSlot`. | 1. Someone set `tracksViewChanges={false}`: freezes each marker's FIRST rasterization, and this screen mounts its pool before search resolves, so pins stay placeholders and slot reassignment shows stale prices. 2. Someone made it flip dynamically: that corrupts AIRMap's subview index under Fabric interop and crashes. | Restore permanent `true`. It is never flipped, by standing decision; marker children are memoized to keep idle cost low. History: 7-PR crash saga ending PR #193. |
| Native crash on map interaction (select pin, filter change, pan) | `grep -n "MAX_MARKERS" fieldstack-app/src/screens/main/ExploreScreen.tsx`. Confirm the fixed pool invariant still holds: slot count constant, inactive slots at lat/lng 0,0 with `opacity` 0 but still mounted. | 1. A change makes Marker children of MapView mount or unmount (conditional render, list keyed by data, pool resized at runtime). 2. `tracksViewChanges` flipping (above). 3. Mixed animation drivers on the selection ring (see next row). | Restore the always-mounted 50-slot pool (`MAX_MARKERS = 50`, commit `95ed4eb`, PR #193). Overflow is handled by a "Showing 50 of N venues" banner, not more markers. |
| Crash on the second pass of any small animation (gallery dots, selection ring) | Read the `Dot` comment in `fieldstack-app/src/components/PhotoGallery.tsx` (search `JS driver`). Check every `Animated.parallel`/`timing` pair on one node for mixed `useNativeDriver` values. | Mixing native and JS drivers on the same `Animated.View`: the native driver claims the node on first run, the next JS-driven update on that node throws. Latent until the animation actually runs twice (the gallery bug hid until venues had 2 or more photos). | Set `useNativeDriver: false` on BOTH tweens (width is not native-eligible anyway). Issue #454, PR #455, commit `a55c7d9`. |
| Theme flashes wrong scheme for one frame on cold start | Read `PersistenceGate` in `fieldstack-app/App.tsx` (search `themeHydrated`). Every persisted provider must report hydrated before children render; theme is deliberately included. | A new persisted provider (or theme) renders before its AsyncStorage hydration completes and is not wired into `PersistenceGate`. | Add the provider's `hydrated` flag to `PersistenceGate`'s gate condition in `App.tsx`. |
| Stuck on splash screen (production build) | Does it repro in Expo Go with the same env? If EAS-build-only: check `fieldstack-app/eas.json` env blocks for the profile, then module-load paths for anything that can throw at import. | 1. Missing `EXPO_PUBLIC_*` env in the EAS profile combined with an import-time throw (both `src/lib/supabase.ts` and `src/api/client.ts` are hardened to warn-and-fallback instead; keep new modules the same). 2. Native module version drift vs SDK 54. 3. npm vs bun hoisting divergence (see Traps). | Splash-stuck cluster PRs #409 to #429. A hard timeout in `App.tsx` force-hides the splash after 3.5s, so a modern stuck-splash is really a blank-render bug behind it. Note: prod crash reporting may be off (the Sentry DSN gap; status home: onside-config-and-flags, known gap 1), so expect to repro locally. |
| Expo Go on a phone cannot reach Metro or the local API | `cat fieldstack-app/.env` (from repo root): `EXPO_PUBLIC_API_URL` must be `http://<your LAN IPv4>:3000`, NOT `localhost` or `127.0.0.1` (those point at the phone itself). Then from the laptop: `curl -s http://<that-ip>:3000/health`. | 1. Stale LAN IP after switching Wi-Fi (the `prestart` hook `scripts/sync-api-url.js` rewrites it on every `npm start`; it refuses to touch the file when it cannot find a usable IP, e.g. flight mode). 2. Phone on a different network. 3. Local API not running (`cd apps/api && bun run dev`; it listens on 0.0.0.0:3000 by default). | Re-run `npm start` in `fieldstack-app/` (triggers sync-api-url), or edit `.env` by hand. |
| Explore list empty ("No fields here") or shows the "Showing saved results since we couldn't reach the server" banner | `curl -s https://api.getonside.ca/health` (or your `EXPO_PUBLIC_API_URL` host). Expect `{"data":{"supabase":"ok","redis":"ok"},"error":null}`. | 1. Wrong `EXPO_PUBLIC_API_URL` host in dev (previous row). 2. API down on Fly (app `onside-api-wild-current-9606`). 3. Health returns 503: Supabase is the hard dependency; `redis":"error"` alone still returns 200 and is fine (cache is best-effort). 4. Genuinely zero results for the filters (banner absent, map fine). | Fly status/deploy: `onside-run-and-operate`. The stale-results banner means the 24h `searchResultsCache` kicked in. |
| Open-now chip seems wrong for a specific venue | Check whether that venue HAS hours: `curl -s "https://api.getonside.ca/search/fields?lat=<lat>&lng=<lng>&radius_km=1" \| python3 -c "import json,sys; [print(r['venue']['name'], r['venue'].get('hours')) for r in json.load(sys.stdin)['data']]"` | Since migration 026 (2026-07-09) the search projection includes `hours`; venues WITH hours evaluate exactly, venues WITHOUT hours fall back to the default 06:00 to 23:00 window. Wrong chip for an hours-bearing venue means bad scraped hours data, not plumbing. | Bad hours: fix at the source (scrape/operator data). Missing hours: coverage problem, see onside-research-frontier P1. |
| User state (saves, history, theme) silently gone after a refactor | `grep -rn "@fieldstack/" fieldstack-app/src/lib/ fieldstack-app/src/theme/` and diff key names against your change. | An AsyncStorage key was renamed. All keys keep the pre-rebrand `@fieldstack/` prefix on purpose; there is no key-migration layer, so renaming orphans every user's persisted state. | Never rename keys. If a shape changes, migrate in the reader (pattern: `bookingHistory.tsx` backfill). |

## Surface 2: API + scrape pipeline (`apps/api/`)

| Symptom | First discriminating check | Likely causes, ranked | Fix pointer |
|---|---|---|---|
| Weekly Scrape workflow red | From repo root: `gh run list --workflow=scrape.yml --limit 5`, then `gh run view <id> --log-failed \| grep -iE "guard\|FAILED"`. The run summary block discriminates three cases. | 1. Adapter line reads `FAILED` with an error: that source threw (endpoint drift, missing key). 2. `ZERO-ROWS GUARD`: source returned 0 venues but the DB already has 5 or more active for that prefix, i.e. a source went silently empty. 3. `WRITE-FAILURE GUARD`: fetched more than 0 but upserted 0 venues, i.e. systemic write failure (schema drift after a lagging migration, RLS change). | Guards live in `apps/api/scripts/scrape/lib/monitor.ts`; exit logic in `scripts/scrape/run.ts`. IMPORTANT: the photo-enrichment and dedupe steps run `if: always()`, so a red scrape does NOT mean photos rotted or dedupe was skipped. Check their step logs in the same run. |
| One source returns 0 venues | Run it alone locally: `cd /Users/laith/code/soccer/apps/api && bun run scrape -- <slug>` (slugs via `bun run scrape -- list`; needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env`, plus `GOOGLE_PLACES_API_KEY` for `google`). | 1. Endpoint drift. Precedent: the Playtomic endpoint died and moved (header of `sources/playtomic.ts`; fact home: venue-data-reference section 2.4). 2. Portal schema/query change: ArcGIS reports bad `where`/renamed fields as HTTP 200 with an error body, and `lib/arcgis.ts` deliberately throws on those, so this shows as FAILED, not zero. 3. Expected steady state: playtomic in the GTA measures 0 soccer/futsal tenants (as of 2026-07); brand-new or expected-empty sources never trip the zero guard (`ZERO_GUARD_MIN = 5`). | Fix the adapter under `apps/api/scripts/scrape/sources/`. Re-verify endpoints against the live service before changing code. |
| Venue photos broken/missing in app and site | `gh run list --workflow=scrape.yml --limit 5` from repo root: has "Enrich venue photos" succeeded within the last week? | Stored photo URLs are short-lived lh3 URIs (Google's terms); if weekly enrichment stops, they expire and photos rot. This is exactly why the step is `if: always()` in `scrape.yml`. | Trigger manually: `gh workflow run scrape.yml` from repo root. Logic: `apps/api/scripts/scrape/enrichPhotos.ts` (stored `google_place_id` short-circuits paid re-resolution; dead ids are replaced or cleared, never terminal). |
| Migration fails to apply (Migrations CI job, or `bun run db:push`) | Read the SQL error in the job log or push output. Is a function's return type changing? | 1. `CREATE OR REPLACE FUNCTION` with a changed return type: Postgres forbids it. 2. Non-idempotent DDL replayed on a fresh stack. | Add `drop function if exists <fn>(<arg types>);` before recreating (the migration 019 story; see `supabase/migrations/019_venues_within_id_only.sql` header). The Migrations workflow exists to catch exactly this: it boots a fresh local stack and applies every migration from scratch. |
| `/health` returns 503 | `curl -s https://api.getonside.ca/health` and read which component is `"error"`. | Supabase check failed (HEAD count on `operators`): that is the hard dependency and the only 503 trigger. Redis `"error"` with HTTP 200 is degraded-but-fine. | `apps/api/src/routes/health.ts`. Supabase project ref `hjvaoshvvjfygfeuzrfh`. |
| google source fails on every SCHEDULED run but works locally | Check the failing step's env block in `.github/workflows/scrape.yml`. | `GOOGLE_PLACES_API_KEY` present on the enrichment step but missing from the "Run scrape" step. This exact miss made every scheduled run fail once google was registered (observed in run 28731318093, fixed PR #469; a warning comment now sits in scrape.yml). | Keep the key on BOTH steps. |
| Duplicate venues (same park twice on the map) | Dry-run the dedupe pass: `cd /Users/laith/code/soccer/apps/api && bun scripts/scrape/dedupe.ts` and look for the pair in AUTO or REVIEW output. | 1. Pair evades both tiers (name AND distance too far apart). Precedent: Toronto's inconsistent `ROLLUP_TO` values split one park into two venues 17 to 116m apart; fixed upstream by `parkKey()` normalization in `sources/toronto.ts`, not by loosening dedupe. 2. Pair is in REVIEW tier: it is printed, never auto-applied; a human decides. | Prefer fixing grouping in the source adapter over loosening `lib/dedupe.ts` thresholds. Apply: `bun scripts/scrape/dedupe.ts --apply` (AUTO tier only; soft-delete via `is_active:false, duplicate_of`, reversible). |
| Google-scraped noise (academies, clubs with no facility) reappears after a scrape | Was `refine` re-run after the google scrape? | Re-scraping upserts everything active again, wiping the previous refine pass. This is by design; refine must re-run after every google scrape. | `cd /Users/laith/code/soccer/apps/api && bun run scrape:refine` (dry-run), then `bun run scrape:refine -- --apply`. Hand-audited keeps go in `ALLOWLIST` inside `scripts/scrape/refine.ts`. |

## Surface 3: Marketing site (`site/`, Next.js on Vercel, getonside.ca)

| Symptom | First discriminating check | Likely causes, ranked | Fix pointer |
|---|---|---|---|
| Live site shows old content or stale venue data | From repo root: `gh api 'repos/LaithAlz/fieldstack/deployments?per_page=5' --jq '.[] \| .environment + " " + .created_at'` (Vercel surfaces deploys as GitHub deployments). Compare newest Production timestamp to your merge time. Then hard-refresh (CDN cache). | 1. No Production deploy since the merge (Vercel deploys on push to main; check the Vercel dashboard if the API shows nothing recent). 2. CDN cache on your browser/edge. 3. NOT a bug: venue data is fetched from Supabase at BUILD time only (`site/lib/venues.ts` module-level cache), so new scraped venues appear only after the next deploy. | Redeploy from the Vercel dashboard, or push any commit to main. |
| Build green but venue/city pages missing or empty | Build logs for the warning `[venues] SUPABASE_URL / SUPABASE_ANON_KEY not set, skipping venue pages`. | Missing Supabase env at build time. This is DELIBERATE empty-but-green behavior (`site/lib/venues.ts` returns an empty list with a warning so CI can build without secrets). On Vercel it means the env vars vanished or were never set for that environment. | Set `SUPABASE_URL` + `SUPABASE_ANON_KEY` in Vercel project env, redeploy. Locally they live in `site/.env.local`. |
| A venue or city URL 404s | Does the venue exist and is it `is_active` in Supabase? Is the city's venue count at least 3? | 1. `dynamicParams = false` on both `[slug]` and `[city]` routes: anything not in `generateStaticParams` at build time 404s. 2. City pages only generate for cities with 3 or more venues (`CITY_PAGE_MIN_VENUES`). Known corollary: venue-page breadcrumbs link to the city page unconditionally, so venues in 1-2-venue cities carry a breadcrumb that 404s. | Redeploy after data changes; the min-venues threshold is in `site/lib/venues.ts`. |
| Site theme toggle glitches | Check localStorage key `onside-theme` and the inline no-flash script in `site/app/layout.tsx`. | The toggle stamps `data-theme` on `<html>`; generated `site/app/tokens.css` must keep both the media-query block and the explicit `:root[data-theme=...]` overrides. Hand-editing tokens.css breaks this (it is generated; see CI row below). | Edit `design/tokens.json`, run `node design/generate.mjs` from repo root. |

## Surface 4: CI (`.github/workflows/`)

| Symptom | First discriminating check | Likely causes, ranked | Fix pointer |
|---|---|---|---|
| Migrations job red | `gh run view <id> --log-failed` from repo root. Which step? "Apply all migrations" with a SQL error is real. A failure while `supabase start` is still pulling Docker images is infrastructure. | 1. A migration cannot apply to a fresh database (the 019 class: return-type change without drop-first; non-idempotent DDL). 2. Image-pull or registry flake during `supabase start` (UNVERIFIED in this repo's run history as of 2026-07-05: every Migrations run to date is green; treat a non-SQL failure as a flake, rerun once, and only dig if it repeats). 3. "Check remote for unapplied migrations" fails: the linked prod project is missing merged migrations; someone forgot the manual `bun run db:push` (run from `apps/api/`). | Fix the SQL for case 1; push for case 3. Nothing in CI ever pushes migrations to prod; the drift check only detects. |
| Site job fails at "Check design tokens are in sync" | The step output is a `git diff` of generated files. | Someone edited `design/tokens.json` without regenerating, or hand-edited a generated file (`fieldstack-app/src/theme/palette.ts`, `site/app/tokens.css`, `site/lib/tokens.generated.json`). The mobile job's `tokensDrift.test.ts` fails for the same root cause. | From repo root: `node design/generate.mjs`, then commit tokens.json AND all generated outputs together. Never hand-edit generated files (output list: onside-config-and-flags). |
| Mobile job dependency weirdness (works locally with bun, fails in CI/EAS) | Confirm you installed with npm in `fieldstack-app/` (`npm ci`), not bun. | bun's node_modules hoisting diverges from npm's and broke EAS builds (onside-failure-archaeology incident 6). Mobile CI is unified on npm to match EAS, by standing decision (PR #429). | Use npm for `fieldstack-app`, always. `package-lock.json` is the lockfile of record repo-wide; `bun.lock` is gitignored and must never be committed. |
| Backend job lockfile failure | `bun install --frozen-lockfile` resolves from the tracked `package-lock.json`. | A dependency change without updating `apps/api/package-lock.json`, or an accidentally committed `bun.lock`. | Regenerate package-lock.json with npm, commit it; delete any committed bun.lock. |

## Local reproduction cheat sheet

Commands assume the repo at `/Users/laith/code/soccer`. Each of the three packages has its OWN `node_modules` (no workspace root); install per directory.

```bash
# API dev server (Fastify on 0.0.0.0:3000; needs apps/api/.env from .env.example)
cd /Users/laith/code/soccer/apps/api && bun install && bun run dev

# API tests and typecheck (bun runs tests; the server itself runs under Node/tsx)
cd /Users/laith/code/soccer/apps/api && bun run typecheck && bun run test

# App in Expo Go (npm ONLY here; prestart rewrites EXPO_PUBLIC_API_URL to your LAN IP)
cd /Users/laith/code/soccer/fieldstack-app && npm ci && npm start

# App unit tests (pure-logic suites in src/lib/__tests__/; no screen/e2e tests exist)
cd /Users/laith/code/soccer/fieldstack-app && npm test

# Site locally (venue pages need SUPABASE_URL + SUPABASE_ANON_KEY in site/.env.local)
cd /Users/laith/code/soccer/site && npm ci && npm run dev

# One scrape source against whatever DB apps/api/.env points at (service role: BE SURE which DB)
cd /Users/laith/code/soccer/apps/api && bun run scrape -- list
cd /Users/laith/code/soccer/apps/api && bun run scrape -- osm

# Fresh local Supabase stack: applies all 25+ migrations from scratch, catches 019-class bugs
cd /Users/laith/code/soccer/apps/api && bun run db:start

# Regenerate design-token outputs after editing design/tokens.json
cd /Users/laith/code/soccer && node design/generate.mjs
```

## Traps: settled battles, do not reopen

Each trap cost real time. The full narratives live in `onside-failure-archaeology`; these paragraphs are the minimum to stop you from re-fighting them.

1. **AIRMap marker mount/unmount and tracksViewChanges** (7 PRs, May 14 to Jun 2, 2026). Map pins crashed natively under Fabric interop through five attempted fixes before PR #193 landed the standing invariant: a pre-allocated fixed pool of 50 always-mounted Markers, with `tracksViewChanges` permanently true. Cost: roughly two weeks of intermittent production crashes. The invariant is homed in onside-architecture-contract section 10; the full war and its sequel are onside-failure-archaeology incidents 1 and 2. Any PR that conditionally renders a Marker, keys markers by data, or touches `tracksViewChanges` is reopening this.

2. **Mixed Animated drivers** (issue #454, PR #455). The gallery's active-dot animation used the native driver for opacity and the JS driver for width on the same node. The crash was latent for weeks because dots only render with 2+ photos, and venues only got multiple photos when Google photo enrichment shipped. Lesson: a driver mix is a time bomb whose timer is data growth; audit both tweens on any shared node.

3. **bun vs npm for the mobile app** (PRs #409 to #429, Jun 18 to 24, 2026). Production builds stuck on splash from several stacked causes; the root was bun-vs-npm hoisting divergence on EAS (full mechanism: onside-failure-archaeology incident 6). Mobile is npm-only now, matching EAS. Cost: a multi-day launch-window fire drill. Do not "modernize" fieldstack-app to bun.

4. **exit-1 suppressing load-bearing steps** (PR #469). The scrape step exits 1 when a guard trips, and that used to skip photo enrichment and dedupe. Photo refresh is not polish: lh3 URIs expire, so skipping it rots every photo in the product. Both steps now run `if: always()`. If you add a step to `scrape.yml` that must survive a red scrape, it needs the same.

5. **NOT NULL batch abort in cloud sync** (fixed PR #480). `user_booking_history.start_time/duration` are NOT NULL, but slot-less local booking attempts have null for both. One such row in a batch upsert aborted the WHOLE batch, silently losing every other pending row. The fix filters to cloud-syncable rows before upsert (`bookingHistory.tsx`). Lesson for any new sync surface: one bad row must not take down the batch; filter or chunk.

6. **CREATE OR REPLACE across return types** (migration 019, PRs #323/#325). Postgres forbids `create or replace` across a return-type change; fresh replays broke while the already-migrated prod looked fine. Rule: drop-first. The Migrations CI workflow exists because of this exact bug (full story: onside-failure-archaeology incident 5).

7. **Transparent views rasterize to nothing** (PR #485, found in on-device verification). A MapKit annotation is a rasterized snapshot of its React view; a fully transparent root produces an empty image and MapKit substitutes its default red balloon. The 0.01-alpha background in VenuePin is load-bearing, not a typo.

8. **ArcGIS lies with HTTP 200** (in `lib/arcgis.ts` since PR #467/#469). ArcGIS REST reports query errors (renamed field, moved layer, bad where-clause) as HTTP 200 with an error body. Without the explicit throw, a broken municipal source looks like a clean zero-row day and only the zero-rows guard would eventually notice. Keep the 200-with-error check in any new ArcGIS-based adapter.

## Provenance and maintenance

All claims verified against the repo at 2026-07-05 (HEAD after PR #488) plus live `gh` queries. One-line re-verification per volatile fact:

- Pin/pool/tracksViewChanges invariants: `grep -n "MAX_MARKERS\|tracksViewChanges" fieldstack-app/src/screens/main/ExploreScreen.tsx` and `grep -n "0.01" fieldstack-app/src/components/VenuePin.tsx`
- Animation driver comments: `grep -n "useNativeDriver" fieldstack-app/src/components/PhotoGallery.tsx`
- PersistenceGate includes theme: `grep -n "themeHydrated" fieldstack-app/App.tsx`
- Open-now uses real hours from search: `grep -n "isOpenNow(r.venue.hours" fieldstack-app/src/screens/main/ExploreScreen.tsx`
- API prod fallback URL: `grep -n "api.getonside.ca" fieldstack-app/src/api/client.ts`
- Scrape guards and summary: `grep -n "GUARD" apps/api/scripts/scrape/run.ts`; guard constants in `apps/api/scripts/scrape/lib/monitor.ts`
- `if: always()` on enrichment/dedupe and the Places key on the scrape step: `grep -n "always()\|GOOGLE_PLACES_API_KEY" .github/workflows/scrape.yml`
- Playtomic endpoint status: header of `apps/api/scripts/scrape/sources/playtomic.ts` (re-verify against the live API before edits)
- Migration drop-first rule: `sed -n '1,12p' supabase/migrations/019_venues_within_id_only.sql`
- Site empty-but-green: `grep -n "skipping venue pages" site/lib/venues.ts`
- Token drift step: `grep -n "generate.mjs" .github/workflows/ci.yml`
- Sentry DSN gap status (crash-reporting claim is homed in onside-config-and-flags): `grep -n "SENTRY" fieldstack-app/eas.json`
- Migrations job flake claim: `gh run list --workflow=migrations.yml --limit 20 --json conclusion` (all green as of 2026-07-05; the image-pull-flake cause remains UNVERIFIED here)
