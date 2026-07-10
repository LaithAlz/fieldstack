---
name: onside-architecture-contract
description: Load-bearing architecture decisions, invariants, and known weak points of the Onside repo (soccer-field discovery, GTA). Load BEFORE changing API routes or response shapes, Supabase RLS or migrations, the scrape pipeline (external_id, dedupe, source priority), design tokens, the app provider tree, the Explore map markers, booking flow gating, or site data flow. Also load when you see symptoms like "why does search not return hours", "can I flip tracksViewChanges", "why is there no root package.json", "why does the API use the anon key", "is it safe to rename an external_id prefix", or "why does the site build green with no env".
---

# Onside Architecture Contract

This is the contract for the Onside repo at the repo root (README.md, apps/, fieldstack-app/, site/, supabase/, design/). It lists the decisions that hold the system up, WHY each one exists, and the invariants you must not break. Every claim here was verified against the code (as of 2026-07-05). When code and this document disagree, the code wins; then fix this document.

Jargon used below, defined once:

- RLS: Postgres Row Level Security. Policies that filter what each role can read or write.
- anon key / service_role key: Supabase API keys. anon obeys RLS; service_role bypasses it.
- RPC: a Postgres function called through Supabase (`supabase.rpc("name", args)`).
- TTL: cache expiry time in seconds.
- Fabric: React Native's new rendering architecture (enabled in this app).
- EAS: Expo Application Services, the hosted build system for the iOS app.
- Soft delete: setting `is_active=false` instead of deleting a row. Reversible.

## When NOT to use this skill

| You actually want | Go to |
|---|---|
| How to set up an environment or install deps | onside-build-and-env |
| How to run, deploy, or operate services | onside-run-and-operate |
| Env vars, secrets names, feature flags matrix | onside-config-and-flags |
| Symptom-driven debugging tables | onside-debugging-playbook |
| Full incident stories behind these rules | onside-failure-archaeology |
| Geo dedup math and data-source theory | venue-data-reference |
| Change process (PR per issue, CI gates) | onside-change-control |

## System in one paragraph

Three independent Node projects in one git repo: `apps/api` (Fastify 5 read API on Fly.io), `fieldstack-app` (Expo SDK 54 iOS app, live on the App Store as Onside, id 6780034337), and `site` (Next.js marketing/SEO site on Vercel, getonside.ca). All three read the same Supabase Postgres (schema in `supabase/migrations/`, 25 files as of 2026-07-05). Field data comes from a scrape pipeline in `apps/api/scripts/scrape/` that upserts venues and fields from OSM, Google Places, Playtomic, and three municipal open-data sources. Design tokens in `design/tokens.json` are generated into both the app and the site.

## Load-bearing decisions (each with WHY)

### 1. Three independent npm projects, no workspace root

There is no root `package.json`. `apps/api`, `fieldstack-app`, and `site` each have their own `node_modules` and their own tracked `package-lock.json`. `bun.lock` is gitignored everywhere.

WHY: EAS builds the mobile app with npm, and bun's different `node_modules` hoisting broke production builds (the June 2026 stuck-splash incident; full mechanism: onside-failure-archaeology incident 6, PRs #419/#429). Keeping each project isolated with `package-lock.json` as the single lockfile of record removed that class of failure. Consequences you must respect:

- Install per project, from that project's directory. Never add a root workspace.
- Use npm (not bun) for anything touching `fieldstack-app`.
- `apps/api` is split-runtime: `bun test` and `bun scripts/scrape/...` for tests/scrape, but the server itself runs under Node via tsx (`npm run dev` / `npm start`).
- Never commit `bun.lock`; never `git add -A`.

### 2. The API reads through RLS with the anon key

`apps/api/src/lib/supabase.ts` creates its client with `SUPABASE_ANON_KEY`. Only the scrape scripts and `apps/api/scripts/seed.ts` use `SUPABASE_SERVICE_ROLE_KEY`.

WHY: the API is a public read surface. Running it as anon means a bug in a route can only ever leak what RLS already allows anonymous users to see (active venues/fields). Migration 019 exists because the `venues_within` RPC once returned whole venue rows and exposed `operator_id`, `data_source`, `external_id`, `booking_notes` to anon; it now returns `table(id uuid)` only. Do not "fix" an API data-access problem by switching the server to service_role.

### 3. Every API response is `{ data, error }` with one central error mapper

`apps/api/src/index.ts` `setErrorHandler` maps: `ApiError` to its own status/code, ZodError to 400 `VALIDATION_ERROR`, Supabase/PostgREST errors (detected by a `details` property) to a generic 500 that logs only the Postgres `code` (never details/hint, which can leak schema), everything else to 500 "internal server error". Rate limiting (60 req/min per IP, global) returns 429 code `RATE_LIMITED` in the same envelope.

WHY: the app's `src/api/client.ts` unwraps this envelope blindly. A route that returns a bare payload or throws an unmapped shape breaks every client at once. New routes must throw `ApiError` (from `src/lib/errors.ts`) for known failures and let the central handler shape everything.

### 4. Redis is best-effort, never a dependency

`apps/api/src/lib/redis.ts` + `cache.ts`: lazyConnect, no offline queue, a bad or missing `REDIS_URL` falls back to a client whose commands all reject, and `cached()` swallows every Redis error (get, set, malformed JSON) and falls through to the live query. Only two paths use it: `/search/fields` (TTL 30s) and proximity `/venues` (TTL 60s). `GET /health` returns 503 only when Supabase fails; Redis down is reported as `"error"` in the body but still HTTP 200.

WHY: the API crashed on Fly bring-up when `REDIS_URL` was malformed (June 2026, PR #367). Supabase is the hard dependency; Redis is an optimization. Never add code that makes a request fail because Redis failed, and never make `/health` 503 on Redis.

### 5. Search goes through the `search_fields` RPC, and its venue projection is deliberately thin

`GET /search/fields` calls RPC `search_fields` (current version: migration `020_search_fields_pagination.sql`, 10 args: `p_lat, p_lng, p_radius_meters, p_surfaces, p_sizes, p_venue_types, p_price_max, p_sort, p_limit, p_offset`). The RPC exists because PostgREST cannot sort by a PostGIS-derived distance on a join. The SQL builds each row's venue object with EXACTLY: `id, name, lat, lng, address, photos, venue_type`. Excluded: `hours`, `photo_attributions`, `booking_notes`, `cancellation_policy`, `amenities`, `operator_id`, `external_id`, and everything else.

WHY thin: keep the search payload small and keep internal columns away from anon. UPDATE (2026-07-09): migration 026 added `hours` to the projection (issue #475), and the API `SearchVenue` type now carries `venue_type` and `hours`, so Open-now evaluates real per-venue hours where the venue has them; venues without hours still use the default 06:00-23:00 window. If you widen the projection further, change migration + API type + app type together, and remember changing an RPC's RETURN TYPE requires `drop function if exists` first (Postgres forbids `create or replace` across return types; that bug shipped in migration 019 and is why the Migrations CI workflow replays all migrations from scratch). Migration 026 kept the same signature and jsonb return, so it used plain `create or replace` correctly.

### 6. Scrape idempotency rides on `external_id` with per-source prefixes

Venues and fields upsert with `onConflict: "external_id"` (`apps/api/scripts/scrape/run.ts`). Prefixes in use: `osm:`, `google:`, `playtomic:`, `mississauga:`, `toronto:`, `brampton:`, and `manual:` (by convention in `data/manual-venues.yaml`, currently empty). Real UNIQUE constraints back this (migration 014 replaced partial indexes because PostgREST upsert cannot target a partial index).

WHY prefixes must stay distinct and stable: the prefix IS the provenance. `sourceOf()` in `lib/dedupe.ts` parses it to rank sources; `lib/monitor.ts` counts per-prefix rows for the zero-rows guard; re-scrapes only stay idempotent if the same real-world object always maps to the same id. Renaming a prefix orphans every existing row (the upsert would insert duplicates instead of updating). Never reuse one prefix for two sources, never change an adapter's id scheme without a migration plan for existing rows.

### 7. Dedupe is two-tier by design: AUTO applies unattended, REVIEW only prints

`apps/api/scripts/scrape/lib/dedupe.ts` (pure, tested): AUTO tier = pins within 200m (30m when either name is all generic tokens) AND name similarity >= 0.85; REVIEW tier = within 100m AND (similarity >= 0.3 OR identical street-address key). `osm` never auto-merges with `osm`; `google` pairs never AUTO. The runner (`scripts/scrape/dedupe.ts`) is dry-run by default; `--apply` (what the weekly workflow runs) soft-deletes AUTO losers with `is_active:false, duplicate_of:keep.id`. REVIEW candidates are only printed to the log for a human.

Winner selection is the source priority ladder, mirroring docs/scraping.md section 4.3: `manual 4 > playtomic 3 > mississauga/toronto/brampton 2 > google 1 > osm 0`, then field count, then id.

WHY: merging venues destroys user-facing pages, so only beyond-reasonable-doubt matches may run unattended, and losing a merge must be reversible (soft delete, never delete). If you tune thresholds, update `apps/api/tests/dedupe.test.ts` in the same PR.

### 8. Design tokens have exactly one source and three drift guards

`design/tokens.json` is the single source. `node design/generate.mjs` (run from repo root, plain Node, no deps) writes the generated outputs; the exact output paths and the regeneration procedure are homed in onside-config-and-flags ("Design tokens as configuration").

Guards: (1) a jest drift test in the CI mobile job and (2) a regen-plus-`git diff --exit-code` step in the CI site job (both detailed in onside-config-and-flags); (3) the `ThemeColors` type in `fieldstack-app/src/theme/tokens.ts` forces light and dark palettes into lockstep at typecheck time.

WHY: the app and site must render the same brand. Rule: never hand-edit a generated file (each carries a GENERATED header); edit tokens.json, rerun the generator, commit all outputs together. Editing tokens.json alone fails two CI jobs.

### 9. App provider tree order and PersistenceGate are load-bearing

`fieldstack-app/App.tsx` tree order: `GestureHandlerRootView > SafeAreaProvider > ErrorBoundary > ThemeProvider > BottomSheetModalProvider > ToastProvider > AuthProvider > OnboardingProvider > PreferredSlotProvider > SavedVenuesProvider > BookingHistoryProvider > RecentlyViewedProvider > BlockedUsersProvider > PersistenceGate > NavigationRoot`.

WHY each position: ErrorBoundary sits inside SafeAreaProvider (fallback respects notches) but OUTSIDE ThemeProvider, and the fallback hardcodes hex colors and never calls `useTheme()`, so a crash in the theme layer still lands on the friendly screen. The persistence providers sit under AuthProvider because their cloud-sync effects call `useAuth()`. `PersistenceGate` returns null until all EIGHT hydration flags are true: preferredSlot, savedVenues, bookingHistory, recentlyViewed, auth, blockedUsers, onboarding, and theme (theme included so the first frame never flashes the system scheme before snapping to the persisted choice). Adding a persisted provider means adding its `hydrated` flag to the gate, or deep links will see empty defaults.

### 10. Explore map marker pool: fixed slots, never unmount, tracksViewChanges stays true

`fieldstack-app/src/screens/main/ExploreScreen.tsx`: a fixed pool of `MAX_MARKERS = 50` Marker slots. Invariants, each earned by a crash (7-PR AIRMap/Fabric saga, May 2026):

- Marker children of MapView must NEVER mount or unmount. Inactive slots render at null-island (0,0) with opacity 0 but stay mounted so the pool length never changes.
- `tracksViewChanges` is permanently `true` and never flipped. Flipping it corrupts AIRMap's subview index under the Fabric interop layer (native crash); permanently false froze each marker's first rasterization (placeholder teardrops, stale prices on slot reassignment). Children are memoized to keep idle cost low.
- Selection is a SEPARATE always-mounted overlay: one Marker plus a Circle halo that only move and fade. Its content never varies, so its `tracksViewChanges={false}` is safe, and this is why the selected pin cannot show price digits.
- Transparent-view rasterization rule (`src/components/VenuePin.tsx`): a fully transparent root view rasterizes to an empty annotation image and MapKit falls back to its default red balloon. The free pin's 44pt hit area carries `backgroundColor: "rgba(0, 0, 0, 0.01)"`; any non-zero alpha keeps the snapshot real. Keep that alpha.

Raising the 50 cap requires on-device profiling (comment at the constant). Overflow shows a "Showing 50 of N venues" banner instead.

### 11. Booking action has a single decision point, and flag OFF means untouched redirect

`fieldstack-app/src/lib/bookingAction.ts` `resolveBookingAction({flagOn, signedIn})`: flag off returns `{type:"redirect"}` without ever branching on auth; flag on + guest returns `sign_in`; flag on + signed in returns `request`. Both detail screens route through this one pure function.

WHY: the `in_app_booking` feature flag (PostHog key of the same name, dev override `EXPO_PUBLIC_FF_IN_APP_BOOKING=1`, default false, only exact `true` from PostHog counts) must be able to roll back to byte-identical pre-flag behavior for every user. That invariant is a unit test (`__tests__/bookingAction.test.ts`), not something inspected in JSX. Never add a second place that decides what the reserve button does.

### 12. booking_requests RLS: owner-only, cancel-only self-update, no self-confirm

Migration `025_booking_requests.sql`: users can insert their own requests, select their own, and update their own only as a pending-to-cancelled transition (USING pending, WITH CHECK cancelled). No delete policy at all, and no policy path lets a user set `confirmed`.

WHY: a booking request is a two-party record. The row surviving cancellation is the audit trail; confirmation must come from an operator-side surface (which does not exist yet), never from the requesting client. The app's `bookingRequests.ts` data layer assumes exactly this shape.

### 13. The site is build-time static by design

`site/lib/venues.ts` fetches venues ONCE per build (module-level promise cache, single Supabase query, limit 2000, anon key). Venue and city pages use `generateStaticParams` with `dynamicParams = false`, so unknown slugs 404. Missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` yields an empty venue list, a console warning, and a GREEN build.

WHY: SEO pages need to be fast and cheap, and CI must be able to build the site without secrets (the CI site job passes no env). Consequences: data freshness is tied to deploys (a weekly-ish redeploy after the Monday scrape is needed for new venues to appear), and an accidentally-unset env in Vercel produces a quietly empty site rather than a failed build. Both are accepted trade-offs; do not add runtime fetching to "fix" them without a decision.

### 14. Deep links are the `onside://` scheme only

`fieldstack-app/App.tsx` linking config: `prefixes: ["onside://"]`, routes `venue/:venueId`, `venue/:venueId/field/:fieldId`, `set-new-password`. There are NO https universal links. Supabase auth redirects (email verify, magic link, recovery, Google OAuth) also ride `onside://` with tokens in the URL FRAGMENT, handled outside React Navigation by AuthProvider's Linking listeners.

WHY it matters: custom schemes only exist in real builds; Expo Go registers `exp://`, so `onside://` links cannot be exercised in Expo Go (standard Expo behavior, use a dev build). And because auth tokens arrive as fragments on the same scheme, do not add a catch-all route that swallows unknown `onside://` URLs.

## Known weak points (stated plainly, as of 2026-07-05)

| Weak point | Detail | Status |
|---|---|---|
| 50-marker cap, no clustering | Clustering was deliberately dropped (May 2026); overflow gets a banner | Accepted; raising cap needs on-device profiling |
| Open-now for hours-less venues is an approximation | Migration 026 ships real hours in search; venues with no `hours` row still evaluate the default 06:00-23:00 window | #475 closed 2026-07-09; residual gap is hours COVERAGE (see onside-research-frontier P1) |
| Single search radius | App hardcodes `DEFAULT_RADIUS_KM = 75` (`useFieldSearch.tsx`); API caps `radius_km` at 500 | Accepted |
| No screen/e2e tests | 21 jest suites in `fieldstack-app/src/lib/__tests__/` are pure logic only; API has 11 bun test files; `.maestro/` flows exist but are not CI-run | Accepted risk |
| Manual prod db push | `npm run db:push` from `apps/api` is manual; CI only detects drift (migrations.yml, secret-gated) | By design, easy to forget |
| API `SearchVenue` type drift | Omits `venue_type` that the SQL returns | Minor, unfixed |
| Two scraper User-Agent brands | `Onside-scraper/1.0 (getonside.ca)` in osm.ts vs `FieldStack-scraper/1.0 (fieldstack.app)` in arcgis.ts and playtomic.ts | Rebrand leftover, unresolved which is canonical |
| Site freshness tied to deploys | New scraped venues invisible until next Vercel deploy | By design |
| Prod crash reporting gap | `EXPO_PUBLIC_SENTRY_DSN` missing from builds; current status homed in onside-config-and-flags (known gap 1) | Open until the DSN ships |

## Invariants (must remain true) and their guards

| # | Invariant | Guard |
|---|---|---|
| 1 | Every API response is `{data, error}`; PostgREST details/hint never reach logs or clients | `apps/api/tests/errors.test.ts`; central handler in index.ts |
| 2 | API Supabase client uses the anon key, never service_role | NONE (code review only) |
| 3 | `/health` 503s only on Supabase failure, never Redis | `apps/api/tests/redis.test.ts` covers fallback; health rule itself NONE |
| 4 | Redis errors always fall through to the live query | `apps/api/tests/cache.test.ts`, `redis.test.ts` |
| 5 | `external_id` prefixes distinct and stable per source; upserts on `external_id` | UNIQUE constraints (migration 014); prefix stability NONE |
| 6 | Only AUTO-tier dedupe applies unattended; losers are soft-deleted with `duplicate_of` | `apps/api/tests/dedupe.test.ts`; `--apply` gating in dedupe runner |
| 7 | Source priority ladder manual > playtomic > municipal > google > osm | `apps/api/tests/dedupe.test.ts` |
| 8 | Generated token files match `design/tokens.json` | tokensDrift jest test + CI site job regen-diff |
| 9 | Light/dark palettes have identical key sets | `ThemeColors` type, `tsc --noEmit` in CI |
| 10 | PersistenceGate waits on all 8 hydration flags | NONE (a new provider can be forgotten silently) |
| 11 | Map marker pool: fixed length, no mount/unmount, `tracksViewChanges` true, selection overlay separate, hit-area alpha 0.01 | NONE (comments in ExploreScreen.tsx and VenuePin.tsx only; regressions surface as native crashes on device) |
| 12 | Flag OFF booking behavior is byte-identical operator redirect, auth-independent | `fieldstack-app/src/lib/__tests__/bookingAction.test.ts` |
| 13 | booking_requests: no self-confirm, cancel-only update, no delete | RLS policies (migration 025); replay checked by migrations.yml |
| 14 | Every migration applies to a fresh database from scratch | `.github/workflows/migrations.yml` (`supabase start` on PRs touching supabase/) |
| 15 | RPC return-type changes use `drop function if exists` first | migrations.yml fresh replay |
| 16 | Site builds green without Supabase env | CI site job builds with no secrets |
| 17 | `@fieldstack/` AsyncStorage key prefix never renamed (no migration layer exists; renaming orphans user state) | NONE (evidenced convention, no written rule) |
| 18 | Google Places content never stored durably except `google_place_id`; photos are short-lived URIs refreshed weekly | scrape.yml runs enrichPhotos `if: always()`; rule itself NONE |
| 19 | No em dashes in user-facing copy | NONE (PR #401 purge; manual review) |

Invariants marked NONE are the dangerous ones: nothing fails automatically when you break them. Treat them as blocking review items.

## Provenance and maintenance

All facts verified 2026-07-05 against the working tree. Re-verify before relying on a volatile fact (run from repo root):

| Fact | Re-verify with |
|---|---|
| No root package.json; 3 tracked lockfiles | `ls package.json; git ls-files | grep package-lock.json` |
| API uses anon key | `grep -n ANON apps/api/src/lib/supabase.ts` |
| Redis TTLs 30s/60s | `grep -rn TTL_SECONDS apps/api/src/lib/queries/` |
| search_fields args + projection | `grep -n "p_\|jsonb_build_object" supabase/migrations/020_search_fields_pagination.sql` |
| Migration count (25) | `ls supabase/migrations | wc -l` |
| external_id prefixes | `grep -rn "externalId:" apps/api/scripts/scrape/sources/` |
| Dedupe thresholds + ladder | `grep -n "AUTO_\|REVIEW_\|SOURCE_PRIORITY" apps/api/scripts/scrape/lib/dedupe.ts` |
| Token generator outputs | `grep -n "outPath\|tokens.generated" design/generate.mjs` |
| Provider tree + gate flags | `grep -n "Provider>\|Hydrated" fieldstack-app/App.tsx` |
| MAX_MARKERS, tracksViewChanges | `grep -n "MAX_MARKERS\|tracksViewChanges" fieldstack-app/src/screens/main/ExploreScreen.tsx` |
| resolveBookingAction shape | `cat fieldstack-app/src/lib/bookingAction.ts` |
| booking_requests policies | `grep -n "create policy" supabase/migrations/025_booking_requests.sql` |
| dynamicParams=false on site pages | `grep -rn dynamicParams site/app` |
| Deep link prefixes | `grep -n "prefixes" fieldstack-app/App.tsx` |
| Hours present in search projection | `grep -n "'hours'" supabase/migrations/026_search_fields_hours.sql` |
| Sentry DSN still absent from EAS | `grep -c SENTRY_DSN fieldstack-app/eas.json` (0 = still absent) |
| UA brands still split | `grep -rn "scraper/1.0" apps/api/scripts/scrape/` |
