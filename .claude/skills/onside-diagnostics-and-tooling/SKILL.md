---
name: onside-diagnostics-and-tooling
description: How to MEASURE the Onside system (GTA soccer-field discovery; Expo app, Fastify API on Fly, scrape pipeline, Next.js site) instead of eyeballing it. Load when you need to check whether prod is healthy, probe the search API and read its data-quality distributions, count venues by source prefix, find orphaned or stale venues, read a weekly Scrape workflow log, interpret dedupe AUTO vs REVIEW lines, screenshot the site in both themes, verify the app on an iOS simulator in both appearances, confirm Metro is serving your edit (bundle freshness), run the design-token drift check, or look up analytics event names. Trigger phrasings include "is the API up", "is prod healthy", "how many venues do we have right now", "did the scrape work", "what did dedupe change", "why are prices all null", "screenshot the site in dark mode", "verify this on the simulator", "is my change actually in the bundle", "check token drift", "what events do we track", "measure it".
---

# Onside diagnostics and tooling

How to measure every surface of this system with copy-pasteable probes, plus how to
interpret what comes back. Repo root is `/Users/laith/code/soccer`; commands below state
their run-from directory. All probes here are read-only. Live numbers are date-stamped
(as of 2026-07-05) and WILL drift; re-verify with the commands in the last section.

Shipped scripts (this skill's `scripts/` dir, all tested against prod on 2026-07-05):

| Script | What it measures | Needs |
|---|---|---|
| `scripts/search-probe.sh` | Public search API: totals, venue_type / price / booking_url distributions | curl, jq |
| `scripts/db-spot-check.ts` | Prod DB truth: counts by source prefix, orphans, staleness, coverage | bun, `apps/api/.env` |
| `scripts/theme-shots.sh` | Site rendering in light AND dark | node/npx (Playwright) |
| `scripts/sim-verify.sh` | App on iOS simulator, screenshots in both appearances | macOS, Xcode simulators, Expo Go |

## When NOT to use this skill

- Something is broken and you need ranked causes: `onside-debugging-playbook`.
- You want to RUN the scraper / deploy / release, not measure it: `onside-run-and-operate`.
- You need env-var or secret locations: `onside-config-and-flags`.
- You are deciding what evidence a change needs before merge: `onside-validation-and-qa`.
- You want to publish a measured number (venue count etc.) externally: `onside-external-positioning`.
- Statistical method for turning a measurement into an accepted claim: `onside-proof-and-analysis-toolkit`.

## 1. API health

```sh
curl -s https://api.getonside.ca/health          # prod (Fly, region yyz)
curl -s http://localhost:3000/health             # local (cd apps/api && bun run dev)
```

Response envelope is always `{ data, error }`. Health payload: `{"data":{"supabase":"ok|error","redis":"ok|error"},"error":null}`.

| Output | Meaning | Action |
|---|---|---|
| HTTP 200, both `ok` | Fully healthy | none |
| HTTP 200, `redis:"error"` | Degraded but serving. Redis is best-effort cache only; every cache error falls through to live queries (`apps/api/src/lib/cache.ts`) | Fine to ignore for correctness. Sustained: check Fly `REDIS_URL` secret. NOTE: `redis:"error"` was the live prod steady state on 2026-07-05 |
| HTTP 503, `supabase:"error"` | Hard down: the Supabase HEAD-count check on `operators` failed. Fly pulls the instance from the LB on 503 | Check Supabase status / keys. See onside-debugging-playbook |
| Connection refused on localhost | API not running | `cd apps/api && bun run dev` (server runs under tsx/Node, port 3000) |

Budget: the API rate-limits at 60 req/min per IP globally (429 with code `RATE_LIMITED`).
Probe scripts here make 1 request each; do not loop them tightly.

## 2. Search probe (public API data quality)

```sh
/Users/laith/code/soccer/.claude/skills/onside-diagnostics-and-tooling/scripts/search-probe.sh
# args: [lat] [lng] [radius_km] [base_url]; defaults: 43.6532 -79.3832 20 https://api.getonside.ca
```

Endpoint contract (verified against `apps/api/src/routes/search.ts` and migration
`supabase/migrations/020_search_fields_pagination.sql`): `GET /search/fields` with
`lat`/`lng` (must pair), `radius_km` (default 10, max 500), comma-list `surface`/`size`/`venue_type`,
`price_max`, `sort` (distance|price_asc|price_desc), `limit` (max 200), `offset`.
Rows are `{ field, venue, distance_meters }` plus top-level `total` (un-paginated match count).

The wire projection is NARROW. Know it before writing jq:

- `field` has exactly 10 keys: `id, venue_id, name, surface, size, price_per_hour, booking_url, booking_platform, is_active, created_at`. NO `external_id`, NO `price_note`, NO photos. Source-prefix distributions are therefore impossible from this endpoint; use db-spot-check (section 3).
- `venue` has exactly 7 keys: `id, name, lat, lng, address, photos, venue_type`. NO `hours` (this is why the app's Open-now chip evaluates a default 06:00-23:00 window for every venue).

Live snapshot, downtown Toronto 20 km (as of 2026-07-05): `total` 307, 200 rows returned,
144 distinct venues in page, venue_type 153 public_park / 47 private, price_per_hour null on
all 200 rows, booking_url on 43, booking_platform `"none"` (the literal string) on all 200.

Interpretation:

| Observation | Verdict |
|---|---|
| All prices null downtown | NORMAL today. Scraped sources carry no prices; only 2 fields in the whole DB have `price_per_hour` (see section 3). The app renders FREE (public_park) or "Rates on site" instead |
| `total` far below ~300 downtown | Suspicious: venues deactivated in bulk (bad dedupe/refine apply?) or API pointing at wrong DB |
| public_park share collapses | Suspicious: municipal sources (toronto/mississauga/brampton) lost rows; read the last scrape run (section 4) |
| error envelope `VALIDATION_ERROR` | Your query params, not the server: lat without lng, bad enum value, limit > 200 |
| HTTP 429 | You hit the 60/min rate limit; wait a minute |

## 3. DB spot check (service-role ground truth)

```sh
bun /Users/laith/code/soccer/.claude/skills/onside-diagnostics-and-tooling/scripts/db-spot-check.ts
```

Zero-dependency script (plain fetch against Supabase PostgREST). Reads `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` from `apps/api/.env` (service role sees inactive rows; the script
performs GET/HEAD only). Never echo that key into logs or chat.

Live output (as of 2026-07-05):

```text
== venues ==
active                 754
inactive (soft-deleted) 34  (dedupe losers: 12)
with google_place_id   645
with photos            604
stale (>14d unscraped) 9
== fields ==
active                 1058
with booking_url       273
with price_per_hour    2
== active venues by source prefix ==
google         312
mississauga    140
toronto        135
brampton       91
osm            76
== orphaned venues (active, zero active fields): 0 ==
```

Healthy vs suspicious:

| Metric | Healthy | Suspicious when |
|---|---|---|
| orphaned venues | 0 (refine.ts flips venue and its fields together, so orphans should never exist) | > 0: some manual/partial deactivation left active venues with no active fields; they render as venues with nothing bookable |
| stale (>14d) | single digits (weekly scrape refreshes `last_scraped_at`) | grows week over week: scheduled Scrape workflow is red or skipping; check section 4 |
| with photos | a large, stable majority of active venues (604 of 754 on 2026-07-05; venues with no confident Google match stay photoless by design). Counting note: `venues.photos` is `text[] not null default '{}'` (migration 001), so the script counts `photos=neq.{}`; a `not.is.null` filter matches every venue and reads healthy forever | falling week over week: photo enrichment failing or skipped; stored googleusercontent URIs are short-lived and will rot |
| prefix counts | google 312 / mississauga 140 / toronto 135 / brampton 91 / osm 76 (2026-07-05) | any prefix at 0: that source silently died; the ZERO-ROWS guard should have caught it |
| dedupe losers | small, grows slowly | jumps sharply after a scrape: dedupe thresholds may be merging non-duplicates; audit via `duplicate_of` before trusting |

Cleanup convention (if you ever find orphans or junk): this repo NEVER hard-deletes venues.
The pattern, used by both `apps/api/scripts/scrape/dedupe.ts` and `refine.ts`: dry run by
default, `--apply` to commit, and applying means `is_active=false` (plus `duplicate_of` for
dedupe) so it is reversible. Any new cleanup script must follow the same shape, and ship via
a normal PR (see onside-change-control).

## 4. Reading a scrape run (GitHub Actions)

The pipeline runs weekly (Mondays 08:00 UTC, `.github/workflows/scrape.yml`) with three steps:
scrape all sources, enrich photos, dedupe `--apply`. Steps 2 and 3 run `if: always()` on purpose.

```sh
gh run list --workflow=Scrape --limit 5
gh run view <run-id> --log | grep -E "\[scrape\]"     # summary block + guards
gh run view <run-id> --log | grep -E "\[dedupe\]"     # dedupe step
```

Real summary block from the last green run (id 28731751873, 2026-07-05):

```text
[scrape] Done: 753 venues, 1048 fields total
[scrape] run summary   <- real log decorates this header with Unicode box-drawing lines; match the words
[scrape] osm          fetched 81   upserted 81 venues / 81 fields
[scrape] manual       fetched 0    upserted 0 venues / 0 fields
[scrape] google       fetched 306  upserted 306 venues / 306 fields
[scrape] playtomic    fetched 0    upserted 0 venues / 0 fields
[scrape] mississauga  fetched 140  upserted 140 venues / 237 fields
[scrape] toronto      fetched 135  upserted 135 venues / 229 fields
[scrape] brampton     fetched 91   upserted 91 venues / 195 fields
[scrape] freshness: 9 active venues not rescraped in 14+ days
```

How to read it:

| Line | Healthy | Alarm |
|---|---|---|
| per-source `fetched N upserted M` | M == N for venues; fields can exceed venues (multi-field parks) | `FAILED` plus an error message: that adapter threw; run exits 1 but other sources still ran |
| `manual fetched 0` | Expected: `data/manual-venues.yaml` is currently empty | n/a |
| `playtomic fetched 0` | Expected steady state: zero GTA soccer/futsal tenants on Playtomic today; the adapter exists so a future adopter surfaces automatically | n/a |
| `ZERO-ROWS GUARD: <src> returned 0 venues but DB has N` | never | Source broke silently (endpoint moved, schema changed); DB rows are NOT deactivated, but fix the adapter before they go stale |
| `WRITE-FAILURE GUARD: <src> fetched N but upserted 0` | never | Systemic write failure: schema drift or RLS; nothing landed |
| `freshness: N active venues not rescraped in 14+ days` | single digits | climbing N: some prefix is no longer being refreshed |

Exit code 1 on the scrape step means an adapter error or a tripped guard. Real red-run
example (id 28731318093): `google FAILED` because `GOOGLE_PLACES_API_KEY` was absent from the
step env; photo enrichment and dedupe still ran because of `if: always()`.

## 5. Reading dedupe output

Runner: `apps/api/scripts/scrape/dedupe.ts` (dry run by default; the weekly workflow runs
`--apply`, which only ever acts on AUTO pairs). Line format per candidate pair:

```text
AUTO   keep "<name>" (<external_id>) <- drop "<name>" (<external_id>) <reason>
REVIEW keep "<name>" (<external_id>) <- drop "<name>" (<external_id>) <reason>
```

Transcription note: in the real log the keep/drop separator is the Unicode left arrow
(U+2190) and the reason is prefixed by a long Unicode dash, so grep for the `AUTO` or
`REVIEW` token (or `[dedupe]`), never for the arrow. Closing line: `[dedupe] done` with
counts. Last green run (2026-07-05): scanned 769 active venues, 8 auto, 64 review,
8 deactivated.

- AUTO = within 200 m AND name similarity >= 0.85 (30 m radius when the name is generic like
  "Soccer Field"). Safe unattended: applied as `is_active=false` + `duplicate_of=keeper`.
- REVIEW = within 100 m AND (name similarity >= 0.3 OR identical street address). Printed
  only, never applied. What to do with them: eyeball each pair (names, sources, coordinates,
  field counts). If truly the same place, deactivate the loser the same soft-delete way via a
  reviewed change; if a false pair (two real venues in one park), leave it, it will reprint
  every run. 64 pending REVIEW pairs is a known backlog (as of 2026-07-05).
- A REVIEW backlog that suddenly doubles after adding a source usually means that source's
  naming scheme collides with an existing one; fix naming in the adapter, not the thresholds.

## 6. Site verification (both themes, always)

```sh
/Users/laith/code/soccer/.claude/skills/onside-diagnostics-and-tooling/scripts/theme-shots.sh https://getonside.ca site
# local: (cd site && npm run dev -- --port 3001) then theme-shots.sh http://localhost:3001 local
```

Port note: `next dev` and the API both default to port 3000; give the site `--port 3001` when
both run. The script drives `npx -y playwright@1.61.1 screenshot --color-scheme=<scheme>`;
if Chromium is missing run `npx -y playwright@1.61.1 install chromium` once.

What to look for (Matchday design system):

- Dark: night-navy page ground (`#0E131F`), brand orange CTA (`#FF6B2C`), faint pitch-line SVG in the hero. Light: warm paper (`#F5F4EF`), darker orange (`#C2410C`).
- Both shots must differ. Identical shots mean the theme override script or tokens.css broke.
- Venue/finder pages: FREE foil chips (soft green gradient) on public parks, "Rates on site" on null-price bookables, "from $N/hr" only where a real price exists. A literal "$0/hr" anywhere is a regression (see onside-failure-archaeology, the $0/hr incident).
- Hero venue count ("N fields lit up tonight") is baked at build time; it changes only on a Vercel redeploy, not when the DB changes.

## 7. App-on-simulator verification loop

```sh
cd /Users/laith/code/soccer/fieldstack-app
/Users/laith/code/soccer/.claude/skills/onside-diagnostics-and-tooling/scripts/sim-verify.sh "iPhone 15 Pro" /tmp/onside-sim-shots
```

What it does (each step is also usable alone): `xcrun simctl bootstatus <device> -b` (boot and
wait), reuse-or-start Metro (`npx expo start`, deliberately NOT `npm start`: the prestart hook
rewrites `.env`'s `EXPO_PUBLIC_API_URL` to your LAN IP), `xcrun simctl openurl booted
exp://127.0.0.1:8081` (opens Expo Go pointed at Metro; first bundle build takes 60-90 s), then
per appearance `xcrun simctl ui booted appearance light|dark` + `xcrun simctl io booted
screenshot <file>`.

Interpretation:

- Banner "Showing saved results since we couldn't reach the server." on Explore: the app could
  not reach `EXPO_PUBLIC_API_URL` and fell back to its 24 h search cache. Either start the
  local API (`cd apps/api && bun run dev`) or point `fieldstack-app/.env` at
  `https://api.getonside.ca`. The banner appearing is itself a correct-offline-behavior pass.
- Splash longer than ~3.5 s: broken; a hard cap forces it down at SPLASH_CAP_MS(2000)+1500.
- Red default MapKit balloons instead of brand pins: marker rasterization regression; STOP and
  load onside-debugging-playbook before touching anything.
- Deep links (`onside://venue/<id>`) do NOT route in Expo Go: the app's linking prefixes are
  `["onside://"]` only (`App.tsx:96`) and Expo Go owns `exp://`. Testing deep links requires a
  dev build (see onside-build-and-env).
- Cleanup: `pkill -f "expo start"`; `xcrun simctl shutdown "<device>"`.

## 8. Bundle-freshness probe (is Metro serving my edit?)

When a change seems to have no effect on the simulator, prove what Metro is serving before
debugging the change itself:

```sh
curl -s http://127.0.0.1:8081/status        # expect: packager-status:running
curl -s "http://127.0.0.1:8081/index.bundle?platform=ios&dev=true" | grep -c "someSymbolYouJustAdded"
```

Verified 2026-07-05: the dev bundle is ~15.7 MB and greps cleanly for string literals (for
example the analytics event name `explore_sheet_snapped` appears exactly once). grep count 0
for a symbol you just added means the simulator/Metro pair is serving stale code: wrong cwd,
wrong port, or a second Metro instance.

## 9. Token drift check

```sh
cd /Users/laith/code/soccer
node design/generate.mjs && git diff --exit-code design fieldstack-app/src/theme/palette.ts site/app/tokens.css site/lib/tokens.generated.json
```

This is byte-for-byte the CI check (`.github/workflows/ci.yml`, site job). The generator is
deterministic (no timestamps; verified by checksum before/after), so a clean tree stays clean.
Non-empty diff means someone edited `design/tokens.json` without regenerating, or hand-edited a
generated file. Fix: edit tokens.json only, rerun the generator, commit all outputs together
(procedure and output list homed in onside-config-and-flags). The same drift is also caught by
the jest test `fieldstack-app/src/lib/__tests__/tokensDrift.test.ts`.

## 10. Analytics event inventory

Source of truth: `fieldstack-app/src/lib/analytics.ts` (typed `EVENT_*` constants; typos do
not compile). The 14 shipped events (as of 2026-07-05): `app_opened`, `venue_viewed`,
`field_viewed`, `booking_cta_tapped`, `booking_redirect_confirmed`, `search_filtered`,
`screen_viewed`, `app_backgrounded`, `app_foregrounded`, `review_prompt_shown`,
`review_prompt_accepted`, `explore_chip_toggled`, `explore_sheet_snapped`,
`booking_request_submitted`.

Caveats when reading dashboards:

- `screen_viewed.screen` carries React Navigation route names. Since the Explore rebuild there
  is ONE `Explore` route; older data has `VenueList` / `FieldSearch` / `MapView`. Dashboards
  spanning the rebuild see both eras. `docs/analytics.md` still lists the old names (stale).
- `search_filtered` is deliberately not fired for the automatic first fetch on app open.
- App events go to PostHog only when `EXPO_PUBLIC_POSTHOG_KEY` is set (real key in the
  production EAS profile; the preview profile has a placeholder). PostHog dashboard contents
  cannot be verified from the repo (unverified here). Site analytics is separate: Vercel
  Analytics with custom events `venue_book_click` and `waitlist_joined`.
- Crash reporting may be OFF in prod: the Sentry DSN gap is tracked in onside-config-and-flags
  (known gap 1). Do not expect Sentry data until that gap closes.

## Provenance and maintenance

All facts verified 2026-07-05 against repo HEAD and live prod. Re-verify with:

| Fact | Re-verification |
|---|---|
| Health semantics / 503 rule | `sed -n 25,43p apps/api/src/routes/health.ts` |
| Prod health + redis state | `curl -s https://api.getonside.ca/health` |
| Search wire projection (10 field keys, 7 venue keys) | `grep -n -A 25 "'field', jsonb_build_object" supabase/migrations/020_search_fields_pagination.sql` |
| Search params / limits | `sed -n 34,50p apps/api/src/routes/search.ts` |
| Live distributions (total 307 downtown etc.) | run `scripts/search-probe.sh` |
| DB counts (754 active venues, prefixes, 2 priced fields) | run `scripts/db-spot-check.ts` |
| Rate limit 60/min | `grep -n "max: 60" apps/api/src/index.ts apps/api/src/routes/search.ts` |
| Scrape summary line format + guards | `grep -n "run summary\|GUARD" apps/api/scripts/scrape/run.ts` |
| Latest scrape run | `gh run list --workflow=Scrape --limit 3` |
| Dedupe tiers and output | `sed -n 1,20p apps/api/scripts/scrape/dedupe.ts` |
| CI drift-check command | `grep -n -A 3 "tokens are in sync" .github/workflows/ci.yml` |
| Event inventory | `grep -n "^export const EVENT_" fieldstack-app/src/lib/analytics.ts` |
| Deep-link prefixes | `sed -n 95,97p fieldstack-app/App.tsx` |
| Expo Go on simulator | `xcrun simctl listapps booted \| grep host.exp.Exponent` |
