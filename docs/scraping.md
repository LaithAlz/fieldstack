# Scraping & Booking-Connection Architecture

How Onside discovers soccer venues, enriches them, and connects to operators'
booking systems — and how we scale all three. This is a staged plan: each stage
is shippable on its own and the build order at the end reflects effort vs. payoff.

> Status: **strategy doc + safe scaffolding**. The only code that ships alongside
> this doc is (a) an optional, additive extension to the adapter interface, (b) a
> stub source file with TODOs, and (c) a scheduled GitHub Actions workflow that
> runs the *existing* scraper. No new live API calls are wired up yet — every
> platform integration below is a design, to be built behind a real credential.

---

## 0. Where we are today

The pipeline (`apps/api/scripts/scrape/`) is a single idempotent runner:

- `run.ts` upserts operators from `data/operators.yaml`, runs source adapters,
  matches each scraped venue to an operator (`lib/operatorMatcher.ts`), and
  upserts venues + fields keyed on `external_id` (`onConflict: external_id`, so
  re-runs update rather than duplicate).
- Sources: `osm.ts` (Overpass `area` queries per city from `data/cities.yaml`),
  `osmGta.ts` (older Halton/Hamilton variant — **not registered** in `run.ts`),
  `mississauga.ts` (ArcGIS open-data GeoJSON — **also not registered** in
  `run.ts`), `manual.ts` (reads `data/manual-venues.yaml`).
- Schema (`supabase/migrations/`): `operators` (with `integration_type` enum
  `none|playtomic|courtreserve|amilia`), `venues` (unique `external_id`,
  `data_source`, `last_scraped_at`, `venue_type`, `hours`, PostGIS `location`),
  `fields` (`surface`, `size`, `price_per_hour`, `booking_url`,
  `booking_platform`).
- Run: `bun apps/api/scripts/scrape/run.ts <source>` with `SUPABASE_SERVICE_ROLE_KEY`.
  **Today it is run by hand.**

> Note: `run.ts`'s `ADAPTERS` map currently registers only `osm` and `manual`.
> `mississauga` and `osm-halton-hamilton` exist as files but aren't wired in.
> Re-registering Mississauga is a one-line, zero-risk win and is called out in
> the build order.

### Limitations this doc addresses

1. **Discovery** is OSM (free, mostly public parks) + a little manual YAML.
   Private facilities (indoor domes, sportsplexes) — the ones users most want to
   *book* — are under-covered.
2. **No automation**: no scheduling, no data-freshness policy, no cross-source
   dedup, no monitoring.
3. **Booking is a dead link**: `booking_url` is a per-field deep link and
   `booking_platform` is always `'none'`. The `integration_type` enum
   anticipates Playtomic/CourtReserve/Amilia but nothing uses those platforms to
   discover venues, pull courts/prices/availability, or produce a real
   deep-linked booking.

---

## 1. Discovery — finding venues

Goal: every soccer-bookable surface in the GTA, with private indoor facilities
as the priority gap. Each source is its own `ScrapeAdapter` with a namespaced
`external_id` prefix so re-runs stay idempotent and provenance is traceable.

### 1.1 Sources, ranked by payoff

| Source | What it adds | Coverage | Effort | ToS reality |
|---|---|---|---|---|
| **OSM / Overpass** (have) | Named pitches + sports centres, lat/lng, surface/lights hints | Public parks, some private | Done | ODbL — attribution required (already done) |
| **Municipal open data** (have Mississauga; add Toronto, Brampton, others) | Authoritative city-owned field inventories: names, parent park, address, sometimes surface/size | Public + community-centre | Low per city | Open data licences — built for redistribution |
| **Google Places API (New)** | Photos, hours, phone, website, ratings for *private* venues OSM misses; enrichment for all | Best for private/indoor | Medium | Strict caching limits — see §1.4 |
| **Booking-platform venue directories** (Playtomic) | The exact private/indoor venues we want, *with* the platform identity needed for booking | Private indoor | Medium–High | Per-platform — see §3 |
| **Manual YAML** (have) | Backfill for anything the above miss | Any | Trivial | n/a |

### 1.2 Municipal open data (next, cheap)

Mississauga already works via ArcGIS GeoJSON (`mississauga.ts`) — it's just not
registered in `run.ts`. The same pattern generalises:

- **Toronto** — Open Data portal + the city ArcGIS feature server. The PFR Sport
  Field layer (`gis.toronto.ca/arcgis/.../FeatureServer/54`) exposes a "Soccer
  Field" feature type queryable as GeoJSON, the same shape `mississauga.ts`
  already parses.
- **Brampton** — GeoHub (`geohub.brampton.ca`) publishes open data including
  field inventories (the city cites 133 outdoor + 7 indoor turf fields).
- **Others** (Vaughan, Markham, Oakville, Hamilton…) — each has an open-data
  portal; not all expose a clean fields layer. Add them as their data warrants.

These are the *safest* sources: open-data licences exist specifically to permit
redistribution, and the data is authoritative (it's the city's own inventory).
Generalise `mississauga.ts` into a small ArcGIS helper parametrised by dataset
URL + a field-mapping config, then add one thin adapter (or one config row) per
city.

### 1.3 Google Places API (New) — enrichment-first

Best at the data OSM/municipal sources lack: **photos, hours, phone, website,
ratings**, plus discovery of *private* venues via Text/Nearby Search
(`"indoor soccer near <city>"`, `"sportsplex"`, `"soccer dome"`).

Two roles:
- **Discovery** — Text/Nearby Search to surface private venues, then Place
  Details to hydrate them.
- **Enrichment** — given a venue we already have (from OSM/municipal/platform),
  resolve its Place ID once and pull Details to fill photos/hours/phone.

**Critical ToS constraint (drives the schema):** Google Places content — names,
hours, photos, ratings — **may not be cached or stored** beyond short-lived
session use. The **Place ID is the one exception**: it can be stored
indefinitely. So:
- Store only `google_place_id` on the venue (durable, allowed).
- Re-fetch Places *content* at display time, or refresh on a short TTL
  consistent with Google's terms — do **not** treat scraped Places fields as
  permanent rows.
- Keep a clear line between "facts we own/derive" (location, our `venue_type`,
  operator link) and "Google-owned content we display transiently."
- Photos shown from Places must carry Google attribution.

Cost is per-request per SKU (Basic/Contact/Atmosphere field masks billed on top
of the base call). Always send a **field mask** to avoid paying for fields we
don't use; resolve Place ID once and reuse it.

### 1.4 Provenance & confidence (cross-cutting)

Every adapter already namespaces `external_id` (`osm:…`, `mississauga:…`,
`manual:…`). Extend that discipline:
- New prefixes: `google:<place_id>`, `playtomic:<tenant_id>`,
  `courtreserve:<org_id>`, `amilia:<org_id>`.
- `data_source` stays the coarse bucket (`scrape`/`manual`/`operator_claim`);
  the `external_id` prefix carries the *specific* source.
- Add a per-venue **confidence/precedence** notion for conflict resolution
  (§4.3). Platform sources (operator's own booking system) are the most
  authoritative for booking facts; municipal open data is most authoritative for
  public-field identity; OSM is the broad-but-fuzzy baseline.

---

## 2. Enrichment — fields, surfaces, prices, hours, photos

Discovery gets us a venue pin. Enrichment makes the listing useful and bookable.

| Attribute | Best source | Notes |
|---|---|---|
| Fields (count, names, size) | Booking platform > municipal > OSM heuristics | Platforms expose real "resources/courts"; OSM guesses one field per pin |
| Surface | Municipal/platform > OSM `surface` tag | OSM `looksIndoor()` → `indoor`; muni defaults to `grass`; platform is exact |
| Price/hour | Booking platform only | OSM/municipal never carry price; this is a platform-only fact |
| Hours | Google Places / platform | Stored in `venues.hours` (already exists) |
| Photos | Google Places (transient, attributed) / operator-supplied | `venues.photos` + per-field `fields.photos` columns exist |
| Booking notes / cancellation | Operator site / platform | `venues.booking_notes`, `venues.cancellation_policy` exist |

The schema already has the columns (migrations 009–012). The work is *populating*
them from richer sources, with the Google-content caveat from §1.4: Places-sourced
photos/hours are display-time/short-TTL, not durable rows.

---

## 3. Operator connection — the booking model

This is the strategic core. Today `booking_url` is a homepage link and
`booking_platform` is always `'none'`. We want, per field, the *best available*
booking experience.

### 3.1 Booking tiers (what the UI offers, best to worst)

1. **Platform integration** — we know the operator runs on Playtomic /
   CourtReserve / Amilia, we've pulled their real resources (+ optionally
   availability/price), and we deep-link to the exact booking flow (ideally
   pre-filled). `fields.booking_platform` = the platform; `booking_url` = the
   resolved deep link.
2. **Operator booking URL** — a real "Book Now" deep link on the operator's own
   site (not just the homepage). `booking_platform = 'none'`.
3. **Website / phone** — homepage or phone number only. The trust-building
   fallback; `booking_notes` explains how to book.

The `operators.integration_type` enum + `fields.booking_platform` already model
tier 1. The connection model below fills them in.

### 3.2 Per-platform reality (researched)

Each platform got a research pass on its *actual* data-access surface. Summary
first, then specifics.

| Platform | Public/partner API? | Venue discovery | Resources/fields | Availability | Deep link |
|---|---|---|---|---|---|
| **Playtomic** | Official **club API** (read-only, club-scoped creds) + an **internal/undocumented** consumer API used by the app | Internal `tenants` search (`api.playtomic.io/v1/tenants`) by coordinate/radius/sport | `availability` returns resources | `GET /v1/availability` (≤25h window, `tenant_id`) | `playtomic.com/clubs/{slug}` |
| **CourtReserve** | Club-facing web API (HTTPS/JSON), club-authorised; **no public discovery API** | None public — must know the club's `OrgId` | Via club API (authorised) | Via club API / Public Booking page | `app.courtreserve.com/Online/Portal/Index/{OrgId}` |
| **Amilia (SmartRec)** | REST API v1–v3, **per-organization JWT** (org admin creds) | None public — must know the org | Activities/resources via org API | Via org API (authorised) | `app.amilia.com/store/en/{rewriteUrl}/shop/programs` |

#### Playtomic

- **Official path:** the *Third-Party / Club API* (`third-party.playtomic.io`,
  base `https://api.playtomic.io/v1`). It is **read-only and club-scoped**: a
  club generates External API credentials in Playtomic Manager (Settings →
  Developer Tools). It exposes the club's own bookings/players/resources, ~3
  months of history, with rate limits (docs cite ~1 call/min) and a one-month
  change-notice clause. This is the path to use **once an operator partners with
  us** and shares (or generates for us) credentials.
- **Internal/undocumented path:** the consumer app calls
  `https://api.playtomic.io/v1/tenants` (params: `coordinate`, `radius`,
  `sport_id`, `size`, …) for **venue discovery by location** — the old
  `playtomic.io/api/v1/tenants` URL is dead (redirects, 404s). Verified
  (2026-07): valid soccer sport ids are `FUTSAL` and `FOOTBALL7` only
  (`SOCCER`/`FOOTBALL`/`FOOTBALL11`/`INDOOR_FOOTBALL` all 400 with
  `VALIDATION_ERROR`); the server-side `sport_id` filter is loose (returns
  nearby padel-only tenants too), so client-side filtering on
  `resources[].sport_id` is mandatory; and the `playtomic.com/clubs/{slug}`
  deep link only 200s for tenants with `playtomic_status: "ACTIVE"` (others
  404 and must be dropped). `GET /v1/availability` (`tenant_id`, `sport_id`,
  `start_min`/`start_max`, ≤25h per request) covers slots but is out of scope
  for the discovery-only adapter. These are **not** a published partner API;
  they power Playtomic's own site/app. Treat them as **discovery-only,
  best-effort, rate-limited, and legally cautious** (see §4.4) — useful to
  *find* which GTA venues are on Playtomic and link out, but never as a
  guaranteed contract.
- **Soccer relevance:** Playtomic is padel-dominant here — measured (2026-07):
  **0** soccer/futsal tenants within 75km of Toronto. Zero is the expected
  steady state; the adapter runs every sweep so a future GTA adopter surfaces
  automatically.
- **Recommended use:** Tier-1 deep-link to the tenant's `playtomic.com` page now
  (label `booking_platform = 'playtomic'`); pull live resources/availability
  only via the **official club API** under a partnership.

#### CourtReserve

- **No public discovery API.** The API is **club-authorised** (HTTPS/JSON) and
  built for a club to sync *its own* memberships/reservations/events. There is no
  endpoint to enumerate clubs you don't administer.
- **Public Booking** is a per-club feature: when a club enables it (Settings →
  Portal Settings → Public Bookings), CourtReserve issues a shareable link of the
  form `https://app.courtreserve.com/Online/Portal/Index/{OrgId}`. The `OrgId` is
  the club's unique numeric id.
- **Recommended use:** discover CourtReserve clubs **manually** (their site links
  to the portal, or "Reserve with Google"); record the `OrgId` in
  `operators.yaml`; deep-link to the Public Booking portal as Tier-1
  (`booking_platform = 'courtreserve'`). Pull live resources/availability only via
  the authorised club API under a partnership.

#### Amilia (SmartRec)

- **REST API v1/v2/v3, per-organization auth.** You authenticate with an org
  admin account (generic integration email recommended) to mint a **JWT**, then
  call org-scoped endpoints (`Authorization: Bearer …`). "Empty admin access" to
  an org is enough to read its API data. You need the org's id — the `rewriteUrl`
  set under the org's Options.
- **No cross-org public discovery.** Like CourtReserve, you must already know the
  organisation; there's no "search all Amilia orgs near me."
- **Storefront deep link:** `https://app.amilia.com/store/en/{rewriteUrl}/shop/programs`.
  Amilia is widely used by Canadian **municipal rec depts and clubs**, so several
  GTA community-centre / club soccer programs and field rentals live here.
- **Recommended use:** record `rewriteUrl` in `operators.yaml`; deep-link to the
  store as Tier-1 (`booking_platform = 'amilia'`); pull activities/resources via
  the org API once an operator grants integration credentials.

### 3.3 The honest conclusion

For **all three platforms, live availability/price requires the operator's own
credentials** (a partnership), not a public firehose:

- **Now, no partnership:** treat platform identity as a **discovery + deep-link**
  signal. If we can determine a venue is on platform X (via the operator's
  website, a manual entry, or — for Playtomic only — the internal `tenants`
  probe), set `booking_platform` and build the **deep link** from the known URL
  templates above. This lights up Tier-1's deep-link benefit without any
  authorised API.
- **Later, per operator:** when an operator opts in, store their credentials
  server-side (never in the repo) and run a platform adapter that pulls real
  resources → `fields`, real prices → `price_per_hour`, and optionally
  availability into a future `availability` table. That's the full Tier-1
  experience.

This staging is why the scaffolding ships **only** a stub + interface extension
for platform adapters — building fake API calls against undocumented or
credentialed endpoints would be both brittle and a ToS risk.

---

## 4. Operations

### 4.1 Scheduling — recommendation: **GitHub Actions scheduled workflow**

Two options were considered:

- **GitHub Actions `schedule` cron** ✅ recommended for now.
  - Zero new infra; the repo already runs CI/migrations on Actions.
  - The scraper is a short, stateless batch job (fetch → upsert → exit) — a
    perfect fit for a cron-triggered runner.
  - Secrets live in GitHub Actions secrets; `SUPABASE_SERVICE_ROLE_KEY` is
    injected at run time and never stored in the repo.
  - Free for this cadence; easy to gate/skip when the secret is absent.
- **Fly cron machine** — the backend already deploys on Fly, so a scheduled Fly
  Machine would co-locate the scraper with prod and reuse Fly secrets. Worth
  revisiting **if** the scraper grows long-running, needs the prod network/Redis,
  or needs tighter coupling to deploys. For a periodic batch job it's more moving
  parts than Actions.

**Decision:** start with the Actions scheduled workflow (shipped in this PR,
disabled-by-default via the secret gate). Migrate to Fly cron only if the job
outgrows Actions' model.

The shipped workflow (`.github/workflows/scrape.yml`) mirrors
`migrations.yml`'s optional-step pattern: it runs `bun apps/api/scripts/scrape/run.ts all`
on a weekly cron (and on manual `workflow_dispatch`), and **skips gracefully**
with a `::notice::` when `SUPABASE_SERVICE_ROLE_KEY` is not configured — so it
never fails red on a fork or before the secret is set.

### 4.2 Idempotency & provenance

Already solid and must be preserved:
- Every venue/field carries a namespaced `external_id`; the runner upserts
  `onConflict: external_id`. Re-runs update, never duplicate.
- `data_source` + `last_scraped_at` record where/when. Extend with the
  per-source `external_id` prefixes from §1.4.
- **Freshness:** the `venues_last_scraped_at_idx` (migration 007) already
  supports a "stalest first" or "not refreshed in N days" query — use it to drive
  incremental re-scrapes instead of always full-sweeping every source.

### 4.3 Cross-source dedup & conflict resolution

The hard part once we have >1 source describing the same venue. Today the only
dedup is *within* a source (OSM's `seenIds`, Mississauga's parent grouping). With
OSM + municipal + Google + platforms, the same dome appears N times.

Proposed approach (design, not yet built):
- **Match key:** spatial proximity (PostGIS `ST_DWithin` on `location`, e.g.
  within ~75 m) + fuzzy name match (reuse the substring logic in
  `operatorMatcher.ts`, generalised). Two records that are close *and*
  name-similar are the same venue.
- **Canonical venue + source links:** keep each source's raw record (its own
  `external_id`) but resolve them to one canonical venue for display. Simplest
  first step: a `canonical_venue_id` self-reference (or a join table) so we never
  destroy provenance.
- **Field-level precedence** for conflicting values:
  1. Operator-claimed / authorised platform data (most authoritative)
  2. Municipal open data (authoritative for public-field identity)
  3. Google Places (authoritative for hours/photos — but display-time only)
  4. OSM (baseline)
  Newer `last_scraped_at` breaks ties within a tier.
- Until this lands, keep sources from colliding by **distinct `external_id`
  prefixes** (they already don't overwrite each other) and accept some visible
  duplication, or run only the highest-precedence source for a given city.

### 4.4 ToS, legal, rate limits

- **OSM/ODbL** — attribution already in place; keep it. Polite Overpass usage
  (per-city queries, backoff on 429/503/504, `User-Agent`) already implemented in
  `osm.ts`; preserve it.
- **Municipal open data** — released under open licences for redistribution;
  lowest legal risk. Respect each portal's licence/attribution.
- **Google Places** — **do not cache content**; store only Place ID; attribute
  photos; publish a Terms of Use + Privacy Policy referencing Google's. Use field
  masks to control cost. (See §1.3.)
- **Playtomic internal `tenants`/`availability`** — undocumented, app-internal,
  rate-limited. Use **sparingly for discovery only**, with a clear `User-Agent`,
  conservative rate limiting, and the understanding it can change/break without
  notice and may be disallowed. Do **not** build core booking on it; use the
  official club API (credentialed) for anything load-bearing.
- **CourtReserve / Amilia** — authorised/credentialed APIs. Only pull a club's
  data with that club's consent + credentials. Public Booking / store deep links
  are public URLs and fine to link to.
- **General:** identify ourselves (`User-Agent`), rate-limit, back off, and
  prefer official/partner channels over scraping. Robots/ToS check before adding
  any HTML-scraping source.

### 4.5 Monitoring (lightweight)

- The runner already logs per-source counts + timings. In the scheduled workflow,
  a failed run shows red in Actions.
- Cheap next step: after each run, log/emit `venues upserted`, `fields upserted`,
  and a freshness summary (count of venues not refreshed in N days). Alert (even
  just a failing job) if a source returns **zero** rows when it historically
  returned many — the classic "source changed its schema and we silently went
  empty" failure (the same failure mode migration 019's CI guard was added for).

---

## 5. Recommended build order

Ordered by payoff-to-effort. Each step is independently shippable.

1. **Re-register Mississauga + ship the scheduled workflow** (this PR's spirit).
   One-line `ADAPTERS` re-registration restores a working source; the cron
   workflow (already added here, secret-gated) automates the existing pipeline.
   *Effort: trivial. Payoff: automation + a source that already works.*
2. **Municipal open-data expansion** — generalise `mississauga.ts` into an
   ArcGIS helper, add Toronto (PFR Sport Field layer) and Brampton (GeoHub), then
   others as data allows. *Effort: low. Payoff: authoritative public coverage.*
3. **Google Places enrichment** — resolve + store `google_place_id`; hydrate
   photos/hours/phone at display time (respecting the no-cache rule). Adds the
   visual polish private listings need. *Effort: medium. Payoff: high listing
   quality; surfaces private venues.*
4. **Deep-link tiering (no partnerships yet)** — populate `booking_platform` +
   build deep links from the known URL templates (CourtReserve `OrgId`, Amilia
   `rewriteUrl`, Playtomic tenant page) via `operators.yaml`. Optionally a
   discovery-only Playtomic `tenants` probe to find GTA venues. *Effort: medium.
   Payoff: real Tier-1 deep links with zero API auth.*
5. **Cross-source dedup + confidence** — canonical-venue resolution +
   field-level precedence (§4.3). Needed before running many overlapping sources
   at full coverage. *Effort: medium–high. Payoff: data quality at scale.*
6. **Authorised platform adapters (per partnership)** — Playtomic club API,
   CourtReserve club API, Amilia org API, behind server-side credentials. Full
   Tier-1: real resources, prices, availability. *Effort: high, per-operator.
   Payoff: the actual booking product.*

---

## Appendix — scaffolding shipped with this doc

Minimal, clearly-marked, and non-breaking:

- **`apps/api/scripts/scrape/types.ts`** — additive optional fields on the adapter types
  for future platform adapters (`platform`, `confidence`, `googlePlaceId`,
  per-field `bookingPlatform`). All optional; existing adapters compile
  unchanged.
- **`apps/api/scripts/scrape/sources/playtomic.ts`** — **implemented and
  registered** in `run.ts` (discovery tier only: venue identity + deep link,
  no availability/price). Sweeps `data/cities.yaml` centres against the live
  `tenants` API; a **zero-venue result is the expected state today** — see
  §3.2 for the measured GTA count.
- **`.github/workflows/scrape.yml`** — scheduled (`cron`) + `workflow_dispatch`
  workflow running `bun apps/api/scripts/scrape/run.ts all`, gated on the
  `SUPABASE_SERVICE_ROLE_KEY` secret and skipping with a notice if absent
  (mirrors `migrations.yml`'s optional drift step).

## Sources

Platform / API research backing §1 and §3:

- [Playtomic Third-Party (Club) API](https://third-party.playtomic.io/) and [Bookings endpoint](https://third-party.playtomic.io/endpoints/bookings/), [API Complete Guide](https://helpmanager.playtomic.com/hc/en-gb/articles/38836515997073-Playtomic-API-Complete-Guide)
- [Reverse Engineering Playtomic](https://mattrighetti.com/2025/03/03/reverse-engineering-playtomic) (internal `tenants` / `availability` endpoints)
- [Understanding the CourtReserve API](http://help.courtreserve.com/en/articles/12771256-understanding-the-courtreserve-api), [Introducing CourtReserve Public Booking](http://help.courtreserve.com/en/articles/13286613-introducing-courtreserve-public-booking)
- [Amilia API Documentation](https://app.amilia.com/apidocs/) and [SmartRec API help](https://help.amilia.com/en/articles/6575048-smartrec-api)
- [Google Places API (New) overview](https://developers.google.com/maps/documentation/places/web-service/overview) and [Places API policies / caching restrictions](https://developers.google.com/maps/documentation/places/web-service/policies)
- [City of Toronto Open Data](https://www.toronto.ca/city-government/data-research-maps/open-data/) and [PFR Sport Field layer](https://gis.toronto.ca/arcgis/rest/services/cot_geospatial13/FeatureServer/54); [Brampton GeoHub](https://geohub.brampton.ca/pages/data)
