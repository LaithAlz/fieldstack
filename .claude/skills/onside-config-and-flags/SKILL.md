---
name: onside-config-and-flags
description: Every configuration axis of the Onside repo (soccer field discovery, GTA). Load when you need to know where an env var is consumed or set, which GitHub secrets exist, what the EAS build profiles differ in, how the in_app_booking feature flag resolves, how to add a new feature flag, what design/tokens.json controls and how to regenerate, what the scrape registries (cities.yaml, operators.yaml, manual-venues.yaml) accept, or scrape/API tuning constants. Trigger phrasings include "where is EXPO_PUBLIC_API_URL set", "why is Sentry not reporting", "PostHog key placeholder", "add a feature flag", "flag is not turning on", "regenerate tokens", "token drift CI failure", "what secrets does scrape.yml need", "add a city to the scraper", "add an operator", "MAX_MARKERS", "dedupe thresholds", "CORS ALLOWED_ORIGINS", "Supabase local ports".
---

# Onside configuration and feature flags

Single reference for every knob in this repo: environment variables, GitHub Actions secrets, EAS build profiles, the feature flag system, design tokens, and scrape pipeline registries and constants. All file paths are relative to the repo root `/Users/laith/code/soccer` unless absolute. All volatile facts are as of 2026-07-05.

Jargon used below, defined once:

- **anon key**: Supabase's public API key. Safe to ship in clients; Row Level Security (RLS, per-row database permissions) limits what it can read or write.
- **service role key**: Supabase's admin key. Bypasses RLS. Server and scripts only, never in any client bundle.
- **EAS**: Expo Application Services, the cloud build system for the iOS app. Build profiles live in `fieldstack-app/eas.json`.
- **PostHog**: hosted product analytics and feature flag service. **DSN**: a Sentry project's ingest URL; without it, crash reporting is off.
- **Expo inlining**: any `EXPO_PUBLIC_*` variable is baked into the JS bundle at build time. Changing one requires a new build or a re-bundled EAS Update, never a server-side change.

## When NOT to use this skill

| You actually want | Go to |
|---|---|
| Set up a working dev environment from scratch | onside-build-and-env |
| Run, deploy, or operate a surface (Fly, Vercel, EAS submit) | onside-run-and-operate |
| Change-control rules for shipping a config change | onside-change-control |
| Why a config value is the way it is (invariants, history) | onside-architecture-contract, onside-failure-archaeology |
| Debug a symptom that might not be config | onside-debugging-playbook |

Rule of thumb: this skill answers "what is the knob, where does it live, what does it do". Anything procedural beyond flipping the knob belongs to a sibling.

## The places configuration lives

1. `apps/api/.env` (local only, gitignored): API server plus all scrape/seed scripts. Template: `apps/api/.env.example` (7 vars documented).
2. `fieldstack-app/.env` (local only, gitignored): the iOS app in dev. Template: `fieldstack-app/.env.example` (6 vars). `EXPO_PUBLIC_API_URL` in it is auto-rewritten to your LAN IP by `fieldstack-app/scripts/sync-api-url.js`, wired as `prestart`/`preios`/`preandroid` npm hooks.
3. `fieldstack-app/eas.json`: per-profile env baked into cloud builds (see EAS profiles section).
4. GitHub repo secrets: consumed by `.github/workflows/{scrape,migrations,fly-deploy}.yml`. `ci.yml` consumes no secrets.
5. Vercel dashboard (site project): `SUPABASE_URL`, `SUPABASE_ANON_KEY`. No `vercel.json` exists; all Vercel config is dashboard-side (`site/README.md`).
6. Fly.io runtime: `apps/api/fly.toml` `[env]` sets only `HOST`, `NODE_ENV`, `PORT`, `TRUST_PROXY`. Everything else the deployed API needs (Supabase pair, `REDIS_URL`, `ALLOWED_ORIGINS`) must be set via `fly secrets` on app `onside-api-wild-current-9606`. UNVERIFIED from the repo: the actual Fly secret list is not inspectable here; run `fly secrets list` from `apps/api/` to confirm.
7. `supabase/config.toml`: local Supabase stack (project_id `soccer`; ports below).

`.gitignore` lines 13-15 exclude `.env`, `.env.local`, `.env.*.local`. Never commit a filled env file; never print secret values in logs, PRs, or skill output. Names and locations only.

## Environment variable matrix

### App (fieldstack-app, all Expo-inlined)

| Variable | Consumed at | Set where | Prod status (2026-07-05) |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | `src/api/client.ts:16`, falls back to `https://api.getonside.ca` with a dev-only warning at line 18 | local `.env` (auto-rewritten by sync-api-url), eas.json preview + production | SET: `https://api.getonside.ca` |
| `EXPO_PUBLIC_SUPABASE_URL` | `src/lib/supabase.ts:18`; missing = placeholder client + dev warn, never throws at import | local `.env`, eas.json preview + production | SET (committed in eas.json) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase.ts:19` | same | SET. The anon key is deliberately committed in eas.json: it is the public anon JWT, RLS enforces access. The service role key must never appear here |
| `EXPO_PUBLIC_POSTHOG_KEY` | `src/lib/analyticsProviders.ts:25` (analytics client) AND `src/lib/featureFlags.ts:78` (separate flags client) | local `.env`, eas.json | production SET (real `phc_` key); preview is the literal placeholder `REPLACE_WITH_POSTHOG_PROJECT_KEY` (known gap: preview builds have no analytics and no remote flags) |
| `EXPO_PUBLIC_POSTHOG_HOST` | `analyticsProviders.ts:29` and `featureFlags.ts:85`; default `https://us.i.posthog.com` | optional, only for EU-hosted projects | unset (US default) |
| `EXPO_PUBLIC_SENTRY_DSN` | `analyticsProviders.ts:58`; `initSentry()` returns false and no-ops without it; even with it, `enabled: !__DEV__` | in `.env.example` only | **MISSING from eas.json entirely: production crash reporting is OFF.** Fix = create a Sentry project and add the var to the production (and preview) env blocks |
| `EXPO_PUBLIC_FF_IN_APP_BOOKING` | `featureFlags.ts:45`; value `"1"` forces the flag on | dev-only, set in local `.env` by hand. NOT in `.env.example`, NOT in eas.json | never set in builds (correct: it is a dev override) |
| `SENTRY_DISABLE_AUTO_UPLOAD` | Sentry Expo plugin at build time (not runtime code) | eas.json preview + production, value `"true"` | SET: no source-map upload during EAS builds |

### API server and scripts (apps/api)

`src/index.ts:1` loads `dotenv/config`, so `apps/api/.env` covers both the server and every script run from that directory.

| Variable | Consumed at | Set where | Prod status |
|---|---|---|---|
| `SUPABASE_URL` | server `src/lib/supabase.ts:5` (throws at import if missing); scripts `scripts/scrape/{run,dedupe,enrichPhotos,refine}.ts`, `scripts/seed.ts` | `apps/api/.env` local; repo secret (scrape.yml); Fly secrets | presumed set on Fly (server boots); repo secret confirmed consumed |
| `SUPABASE_ANON_KEY` | server `src/lib/supabase.ts:6`. The API reads through RLS on purpose | `apps/api/.env`; Fly secrets | presumed set on Fly |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts only (same five scripts as above). The server never uses it | `apps/api/.env`; repo secret | repo secret confirmed consumed by scrape.yml |
| `GOOGLE_PLACES_API_KEY` | `scripts/scrape/sources/googlePlaces.ts:96` (throws if unset when the google source runs) and `scripts/scrape/enrichPhotos.ts:44` | `apps/api/.env`; repo secret | needed by **BOTH** the scrape step and the enrich step in scrape.yml. Historically it was only on the enrich step, which made the google source fail on every scheduled run (comment at scrape.yml:46-49). Keep it on both |
| `REDIS_URL` | `src/lib/redis.ts:33`; missing or bad never crashes, cache is best-effort | `apps/api/.env`; Fly secrets | UNVERIFIED on Fly |
| `PORT` / `HOST` | `index.ts:15-16`, defaults 3000 / 0.0.0.0 | fly.toml `[env]` | SET: 3000 / 0.0.0.0 |
| `TRUST_PROXY` | `index.ts:31`, only exact `"true"` enables; needed so rate limiting sees real client IPs behind Fly's proxy | fly.toml `[env]` | SET: true |
| `NODE_ENV` | `index.ts:21` (pretty logs unless production) | fly.toml `[env]` | SET: production |
| `LOG_LEVEL` | `index.ts:20`, default `info` | optional | unset |
| `ALLOWED_ORIGINS` | `index.ts:38-41`, comma-separated CORS allowlist; unset = `origin: false` (browsers blocked, native app and server-to-server unaffected) | Fly secrets if anywhere | UNVERIFIED; not in fly.toml |

### Site (site/, Vercel)

| Variable | Consumed at | Behavior when missing |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `site/lib/venues.ts:14-15` at BUILD time (static venue pages) and `site/app/api/waitlist/route.ts:34-35` at REQUEST time | build still succeeds with a console.warn and zero venue pages (`venues.ts:117-123`); waitlist POST returns an error. Set both in the Vercel dashboard for the site project. Local: `site/.env.local` |

### GitHub repo secrets (complete list, 7)

Confirmed by `grep -n "secrets\." .github/workflows/*.yml`:

| Secret | Workflow, step |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | scrape.yml: all three steps (scrape, enrich, dedupe) |
| `GOOGLE_PLACES_API_KEY` | scrape.yml: scrape AND enrich steps |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | migrations.yml: optional remote drift check (`supabase link` + `db push --dry-run`). The ref for the linked project is `hjvaoshvvjfygfeuzrfh` (visible in the eas.json Supabase URL) |
| `FLY_API_TOKEN` | fly-deploy.yml: `flyctl deploy --remote-only` on every push to main |

All secret-gated steps use the skip idiom: if the secret is empty, print `::notice::` and `exit 0` instead of failing (safe on forks). So a green run does not prove the step ran; check the log for the notice.

## Feature flags (fieldstack-app/src/lib/featureFlags.ts)

One flag exists: `FlagName = "in_app_booking"` (line 32). It gates the booking-request flow.

Resolution order in `resolveFlag` (lines 57-63), most specific wins:

1. Dev env override: `EXPO_PUBLIC_FF_IN_APP_BOOKING === "1"` forces ON (per-flag map `DEV_OVERRIDE_ENV_VARS`, line 44).
2. PostHog live value for dashboard key `in_app_booking` (map `POSTHOG_FLAG_KEYS`, line 37). Only an exact boolean `true` counts; multivariate variants arrive as strings and count as off.
3. Default **false**. No override and no `EXPO_PUBLIC_POSTHOG_KEY` means every flag is off everywhere. This is safe by construction: the flags client is lazily created and returns null without a key (lines 76-91), and PostHog's `useFeatureFlag` hook returns undefined without a client.

Flag-off invariant: `src/lib/bookingAction.ts:24` returns `{type: "redirect"}` whenever the flag is off, without ever branching on auth. Flag off = operator redirect for everyone, exactly the pre-flag behavior. Gated surfaces today: the ReserveBar primary action on venue and field detail, its label (`reserveBarActionLabel`), and the Booking requests section on Profile (shown only when signed in AND flag on).

### Checklist: adding a new flag

1. Add the name to the `FlagName` union (`featureFlags.ts:32`).
2. Add its PostHog dashboard key to `POSTHOG_FLAG_KEYS` (line 37). Keep the two names identical unless there is a reason not to.
3. Add its env override to `DEV_OVERRIDE_ENV_VARS` (line 44). Naming pattern: `EXPO_PUBLIC_FF_<UPPER_SNAKE_NAME>`.
4. Create the flag in the PostHog dashboard with that key, rolled out to 0% (ship OFF).
5. Keep the gated decision pure and separate from React, following `bookingAction.ts`, so it is unit-testable.
6. Write a default-off test that pins the OLD behavior when the flag is off (patterns: `src/lib/__tests__/bookingAction.test.ts`, `featureFlags.test.tsx`). This is the regression guard for every user who never gets the flag.
7. If the flag changes user-visible behavior, add a typed `EVENT_*` constant in `src/lib/analytics.ts` and `track` it, so rollout effects are measurable.
8. Ship through the normal PR flow (see onside-change-control). Flipping the flag later is a PostHog dashboard action, no deploy.

## Design tokens as configuration

`design/tokens.json` is the single source for the visual system shared by app and site. Axes: `color.light` and `color.dark` (21 tokens each, names in lockstep), `spacing` (xs 4, sm 8, md 12, lg 16, xl 24, xxl 32), `radius` (sm 6, md 8, lg 12, xl 16, pill 999), `fontSize` (xs 11, sm 13, md 15, lg 17, xl 22, xxl 28, xxxl 34, scoreboard 56).

Regenerate (run from repo root, plain Node, no deps):

```bash
cd /Users/laith/code/soccer && node design/generate.mjs
```

Three generated outputs (never hand-edit; the header of each says so):

1. `fieldstack-app/src/theme/palette.ts`
2. `site/app/tokens.css`
3. `site/lib/tokens.generated.json` (color-only copy so `site/app/opengraph-image.tsx` can import tokens without leaving Vercel's `site/` project root)

Drift guards:

1. Jest test `fieldstack-app/src/lib/__tests__/tokensDrift.test.ts` deep-equals palette.ts exports against tokens.json. Runs in the CI mobile job.
2. CI site job (`.github/workflows/ci.yml:74-77`) reruns the generator and fails on `git diff --exit-code design fieldstack-app/src/theme/palette.ts site/app/tokens.css site/lib/tokens.generated.json`.
3. Advisory: generated-file headers. Editing tokens.json without regenerating fails BOTH CI jobs above; the fix is always regenerate and commit all three outputs together.

## EAS build profiles (fieldstack-app/eas.json)

| Profile | Distribution / channel | env block |
|---|---|---|
| `development` | internal, channel `development`, `developmentClient: true`, device (not simulator) | none: dev builds read the local `.env` via Metro |
| `preview` | internal, channel `preview` | staging API `https://api-staging.getonside.ca` (UNVERIFIED whether that host is actually deployed; not provable from the repo), Supabase pair, PostHog placeholder `REPLACE_WITH_POSTHOG_PROJECT_KEY` (known gap), `SENTRY_DISABLE_AUTO_UPLOAD=true` |
| `preview-simulator` | extends `preview`, `ios.simulator: true` | inherited |
| `production` | channel `production`, `autoIncrement: true` | prod API `https://api.getonside.ca`, same Supabase pair, real PostHog key, `SENTRY_DISABLE_AUTO_UPLOAD=true`. No Sentry DSN (the gap) |

Submit config: `appleTeamId CX88Y8RY7Q`, `ascAppId 6780034337` (the live App Store id).

### app.json essentials (fieldstack-app/app.json)

- Identity: name `Onside`, slug `onside`, version `1.1.0`, scheme `onside`, bundle id `app.onside.mobile`, owner `allaith`, EAS projectId `33ee0cde-86f1-4df9-8b97-97898c3ae7e3`.
- Runtime: `newArchEnabled: true`, `experiments.reactCompiler: true`, `runtimeVersion.policy: "appVersion"`, OTA updates url `https://u.expo.dev/33ee0cde-86f1-4df9-8b97-97898c3ae7e3`.
- iOS: `supportsTablet: false`, `usesAppleSignIn: true`, `usesNonExemptEncryption: false`.
- Permission strings (exact copy, keep in sync with actual feature use): `NSLocationWhenInUseUsageDescription` = "Onside uses your location to rank nearby soccer fields and show distance."; `NSCalendarsUsageDescription` = "Onside adds your booked slots to your calendar."
- Privacy manifest (`ios.privacyManifests`): `NSPrivacyTracking: false`. Accessed API types and reason codes: UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1. Collected data types (all Tracking:false): EmailAddress (linked), UserID (linked), PreciseLocation (not linked), CrashData, PerformanceData, ProductInteraction (not linked), OtherUsageData (linked), OtherUserContent (linked). App Store Connect labels must match this list.

## Scrape pipeline configuration

### Registries: apps/api/scripts/scrape/data/*.yaml

Note the real path: `apps/api/scripts/scrape/data/`, NOT `apps/api/data/`. Loaded fresh on every run by `scripts/scrape/lib/registry.ts` (parse errors throw; a half-configured platform operator only warns). The YAML header comments in each file are the authoritative schema docs; summarized:

`cities.yaml` (10 GTA cities): each entry `{name, osm_relation_id, wikidata?, lat, lng}`. `lat`/`lng` required (registry throws otherwise). `osm_relation_id` scopes the OSM Overpass area query; lat/lng seed the radius sweeps for the Playtomic and Google sources. To add a city: find the admin boundary relation on nominatim.openstreetmap.org, cross-check the Wikidata Q-id, add centre coordinates.

`operators.yaml` (21 operators): each entry `{name (required), website?, booking_url?, integration_type? (none|playtomic|courtreserve|amilia, default none), courtreserve_org_id?, amilia_rewrite_url?, playtomic_slug?, aliases?}`. Exactly one platform id key should match `integration_type`. Scraped venues are matched by case-insensitive substring against name plus aliases (one-way: operator name inside venue name) and inherit the operator's booking URL when the venue has none.

`manual-venues.yaml` (currently `venues: []`): each entry `{external_id (required, prefix "manual:"), name (required), operator?, address?, lat, lng (required), venue_type?, amenities?, fields: [{external_id (required, "manual:" prefix), name (required), surface, size, price_per_hour?}]}`. Enums: surface `turf|grass|concrete|indoor`; size `5v5|7v7|11v11|futsal|3v3`; venue_type `public_park|private|community_centre`. Ingest with `bun run scrape -- manual` from `apps/api/`.

### Tuning constants (all verified in code)

| Constant | Value | Where | Meaning |
|---|---|---|---|
| `MAX_MARKERS` | 50 | `fieldstack-app/src/screens/main/ExploreScreen.tsx:68` | fixed map marker pool size; overflow shows a banner. Do not raise casually: the pool exists to avoid mount/unmount crashes (see onside-architecture-contract) |
| `SNAP_POINTS` | 22% / 55% / 92% | ExploreScreen.tsx:73 | bottom sheet snap points |
| `REFETCH_PAN_THRESHOLD_KM` | 1.5 | ExploreScreen.tsx:72 | map pan distance that triggers a re-search |
| `DEFAULT_RADIUS_KM` | 75 | `fieldstack-app/src/hooks/useFieldSearch.tsx:44` | app search radius |
| API rate limit | 60 req/min per IP | `apps/api/src/index.ts:45-56` | global; /search/fields repeats it per-route |
| `SEARCH_TTL_SECONDS` | 30 | `apps/api/src/lib/queries/search.ts:7` | Redis TTL for search |
| `PROXIMITY_TTL_SECONDS` | 60 | `apps/api/src/lib/queries/venues.ts:10` | Redis TTL for proximity /venues |
| `FRESHNESS_DAYS` | 14 | `apps/api/scripts/scrape/run.ts:63` | staleness report threshold |
| `ZERO_GUARD_MIN` | 5 | `apps/api/scripts/scrape/lib/monitor.ts:24` | zero-rows guard floor |
| Dedupe AUTO tier | `AUTO_RADIUS_M` 200, `AUTO_RADIUS_GENERIC_M` 30, `AUTO_NAME_SIM` 0.85 | `apps/api/scripts/scrape/lib/dedupe.ts:47-50` | auto-merge thresholds |
| Dedupe REVIEW tier | `REVIEW_RADIUS_M` 100, `REVIEW_NAME_SIM` 0.3 | dedupe.ts:51-52 | human-review candidates |
| `SOURCE_PRIORITY` | manual 4 > playtomic 3 > municipal 2 > google 1 > osm 0 | dedupe.ts:142 | dedupe winner ladder |
| Google source | 5 `SEARCH_TERMS` x 10 cities x up to 3 pages; 2000ms page-token wait; 150ms between queries | `sources/googlePlaces.ts:29,114,163,166` | discovery volume and politeness |
| Playtomic source | `SEARCH_RADIUS_M` 20000; sports FUTSAL + FOOTBALL7 only | `sources/playtomic.ts:32-33` | 0 GTA results is the expected steady state |
| enrichPhotos | `PAGE_SIZE` 1000, `MATCH_RADIUS_M` 300, `MAX_PHOTOS` 4, `DELAY_MS` 120 | `scripts/scrape/enrichPhotos.ts:60-66,170` | weekly photo refresh tuning |

Config-adjacent inconsistency, known and unresolved: two scraper User-Agent identities coexist (`Onside-scraper/1.0` in osm.ts, `FieldStack-scraper/1.0` in arcgis.ts and playtomic.ts). Do not "fix" casually; see onside-failure-archaeology before unifying.

## Supabase local stack (supabase/config.toml)

project_id `soccer`. Ports: API 54321, DB 54322 (shadow 54320), pooler 54329, Studio 54323, Inbucket (local email) 54324. Seed enabled (`supabase/seed.sql`). All Supabase CLI use goes through `apps/api` npm scripts with `--workdir ../..` because `supabase/` lives at the repo root: `db:start`, `db:stop`, `db:reset`, `db:push` (remote prod push), `db:types`.

## Known gaps (as of 2026-07-05, all verified)

1. `EXPO_PUBLIC_SENTRY_DSN` absent from eas.json: production crash reporting is OFF. The only crash signal is App Store crash logs.
2. eas.json preview profile ships the PostHog placeholder string: preview builds have no analytics and resolve all remote flags to off.
3. `EXPO_PUBLIC_FF_IN_APP_BOOKING` is not documented in `fieldstack-app/.env.example`.
4. Fly runtime secret list and `ALLOWED_ORIGINS` prod value are not inspectable from the repo.
5. `https://api-staging.getonside.ca` (preview profile) is not provably deployed.
6. `site/README.md` Vercel step 4 still describes the old OG-image token import and is textually garbled; the code imports `site/lib/tokens.generated.json`.

Config changes are code changes: branch per issue, PR with `Closes #N`, CI green, merge commit (onside-change-control has the full rules). Never route around the scraping rules in `docs/scraping.md` when touching scrape config.

## Provenance and maintenance

Each fact above can drift. One-line re-verification, run from `/Users/laith/code/soccer`:

| Fact | Re-verify with |
|---|---|
| All env consumers (api, scripts, site, app) | `grep -rn "process.env" apps/api/src apps/api/scripts site/lib site/app fieldstack-app/src --include="*.ts" --include="*.tsx" \| grep -v node_modules` |
| Env templates | `cat apps/api/.env.example fieldstack-app/.env.example` |
| EAS profiles and their env | `cat fieldstack-app/eas.json` |
| Repo secrets consumed | `grep -n "secrets\." .github/workflows/*.yml` |
| Secret-skip idiom still present | `grep -n "::notice::" .github/workflows/*.yml` |
| Flag union, resolution order, override var | `grep -n "FlagName\|EXPO_PUBLIC_FF_\|resolveFlag" fieldstack-app/src/lib/featureFlags.ts` |
| Flag-off invariant | `grep -n "flagOn" fieldstack-app/src/lib/bookingAction.ts` |
| Token axes and values | `python3 -c "import json;t=json.load(open('design/tokens.json'));print(len(t['color']['light']),t['spacing'],t['radius'],t['fontSize'])"` |
| Token outputs and guards in CI | `grep -n "git diff --exit-code" .github/workflows/ci.yml` |
| Tokens in sync right now | `node design/generate.mjs && git diff --stat design fieldstack-app/src/theme/palette.ts site/app/tokens.css site/lib/tokens.generated.json` |
| app.json essentials | `grep -n "bundleIdentifier\|runtimeVersion\|u.expo.dev\|UsageDescription\|NSPrivacyTracking" fieldstack-app/app.json` |
| Registry files and schemas | `ls apps/api/scripts/scrape/data/ && head -60 apps/api/scripts/scrape/data/operators.yaml` |
| Operator count | `grep -c "^  - name:" apps/api/scripts/scrape/data/operators.yaml` |
| Dedupe thresholds | `grep -n "_RADIUS_M\|_NAME_SIM\|SOURCE_PRIORITY" apps/api/scripts/scrape/lib/dedupe.ts` |
| Marker pool and app search radius | `grep -n "MAX_MARKERS" fieldstack-app/src/screens/main/ExploreScreen.tsx; grep -n "DEFAULT_RADIUS_KM" fieldstack-app/src/hooks/useFieldSearch.tsx` |
| Scrape/enrich constants | `grep -n "FRESHNESS_DAYS\|ZERO_GUARD_MIN\|MATCH_RADIUS_M\|MAX_PHOTOS\|DELAY_MS" apps/api/scripts/scrape/run.ts apps/api/scripts/scrape/lib/monitor.ts apps/api/scripts/scrape/enrichPhotos.ts` |
| Fly [env] block | `sed -n '/\[env\]/,/^$/p' apps/api/fly.toml` |
| Fly runtime secrets (needs Fly auth) | `cd apps/api && fly secrets list` |
| Supabase local ports | `grep -n "^port\|^project_id" supabase/config.toml` |
| Sentry DSN still missing from builds | `grep -c "SENTRY_DSN" fieldstack-app/eas.json` (0 means still missing) |
| PostHog placeholder still in preview | `grep -n "REPLACE_WITH_POSTHOG" fieldstack-app/eas.json` |
