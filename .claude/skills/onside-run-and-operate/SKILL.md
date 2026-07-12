---
name: onside-run-and-operate
description: Operating runbook for the Onside repo (GTA soccer-field discovery). Load when you need to RUN or SHIP something that already exists, such as run the scrape pipeline or a single source, interpret a scrape run summary or its guards and exit codes, trigger or read the weekly Scrape GitHub Action, refresh venue photos (enrichPhotos), dedupe venues (dry run vs --apply), clean Google noise (refine), seed a local database, push migrations to prod (db:push), regenerate DB types, deploy the Fastify API to Fly.io, check or force a Vercel site deploy, build and submit the iOS app with EAS, or ship an OTA update. Also the home of "add a scrape source": registering a new adapter in the pipeline. Trigger phrasings include "run the scraper", "scrape one source", "why did the scrape exit 1", "kick off the Scrape workflow", "photos are stale, refresh them", "apply dedupe", "push the migration", "deploy the API", "is the site deployed", "ship an app build", "send an OTA update", "add an operator booking URL", "what external_id prefix", "add a scrape source", "write a new adapter".
---

# Onside: run and operate

How to run and ship every operational surface of this repo: the scrape pipeline, the weekly automation, database pushes, and the three deploy targets (Fly API, Vercel site, EAS iOS app). Everything here is verified against the repo at the commit current on 2026-07-05.

Jargon used once and defined here:
- **Scrape pipeline**: scripts in `apps/api/scripts/scrape/` that pull venue and field data from public sources into Supabase Postgres.
- **Adapter / source**: one module in `apps/api/scripts/scrape/sources/` that fetches one upstream (OSM, a city open-data portal, Google Places, Playtomic).
- **external_id**: the stable per-source key on `venues` and `fields` rows. Upserts conflict on it, which is what makes re-runs idempotent (safe to repeat).
- **Service-role key**: the Supabase credential that bypasses Row Level Security. Scrape and seed scripts use it; the API server deliberately does not.
- **OTA update**: an over-the-air JavaScript-only app update via EAS Update, no App Store review.

## When NOT to use this skill

| You actually want | Go to |
|---|---|
| Something is broken and you need triage steps | onside-debugging-playbook |
| Shipping the Matchday release end to end (screenshots, privacy labels, review gates) | onside-launch-campaign |
| Where an env var or secret is set or consumed, flag resolution | onside-config-and-flags |
| Setting up a dev environment from scratch | onside-build-and-env |
| How changes are gated (PR per issue, CI, merge rules) | onside-change-control |
| Dedup math, licences, platform landscape theory | venue-data-reference |
| Past incidents behind these rules | onside-failure-archaeology |
| Measuring instead of eyeballing | onside-diagnostics-and-tooling |

## Where output lands

| Thing | Where to look |
|---|---|
| Scraped venues/fields/operators | Supabase Postgres, project ref `hjvaoshvvjfygfeuzrfh` (prod) |
| Scrape run logs | GitHub Actions, workflow "Scrape": `gh run list --workflow=Scrape` |
| API runtime logs | `cd apps/api && fly logs` (app `onside-api-wild-current-9606`) |
| Site deploys | Vercel dashboard, or `gh api repos/LaithAlz/fieldstack/deployments` |
| App analytics | PostHog (US cloud); site analytics is Vercel Analytics |
| Crash reports | Sentry is wired in code; prod reporting depends on the DSN gap tracked in onside-config-and-flags (known gap 1) |

## 1. Scrape pipeline

### Prerequisites

All scrape commands run from `apps/api` and read `apps/api/.env` (dotenv). Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The `google` source and `enrichPhotos.ts` additionally require `GOOGLE_PLACES_API_KEY`. The runner exits 1 immediately if the Supabase pair is missing, even for `list`.

DANGER: these scripts write to whatever `SUPABASE_URL` points at. Check `apps/api/.env` before running anything with the service-role key. `http://127.0.0.1:54321` is the local stack; anything `*.supabase.co` is prod.

### Command anatomy

```sh
cd /Users/laith/code/soccer/apps/api
bun run scrape -- list          # print available sources
bun run scrape -- osm           # run one source
bun run scrape -- all           # run every source in sequence
```

`bun run scrape` maps to `bun scripts/scrape/run.ts` (package.json). The argument after `--` is the source slug. Every run first upserts all operators from `data/operators.yaml`, then runs the adapter(s), then upserts venues (`onConflict: external_id`, setting `data_source='scrape'`, `last_scraped_at=now()`, `is_active=true`) and their fields.

### The 7 sources (as of 2026-07-05)

| Slug | What it is | external_id scheme (venue / field) |
|---|---|---|
| `osm` | OpenStreetMap Overpass, named soccer pitches and sports centres, per city in `data/cities.yaml` (10 GTA cities) | `osm:<type>/<id>` / `osm:field-<type>-<id>` |
| `manual` | Hand-entered venues from `data/manual-venues.yaml` (currently empty: `venues: []`) | `manual:*` by convention |
| `google` | Google Places (New) Text Search: discovery of private and indoor facilities. Needs `GOOGLE_PLACES_API_KEY` | `google:<place_id>` / `google:<place_id>:field-1` |
| `playtomic` | Playtomic tenants API, futsal and 7-a-side discovery. Zero GTA results is the expected steady state, not a failure | `playtomic:<tenant_id>` / `playtomic:<tenant_id>:<resource_id>` |
| `mississauga` | City of Mississauga open data (ArcGIS GeoJSON), outdoor park fields grouped by parent park | `mississauga:parent-<PARENTID>` (fallback `mississauga:park-<slug>`) / `mississauga:field-<GISKEY or OBJECTID>` |
| `toronto` | City of Toronto PFR Sport Field layer (ArcGIS) plus CKAN parks join for addresses | `toronto:park-<slug>` / `toronto:field-<ASSET_ID>` |
| `brampton` | City of Brampton GeoHub ParkFeatures (ArcGIS), MultiPoint bundles exploded into placeholder fields | `brampton:park-<ID>` / `brampton:field-<ID>-<n>` |

The definitive list is the `ADAPTERS` map in `apps/api/scripts/scrape/run.ts`.

### Adding a source (new adapter)

1. **Robots/ToS check FIRST** for any new upstream; nothing may route around
   `docs/scraping.md` section 4.4 (rules: onside-change-control, section 9).
2. Write the adapter at `apps/api/scripts/scrape/sources/<slug>.ts` exposing
   `{ source, label, run(): Promise<ScrapedVenue[]> }` (types in
   `scripts/scrape/types.ts`), then register it in the `ADAPTERS` map in
   `scripts/scrape/run.ts`.
3. Pick a NEW `external_id` prefix `<slug>:` for venues and fields. Never reuse
   or rename a prefix; it is the provenance key for upserts, guards, and the
   dedupe priority ladder (onside-architecture-contract, section 6).
4. Prove it before merge: live-probe the upstream first
   (onside-proof-and-analysis-toolkit, Recipe 1), add mapper unit tests
   (pattern: `apps/api/tests/municipal.test.ts`), and record a live smoke count
   in the PR (onside-validation-and-qa, "Live adapter smoke").
5. Update `docs/scraping.md` in the same PR (current-state sections 0/1 plus
   the section 5 build order, per onside-docs-and-writing) and state the
   source's licence in the adapter header (public claims and attribution
   duties: onside-external-positioning).

### Reading the run summary

Every run ends with a per-source block plus a freshness line:

```
[scrape] ── run summary ──────────────────────────
[scrape] osm          fetched 412  upserted 410 venues / 455 fields
[scrape] playtomic    fetched 0    upserted 0 venues / 0 fields
[scrape] freshness: 12 active venues not rescraped in 14+ days
```

How to read it:
- `fetched` = venues the adapter returned from upstream. A source that threw prints a `FAILED` line with its error message instead.
- `upserted` = rows actually written. `fetched` slightly above `upserted` is normal (individual bad rows are warned and skipped).
- `freshness` counts active venues whose `last_scraped_at` is older than 14 days (`FRESHNESS_DAYS` in run.ts). A growing number means a source has been quietly failing for weeks.

### Guards and exit codes

Two guards run after the summary (pure logic in `apps/api/scripts/scrape/lib/monitor.ts`):

| Guard | Trips when | Meaning |
|---|---|---|
| `ZERO-ROWS GUARD` | A source fetched 0 venues while the DB already holds at least 5 active venues under that source's external_id prefix (`ZERO_GUARD_MIN = 5`) | The upstream probably changed shape and the adapter is silently returning nothing. Adapter errors do NOT count here (they are already surfaced as FAILED) |
| `WRITE-FAILURE GUARD` | A source fetched more than 0 but upserted 0 venues | Systemic write failure: schema drift after a migration that was never pushed, or an RLS/credential problem |

Exit code semantics of `run.ts`:
- **exit 0**: no adapter threw, no guard tripped (also for `list`).
- **exit 1**: missing Supabase env, unknown source slug, any adapter threw, or either guard tripped. In an `all` run one failing adapter does not stop the others; it is recorded and the process exits 1 at the end.

So a red run can still have written thousands of good rows. Read the summary block before assuming nothing happened.

### Follow-up passes

**refine (Google noise cleanup)**, from `apps/api`:

```sh
bun run scrape:refine            # dry run, prints the plan
bun run scrape:refine -- --apply # actually deactivate
```

Scope: only venues with `external_id LIKE 'google:%'`. Deactivates club/academy/training listings with no facility signal, then dedupes per address. Reversible (flips `is_active`, never deletes). Critical cycle rule (documented in refine.ts header): `bun run scrape -- google` re-upserts everything as active, wiping the previous refine. **Run refine after every google scrape.** Hand-audited keepers go in the `ALLOWLIST` set inside refine.ts (empty as of 2026-07-05).

**enrichPhotos (Google photo refresh)**, from `apps/api`:

```sh
bun scripts/scrape/enrichPhotos.ts            # all active venues
bun scripts/scrape/enrichPhotos.ts --limit 5  # first N, for testing
```

Fills `venues.photos` + `venues.photo_attributions` from Google Places, storing keyless short-lived `lh3.googleusercontent.com` URIs. Because those URIs expire, the weekly re-run is load-bearing, not polish: if it stops, venue photos rot into broken images. It back-fills `venues.google_place_id` so future runs skip paid lookups. Venues with no confident match are left untouched (clients fall back to a satellite hero image).

**dedupe (cross-source duplicates)**, from `apps/api`:

```sh
bun scripts/scrape/dedupe.ts          # dry run: prints AUTO and REVIEW pairs
bun scripts/scrape/dedupe.ts --apply  # deactivate AUTO-tier losers only
```

Scans up to 2000 active venues. AUTO tier (same spot, near-identical name) is safe unattended; `--apply` soft-deletes the loser (`is_active=false`, `duplicate_of=keeper.id`, reversible). REVIEW tier is only ever printed; a human resolves those by reading the weekly job log. Winner choice follows the source-priority ladder in `apps/api/scripts/scrape/lib/dedupe.ts` (manual > playtomic > municipal > google > osm). For the matching math, load venue-data-reference.

**seed (local dev only)**, from `apps/api`:

```sh
npm run seed
```

WIPES operators, venues, and fields entirely (waitlist kept) and inserts 15 hardcoded GTA venues with made-up prices. Service-role. Never point this at prod; check `SUPABASE_URL` first.

## 2. Weekly automation: `.github/workflows/scrape.yml`

Runs Mondays 08:00 UTC (cron `0 8 * * 1`) plus manual `workflow_dispatch`. Three steps, in order, all from `apps/api`:

| Step | Command | Gating |
|---|---|---|
| 1. Scrape all sources | `bun scripts/scrape/run.ts all` | Skips with a `::notice::` and exit 0 if Supabase secrets are unset (the secret-skip idiom, safe on forks) |
| 2. Enrich venue photos | `bun scripts/scrape/enrichPhotos.ts` | `if: always()` so a red scrape step cannot suppress the photo refresh (URI rot, see above) |
| 3. Dedupe | `bun scripts/scrape/dedupe.ts --apply` | `if: always()`; only AUTO tier applies, REVIEW pairs land in the log for a human |

Interpretation rule: a red weekly run usually means one source failed or a guard tripped, while steps 2 and 3 still ran. Open the run log, find the summary block, and check which source it was before doing anything.

Operate it:

```sh
gh workflow run scrape.yml --ref main   # manual refresh, from anywhere in the repo
gh run list --workflow=Scrape --limit 5 # recent runs
gh run watch <run-id>                   # follow a run
gh run view <run-id> --log | grep -E "GUARD|FAILED|run summary" -A 3
```

Secrets consumed (repo settings, not in the repo): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY`.

## 3. Data conventions and the operators registry

### external_id namespaces

Every scraped row's `external_id` starts with its source slug followed by a colon (see the sources table above). `sourcePrefixCounts` in monitor.ts and the dedupe source ladder both key off this prefix, so never invent rows with a prefix belonging to another source. Hand-added rows belong in `data/manual-venues.yaml` with `manual:` ids.

### operators.yaml: the whole update cycle is edit YAML, rerun scrape

`apps/api/scripts/scrape/data/operators.yaml` (21 operators as of 2026-07-05) is the registry of private-facility businesses. The header comment in the file is the schema doc. Keys that matter operationally:

- `name`, `aliases`: case-insensitive substring match against scraped venue names (one-way: operator name inside venue name). Add an alias when a venue should link to an operator but does not.
- `booking_url`, `website`: plain links.
- `integration_type` (`none` | `playtomic` | `courtreserve` | `amilia`) plus exactly one matching platform key: `courtreserve_org_id` (numeric OrgId), `amilia_rewrite_url` (storefront slug), `playtomic_slug` (club slug). These generate platform deep links.

Booking link precedence per field (implemented in `apps/api/scripts/scrape/lib/platformLinks.ts`, `resolveFieldBooking`):
1. The field's own scraped `bookingUrl` (a platform adapter knows best), which is also the only case where a field-supplied `booking_platform` tag is trusted.
2. The operator's platform deep link built from `integration_type` + its id key.
3. The operator's plain `booking_url`, then `website`, tagged platform `none` (an inherited plain URL is never tagged with the operator's integration type, because the app appends date/time params only to real platform links).

There is no separate sync step: edit the YAML, then `cd apps/api && bun run scrape -- all` (or the single relevant source). The run upserts operators first, then venues and fields pick up the new links. Registry parse errors throw and fail the run; a platform `integration_type` without its id key only warns.

## 4. Database operations

All Supabase CLI use goes through `apps/api` npm scripts with `--workdir ../..` (the CLI is an apps/api devDependency; `supabase/` lives at the repo root, 25 migrations as of 2026-07-05).

```sh
cd /Users/laith/code/soccer/apps/api
bun run db:start    # boot local stack (API 54321, DB 54322, Studio 54323)
bun run db:reset    # recreate local DB: all migrations + supabase/seed.sql
bun run db:push     # push migrations to the LINKED REMOTE (prod). Manual only.
bun run db:types    # regenerate types/database.ts from the local stack
```

Rules that keep this safe:
- **db:push is manual and post-merge.** Nothing in CI pushes migrations to prod. The Migrations workflow (PRs touching `supabase/`) replays every migration on a fresh local stack and, if secrets are configured, dry-runs `db push` against prod to detect merged-but-never-pushed drift. So: merge the PR with CI green, then run `bun run db:push` yourself. This ordering is change control; do not route around it.
- **Drop function first when changing a signature.** Postgres forbids `create or replace function` across a return-type change; migration 019 shipped without the drop and broke fresh replays, the incident that created the Migrations CI job (story: onside-failure-archaeology incident 5; decision table: onside-proof-and-analysis-toolkit Recipe 6). The drop must name the argument types: `drop function if exists fn(arg_types);`.
- **Enum additions (`alter type ... add value`) cannot run inside an explicit transaction block** (see migration 008).
- **Generated types are stale, and that is currently tolerated.** `apps/api/types/database.ts` was last regenerated 2026-06-16 and lacks everything from migrations 022 to 025 (`photo_attributions`, `duplicate_of`, `google_place_id`, `booking_requests`). It does not break because the scrape scripts create untyped Supabase clients and the typed API server never references the missing columns. If you regenerate, expect a large diff covering those objects; commit it through the normal PR flow, or leave it alone if your change does not need the new types.

## 5. Deploys

### API to Fly.io (MANUAL deploy)

CORRECTED 2026-07-09: there is NO automatic API deploy. A file `.github/workflows/fly-deploy.yml` exists in some working trees but it is UNTRACKED (never committed; `git ls-files .github/workflows/` lists only ci, migrations, scrape, and GitHub registers exactly those three). Deploy manually: `cd apps/api && flyctl deploy --remote-only`. App `onside-api-wild-current-9606`, region `yyz` (Toronto), port 3000, `/health` check, `min_machines_running = 1` to avoid cold starts. Runtime credentials (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional `REDIS_URL`) live in Fly secrets, not the repo; `fly.toml` only sets HOST/PORT/NODE_ENV/TRUST_PROXY. Corollary: merging API server changes does NOT ship them; RPC-only changes ship via `db:push` alone (the route passes the RPC jsonb through, proven live with migration 026). Committing the workflow (plus setting `FLY_API_TOKEN`) is an owner decision, tracked in issue #492's footnote.

Manual operations (all from `apps/api`, where `fly.toml` lives so flyctl picks up the app):

```sh
cd /Users/laith/code/soccer/apps/api
fly deploy                      # manual deploy, same as CI
fly status                      # machine state
fly logs                        # tail runtime logs
fly secrets list                # names only, never values
curl -s https://api.getonside.ca/health
# expect {"data":{"supabase":"ok","redis":"ok"}} ("redis":"error" is degraded, not down)
```

Longer setup detail (custom domain, Upstash Redis) is in `docs/deploy-backend.md`.

### Site to Vercel (automatic on merge)

The Next.js site (`site/`) deploys via Vercel's GitHub integration on push to `main`; Root Directory `site` is set in the Vercel dashboard (there is no `vercel.json` in the repo). Production deploys typically complete in a couple of minutes. Venue content is baked at BUILD time from Supabase, so new scraped venues appear on getonside.ca only after the next deploy: push any commit to main, or hit Redeploy in the Vercel dashboard, after a big scrape you want reflected.

Check what is live without dashboard access:

```sh
gh api repos/LaithAlz/fieldstack/deployments \
  --jq '.[0:5][] | {env: .environment, sha: .sha[0:7], created: .created_at}'
```

If the deploy is green but the browser shows old content, suspect CDN caching first: hard-refresh (Cmd+Shift+R) before debugging the build.

If that list shows NO Production entry for your merge SHA, Vercel missed the main push
(it happened on 2026-07-12; story: onside-failure-archaeology incident 19). Trigger a
deploy without touching code:

```sh
git commit --allow-empty -m "Trigger site deploy" && git push origin main
```

After merging any site change, confirm a Production deployment exists for the merge
before evaluating the change on getonside.ca.

### iOS app via EAS

This section is the raw build/submit mechanics only. For the full App Store
release campaign (screenshot slots, privacy labels, UGC review notes,
submission gates), follow onside-launch-campaign Front A.

From `fieldstack-app/` (requires Expo + Apple logins, so a human usually runs these):

```sh
cd /Users/laith/code/soccer/fieldstack-app
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

- Build numbers auto-increment (`appVersionSource: remote`, `autoIncrement: true` on the production profile). Bump `expo.version` in `app.json` by hand only for a user-facing version change (1.1.0 as of 2026-07-05).
- Production profile env is committed in `eas.json` (API URL, Supabase anon pair, PostHog key). Check for `EXPO_PUBLIC_SENTRY_DSN` there: the crash-reporting gap is tracked in onside-config-and-flags (known gap 1).

**OTA updates**: `eas update --branch production --message "..."` ships JS-only fixes to matching live builds. Ground truth that overrides `docs/releasing.md` where they conflict:
- `runtimeVersion` policy is `appVersion` (app.json; changed in commit dfa32cd). docs/releasing.md still says `fingerprint`; that part of the doc is stale. Under `appVersion`, an OTA update reaches only binaries built from the same `expo.version` AND the same channel.
- The EAS Update URL was added to app.json on 2026-06-24 (commit f04a993). Any store binary built BEFORE that has no OTA client config and can never receive updates. As of 2026-07-05 it is believed the currently-live store binary predates this, meaning a full `eas build` + `eas submit` is required to deliver anything to users; this is not provable from the repo alone, so confirm the live build's date in App Store Connect or the EAS dashboard before relying on OTA.
- Never run `eas update --branch production` while a build is In Review (Apple reviews the exact binary). Use `--branch preview` for internal testing instead. Full policy: `docs/releasing.md`.

## 6. Provenance and maintenance

Facts here drift. Re-verify from the repo root:

| Fact (as of 2026-07-05) | Re-verify with |
|---|---|
| 7 sources and their slugs | `grep -h "source: \"" apps/api/scripts/scrape/sources/*.ts` |
| Guard thresholds (min 5, write-failure rule) | `sed -n '20,62p' apps/api/scripts/scrape/lib/monitor.ts` |
| Freshness window 14 days | `grep -n FRESHNESS_DAYS apps/api/scripts/scrape/run.ts` |
| Weekly cron Mon 08:00 UTC, 3 steps, if always() | `sed -n '1,95p' .github/workflows/scrape.yml` |
| Fly app name / region / min machines | `sed -n '1,30p' apps/api/fly.toml` |
| 25 migrations | `ls supabase/migrations | wc -l` |
| 21 operators / 10 cities | `grep -c "^  - name:" apps/api/scripts/scrape/data/operators.yaml apps/api/scripts/scrape/data/cities.yaml` |
| manual-venues.yaml still empty | `grep -n "venues:" apps/api/scripts/scrape/data/manual-venues.yaml` |
| DB types still stale (0 means yes) | `grep -c google_place_id apps/api/types/database.ts` |
| runtimeVersion policy appVersion, app version | `python3 -c "import json;x=json.load(open('fieldstack-app/app.json'))['expo'];print(x['version'],x['runtimeVersion'])"` |
| OTA reachability of the live binary (UNVERIFIED from repo) | App Store Connect build date vs commit f04a993 (2026-06-24) |
| Latest scrape runs green | `gh run list --workflow=Scrape --limit 3` |
| Vercel prod deploy sha | `gh api repos/LaithAlz/fieldstack/deployments --jq '.[0]'` |
