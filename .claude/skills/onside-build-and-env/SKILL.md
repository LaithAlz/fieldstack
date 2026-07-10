---
name: onside-build-and-env
description: >
  From-scratch machine setup for the Onside repo (soccer): which package manager
  each package uses (bun for apps/api, npm ONLY for fieldstack-app and site),
  fresh clone to a running API, iOS app, and marketing site, .env files and what
  breaks without each one, local Supabase (db:start, db:reset, seed), the iOS
  simulator + Expo Go loop, the LAN-vs-localhost Metro trap, when a custom dev
  build is required (onside:// deep links, Maestro screenshots), design token
  regeneration, and a 10-minute smoke checklist. Load on phrasings like
  "set up this repo", "bun install or npm ci?", "jest fails after bun install",
  "the app can't reach my local API", "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
  "supabase start fails", "deep link does nothing in
  Expo Go", or "which node_modules do I install".
---

# Onside: build and environment setup

Everything here was verified against the repo on 2026-07-05. `<repo>` means the
repo root (locally `/Users/laith/code/soccer`; substitute your clone path).

## When NOT to use this skill

| You want to... | Use instead |
|---|---|
| Run the scraper, deploy the API/site/app, push migrations to prod, ship an OTA update | onside-run-and-operate |
| Know what an env var or feature flag MEANS, EAS profile diffs, secrets inventory | onside-config-and-flags |
| Understand PR/CI gates and merge rules before changing code | onside-change-control |
| Debug something that is broken (red pins, stuck splash, scrape red, etc.) | onside-debugging-playbook |
| The full story behind an incident referenced here | onside-failure-archaeology |
| Know what evidence a change needs (tests, golden checks) | onside-validation-and-qa |

## Repo shape (load-bearing)

- There is NO root `package.json`. Three independent Node projects, each with its
  own `node_modules/` and its own tracked `package-lock.json`:
  `apps/api` (Fastify API + scrape/seed scripts), `fieldstack-app` (Expo/React
  Native iOS app, live on the App Store as id6780034337), `site` (Next.js
  marketing site, getonside.ca on Vercel).
- `supabase/` at the repo root holds the shared database: `config.toml`,
  `migrations/` (25 files, `001_init.sql` through `025_booking_requests.sql`,
  as of 2026-07-05), and an intentionally empty `seed.sql` (real seeding is
  `apps/api/scripts/seed.ts`).
- `design/tokens.json` + `design/generate.mjs` are the single source of design
  tokens for both the app and the site (see "Design token pipeline").
- **`package-lock.json` is the lockfile of record everywhere.** `bun.lock` is
  gitignored on purpose (`.gitignore` lines 6-8: committing it breaks the
  frozen-lockfile install). Never commit a `bun.lock`.

### Package manager matrix (memorize this)

| Package | Install | Why |
|---|---|---|
| `apps/api` | `bun install --frozen-lockfile` | Matches CI (`.github/workflows/ci.yml` backend job). `npm install` also works (root README uses it); both resolve from `package-lock.json`. |
| `fieldstack-app` | `npm ci` ONLY, never bun | Incident: bun's different `node_modules` hoisting broke EAS cloud builds; unified on npm (PR #429 commit e79cfa8, PR #419 commit fd49d89). Full mechanism: onside-failure-archaeology incident 6. |
| `site` | `npm ci` | Matches CI site job and Vercel. |

Runtime split inside `apps/api`: the server (`dev`, `start`) and `seed` run under
Node via `tsx` (a TypeScript runner shipped as a runtime dependency); `test` and
the `scrape*` scripts run under bun. `bunfig.toml` scopes `bun test` to
`apps/api/tests/` so it never picks up the app's jest tests.

## Prerequisites

| Tool | Version reference (as of 2026-07-05) | Needed for |
|---|---|---|
| Node.js | 20 (CI jobs pin Node 20; API Docker image is `node:20-slim`) | everything |
| bun | CI uses `oven-sh/setup-bun@v2` with `bun-version: latest`; 1.3.x known good locally | apps/api install/tests/scrape |
| Docker Desktop | any recent | `supabase start` (local Postgres stack) |
| Xcode + iOS Simulator | any recent | running the app |
| Supabase CLI | do NOT install globally; it is an `apps/api` devDependency (`supabase` ^1.200.3) reached via the `db:*` scripts or `bunx supabase` | local DB |
| Maestro CLI | optional; install per `.maestro/README.md` (curl installer or Homebrew tap) | e2e smoke flows (`.maestro/`) |
| EAS CLI | optional (`npx eas-cli`) | cloud builds; not needed for local dev |

## apps/api from scratch

```sh
cd <repo>/apps/api
bun install --frozen-lockfile
cp .env.example .env    # then fill values, see table below
```

`.env.example` has exactly these 8 vars (names verified 2026-07-05):

| Var | Required? | Notes |
|---|---|---|
| `SUPABASE_URL` | YES, server throws at import without it | `http://127.0.0.1:54321` for local stack |
| `SUPABASE_ANON_KEY` | YES, same throw | printed by `db:start`; the API reads through RLS with the anon key by design |
| `SUPABASE_SERVICE_ROLE_KEY` | only for `seed` and `scrape*` | bypasses RLS; never ships to clients |
| `REDIS_URL` | no | cache is best-effort; missing/bad URL logs a warning and disables caching, nothing crashes |
| `PORT` / `HOST` | no | defaults 3000 / 0.0.0.0 (0.0.0.0 is what makes the API reachable from a phone on your LAN) |
| `TRUST_PROXY` | no | only `true` behind a proxy (Fly); leave unset locally |
| `GOOGLE_PLACES_API_KEY` | only for the `google` scrape source and photo enrichment | |

Commands (all from `<repo>/apps/api`):

```sh
bun run typecheck   # tsc --noEmit
bun run test        # bun test, scoped to tests/ (119 tests / 11 files, as of 2026-07-05)
bun run dev         # tsx watch src/index.ts, listens on 0.0.0.0:3000
curl -s localhost:3000/health
# expect: {"data":{"supabase":"ok","redis":"ok"|"error"},"error":null}
# redis:"error" is fine locally; supabase:"error" returns HTTP 503
```

## Local Supabase (database)

The Supabase CLI runs Docker containers for Postgres 15, PostgREST, Auth, and
Studio. All `db:*` scripts live in `apps/api/package.json` and pass
`--workdir ../..` because `supabase/` is at the repo root.

```sh
cd <repo>/apps/api
bun run db:start    # boots the stack; prints API URL, anon key, service_role key
bun run db:reset    # drops + re-applies all 25 migrations + (empty) seed.sql
bun run seed        # tsx scripts/seed.ts: dev fixture data
```

- Ports (from `supabase/config.toml`): API 54321, Postgres 54322 (shadow 54320),
  Studio http://127.0.0.1:54323, Inbucket 54324.
- Paste the printed anon and service_role keys into `apps/api/.env`.
- `bun run seed` prints `✓ Seeded 5 operators, 15 venues, 34 fields.` (as of
  2026-07-05). **seed.ts WIPES operators/venues/fields at whatever
  `SUPABASE_URL` points to** (waitlist kept). Never run it with prod values in
  `.env`. Real data comes from the scrape pipeline (onside-run-and-operate).
- `bun run db:push` targets the LINKED REMOTE (prod). It is a deploy action,
  not a setup action; see onside-run-and-operate before touching it.

## fieldstack-app from scratch (iOS app)

```sh
cd <repo>/fieldstack-app
npm ci              # npm ONLY here, see matrix above
cp .env.example .env
```

`.env.example` has exactly these 6 vars. All are soft-required; the app boots
without any of them but degrades:

| Var | Without it |
|---|---|
| `EXPO_PUBLIC_API_URL` | falls back to prod `https://api.getonside.ca` + a dev warning |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | auth and account features disabled (warn, never throws at import) |
| `EXPO_PUBLIC_POSTHOG_KEY` (+optional `_HOST`) | analytics stays on the no-op console provider |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry no-ops (it is dev-disabled anyway) |

`EXPO_PUBLIC_*` values are inlined into the JS bundle when Metro (the React
Native dev bundler) starts. **After editing `.env`, restart Metro**
(`npx expo start -c` clears the cache).

### Point the app at your local API

1. Start the API first: `cd <repo>/apps/api && bun run dev`.
2. Launch the app with `npm run start` (or `npm run ios`) from
   `<repo>/fieldstack-app`. A `prestart`/`preios` hook runs
   `scripts/sync-api-url.js`, which rewrites `EXPO_PUBLIC_API_URL` in `.env` to
   `http://<your current LAN IPv4>:3000` (keeps an existing port, skips
   VPN/VM/loopback interfaces, no-ops if unchanged or `.env` missing).

**The LAN-vs-localhost trap**: on a physical phone, `localhost` is the phone,
so an `EXPO_PUBLIC_API_URL` of `http://localhost:3000` can never reach your
Mac. The sync hook exists to fix exactly this. Two ways to defeat it by
accident: (a) launching with `npx expo start` directly, which bypasses npm's
`prestart` hook, so prefer `npm run start`; (b) switching Wi-Fi networks mid
session (rerun `npm run start`). Phone and Mac must be on the same network.
The iOS simulator shares the Mac's network, so the LAN IP works there too.

### Expo Go vs a dev build

- **Expo Go** (Expo's sandbox app that loads your JS over Metro) runs the whole
  app, including the map: react-native-maps is bundled in Expo Go on both
  platforms (`fieldstack-app/README.md`, and the ExploreScreen/VenuePin comments
  describe map behavior specifically under "Expo Go 54"). Note one repo file
  disagrees: the `.maestro/screenshots.yaml` header claims the map needs a dev
  build; that claim is contradicted by the two sources above. Unresolved doc
  conflict, trust Expo Go until it visibly fails.
- **A dev build** (a custom-built binary containing the app's native modules and
  its `onside://` URL scheme) is required for:
  - `onside://` deep links. React Navigation's linking config hardcodes
    `prefixes: ["onside://"]` (`App.tsx:96`), and only a real build owns that
    scheme; inside Expo Go, links arrive as `exp://` and will not match.
  - the `.maestro/screenshots.yaml` flow (its `appId: app.onside.mobile`
    targets the real binary). The smoke flow `.maestro/smoke.yaml` targets
    `appId: host.exp.Exponent`, i.e. Expo Go, so it needs no dev build.
  - Simplest local dev build: `npx expo run:ios` from `fieldstack-app/`
    (prebuilds `ios/`, which is gitignored, then compiles with Xcode). The EAS
    `development` profile in `eas.json` has `ios.simulator: false`, so it
    produces device builds, not simulator builds.

### Simulator loop essentials

```sh
xcrun simctl list devices available | head -20   # find a device name
xcrun simctl boot "iPhone 16 Pro"                # or: open -a Simulator
cd <repo>/fieldstack-app && npm run start        # Metro; press i to open iOS
# or drive it by URL once Metro is up:
xcrun simctl openurl booted exp://127.0.0.1:8081 # opens Expo Go on the bundle
xcrun simctl ui booted appearance dark           # test dark theme (or: light)
xcrun simctl io booted screenshot shot.png       # capture evidence
```

Checks (from `<repo>/fieldstack-app`):

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm run test        # jest, jest-expo preset
# expect: Test Suites: 21 passed, Tests: 154 passed (as of 2026-07-05)
```

## site from scratch (Next.js marketing site)

```sh
cd <repo>/site
npm ci
npm run dev         # http://localhost:3000 (clashes with the API's port 3000; run one or the other, or change PORT)
npm run build       # production build + type checks
```

Env: `site/.env.local` with `SUPABASE_URL` and `SUPABASE_ANON_KEY` (same names
as the API, no `NEXT_PUBLIC_` prefix; venue data is fetched at build time).
**The build is green without any env**: `site/lib/venues.ts` returns an empty
venue list and warns `[venues] SUPABASE_URL / SUPABASE_ANON_KEY not set,
skipping venue pages`. CI builds the site with no secrets on every PR. With
env set, the build emits venue pages under `/venues/[slug]` (754 paths against
prod data as of 2026-07-05) plus ~21 `/soccer-fields/[city]` pages.

## Design token pipeline

`design/tokens.json` is the single source. Regenerate after ANY edit:

```sh
cd <repo>
node design/generate.mjs
# prints exactly two lines:
#   wrote fieldstack-app/src/theme/palette.ts
#   wrote site/app/tokens.css
# (it also silently rewrites site/lib/tokens.generated.json)
git diff --exit-code design fieldstack-app/src/theme/palette.ts site/app/tokens.css site/lib/tokens.generated.json
```

Never hand-edit the three generated files; skipping regeneration fails two CI
jobs. Output paths, drift guards, and the full procedure are homed in
onside-config-and-flags ("Design tokens as configuration").

## Known traps

| # | Trap | Rule |
|---|---|---|
| 1 | `bun.lock` is untracked by design | never commit it; `package-lock.json` is the record everywhere |
| 2 | bun in `fieldstack-app` | never; broke EAS builds (hoisting divergence, PRs #429/#419). If someone ran `bun install` there: `rm -rf node_modules bun.lock && npm ci` |
| 3 | Three separate `node_modules` | no workspace hoisting; install in each of the 3 dirs |
| 4 | `npx expo start` skips the `prestart` hook | use `npm run start` so sync-api-url runs |
| 5 | `.env` edits invisible in the app | `EXPO_PUBLIC_*` inlined at bundle time; restart Metro with `npx expo start -c` |
| 6 | `react-test-renderer` has no bundled types | an ambient shim exists (`fieldstack-app/src/types/react-test-renderer.d.ts`); do NOT install `@types/react-test-renderer` |
| 7 | `seed.ts` wipes venue tables | check `SUPABASE_URL` in `apps/api/.env` before `bun run seed`; local only |
| 8 | `supabase start` needs Docker running | first run downloads large images; transient registry pull flakes in CI have been reported anecdotally but are UNVERIFIED in this repo's run history (all recent Migrations runs green); remedy is rerun |
| 9 | Playwright is NOT a repo dependency | if you use it ad hoc for site screenshots, run `npx playwright install chromium` first (tooling practice, not a repo fact) |
| 10 | Never `git add -A` | untracked-on-purpose files live in the tree: `.env`, `bun.lock`, `dump.rdb`, prebuilt `ios/`/`android/` |
| 11 | Port 3000 double-booked | API default and `next dev` default are both 3000; run one at a time or override |
| 12 | `site/README.md` deploy step 4 is stale | the OG image now imports `site/lib/tokens.generated.json`, not `../../design/tokens.json` |

## 10-minute smoke checklist (fresh machine)

Run top to bottom; every step states its expected outcome. Counts are as of
2026-07-05 and will grow; treat "roughly this many, all green" as the bar.

```sh
# 1. Toolchain
node --version                # v20.x
bun --version                 # 1.x
docker info >/dev/null && echo docker-ok

# 2. API deps + checks
cd <repo>/apps/api
bun install --frozen-lockfile # exits 0, no lockfile writes
bun run typecheck             # exits 0, silent
bun run test                  # "119 pass, 0 fail ... 11 files"

# 3. Local DB
bun run db:start              # prints URLs + keys; Studio at 127.0.0.1:54323
bun run db:reset              # "Applying migration ..." x25, exits 0
# put printed anon + service_role keys into apps/api/.env, then:
bun run seed                  # "✓ Seeded 5 operators, 15 venues, 34 fields."

# 4. API up
bun run dev &                 # "Server listening at http://0.0.0.0:3000"
curl -s localhost:3000/health # {"data":{"supabase":"ok",...},"error":null}
curl -s "localhost:3000/venues?limit=1" | head -c 200   # one venue, {"data":[...

# 5. App deps + checks
cd <repo>/fieldstack-app
npm ci                        # exits 0
npm run typecheck && npm run lint   # both exit 0
npm run test                  # "Test Suites: 21 passed ... Tests: 154 passed"

# 6. App on simulator
npm run start                 # sync-api-url logs the LAN URL; press i
# Expo Go opens; Explore shows a map with pins and a "N fields near you" sheet

# 7. Tokens round-trip
cd <repo> && node design/generate.mjs && git diff --exit-code design \
  fieldstack-app/src/theme/palette.ts site/app/tokens.css site/lib/tokens.generated.json
                              # two "wrote" lines, diff exits 0

# 8. Site
cd <repo>/site && npm ci && npm run build
# green; without .env.local expect the "skipping venue pages" warning,
# with it expect ~750+ /venues/[slug] paths in the route table
```

## Provenance and maintenance

Each volatile fact above, with a one-line re-verification command (run from `<repo>`):

| Fact | Re-verify |
|---|---|
| Scripts + package managers per package | `cat apps/api/package.json fieldstack-app/package.json site/package.json` |
| CI installs (bun frozen for api, npm ci for app/site, Node 20) | `cat .github/workflows/ci.yml` |
| bun.lock untracked rationale | `sed -n 1,10p .gitignore` |
| Migration count (25) | `ls supabase/migrations` (count the files) |
| Supabase local ports / Postgres 15 | `grep -n -e port -e major_version supabase/config.toml` |
| seed.sql intentionally empty; seed via TS | `head -3 supabase/seed.sql` |
| API env var names (8) | `grep -oE '^[A-Z_0-9]+' apps/api/.env.example` |
| App env var names (6) | `grep -oE '^[A-Z_0-9]+' fieldstack-app/.env.example` |
| API throws without Supabase env | `sed -n 1,12p apps/api/src/lib/supabase.ts` |
| API test count (119/11) | `cd apps/api && bun run test` |
| App test count (154/21) | `cd fieldstack-app && npm run test` |
| Expo SDK 54 / RN 0.81.5 / React 19.1 | `grep -n -e '"expo":' -e '"react-native":' -e '"react":' fieldstack-app/package.json` |
| Next 16 / React 19.2 on site | `grep -n -e '"next":' -e '"react":' site/package.json` |
| sync-api-url behavior + pre hooks | `sed -n 1,20p fieldstack-app/scripts/sync-api-url.js; grep pre fieldstack-app/package.json` |
| Deep link prefixes onside:// only | `grep -n prefixes fieldstack-app/App.tsx` |
| Maestro appIds (Expo Go vs dev build) | `grep -n appId .maestro/*.yaml` |
| Maps-in-Expo-Go conflict | `sed -n 14,22p fieldstack-app/README.md; head -8 .maestro/screenshots.yaml` |
| Token generator outputs + drift guards | `node design/generate.mjs && git status --porcelain` and `grep -n "git diff" .github/workflows/ci.yml` |
| Site builds green without env | `grep -n "not set" site/lib/venues.ts` |
| Seed counts (5/15/34) | `cd apps/api && bun run seed` against a local stack |
| Site venue page count (754) | `cd site && npm run build` with prod env in `.env.local` |
| bun-for-app incident commits | `git log --oneline --grep="Unify mobile CI on npm"` and `git log --oneline --grep="babel-preset-expo"` |
