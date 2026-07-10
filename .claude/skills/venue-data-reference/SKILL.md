---
name: venue-data-reference
description: Domain theory pack for Onside's venue data. Load when reasoning about geo dedup (haversine, token Jaccard, AUTO/REVIEW thresholds, why two venues merged or failed to merge), scrape source behavior (OSM Overpass, municipal ArcGIS for Toronto/Mississauga/Brampton, Google Places New, Playtomic tenants API), booking platform landscape (CatchCorner, Playtomic, CourtReserve, Amilia), data licensing and attribution obligations (ODbL, CC BY 4.0, Google no-cache rule), field taxonomy enums (surface, size, venue_type), or GTA city geography (relation IDs, city centres). Symptoms that should trigger this skill: "why are these two venues duplicates", "dedupe deactivated the wrong venue", "what external_id prefix does X use", "can we store Google photos", "is Playtomic usable for booking", "what does public_park mean", "add a city to the scraper".
---

# Venue Data Reference

Domain theory for Onside's venue dataset: the math, the sources, the platform landscape, the taxonomy, and the geography. This is the WHY pack. For HOW to run the pipeline, see the siblings listed at the bottom.

Onside is a soccer-field discovery product for the Greater Toronto Area (GTA). The dataset merges scraped public parks (free to play) with private facilities (paid hourly rentals). The structural bet: no booking platform lists free municipal inventory, so a complete map that includes free parks cannot be replicated by any single platform's directory.

Jargon used throughout, defined once:

| Term | Meaning here |
|---|---|
| Venue | A physical place (park or facility), one row in `venues`, one map pin |
| Field | A bookable/playable surface inside a venue, row in `fields` |
| Operator | The business running private facilities, row in `operators`, registry in `apps/api/scripts/scrape/data/operators.yaml` |
| Adapter / source | One scraper module in `apps/api/scripts/scrape/sources/`, identified by its `external_id` prefix |
| `external_id` | Namespaced stable key, e.g. `osm:way/123`, `toronto:park-bill-hancox-park`. Upserts key on it, so re-runs update instead of duplicate |
| Overpass | The public query API for OpenStreetMap (OSM) data |
| ArcGIS FeatureServer | Esri's REST API that municipal open-data portals expose; returns GeoJSON |
| Place ID | Google's stable identifier for a place; the ONLY Google Places field allowed in durable storage |
| Tenant | Playtomic's term for a club/facility on its platform |

## 1. Geo dedup math (`apps/api/scripts/scrape/lib/dedupe.ts`)

Different sources produce separate rows for the same physical venue. Upserts are idempotent per source (keyed on `external_id`) but nothing reconciles across sources; `lib/dedupe.ts` (pure, unit-tested in `apps/api/tests/dedupe.test.ts`) finds the collisions and `scripts/scrape/dedupe.ts` (the runner) acts on them.

### 1.1 Distance: haversine

As implemented in `haversineMeters` (dedupe.ts:119-134): Earth radius R = 6,371,000 m, convert lat/lng deltas to radians, then

```
s = sin^2(dLat/2) + cos(lat_a) * cos(lat_b) * sin^2(dLng/2)
distance = 2 * R * asin(sqrt(s))
```

Good to well under a metre at venue scale. Every dedup decision is distance-gated FIRST: two venues with identical names 5 km apart are never duplicates (real case in the code comments: the two Soccer Glow Kingdom locations).

### 1.2 Name similarity: token Jaccard

`normalizeName` lowercases, applies Unicode NFKD and strips combining diacritics, replaces every non-alphanumeric run with a space, splits, and drops STOP_TOKENS: `the, inc, ltd, llc, co, and, at, of`. Facility words like `centre`, `field`, `dome` are deliberately KEPT because they distinguish real facilities from each other ("Milton Sports Dome" vs "Milton Sports Centre" must NOT look identical).

`nameSimilarity` is Jaccard over the two normalized token sets: `|A intersect B| / |A union B|`. Empty set on either side scores 0.

A separate list, GENERIC_TOKENS (`soccer, football, futsal, field(s), pitch(es), park, turf, senior, junior, mini, north/south/east/west, upper/lower, 1-4, a, b`), powers `isGenericName`: true when EVERY normalized token is generic. A name like "Senior Soccer Field" describes a kind of place, not a specific one; two parks two blocks apart both contain one.

### 1.3 Tiers and thresholds (constants in dedupe.ts:47-52)

| Constant | Value | Meaning and rationale |
|---|---|---|
| `AUTO_RADIUS_M` | 200 | AUTO tier distance gate. Same place beyond reasonable doubt when combined with near-identical names; safe to deactivate unattended in the weekly job |
| `AUTO_RADIUS_GENERIC_M` | 30 | When EITHER name is all-generic, pins must nearly coincide. A generic name is only evidence at near-zero distance |
| `AUTO_NAME_SIM` | 0.85 | Jaccard floor for AUTO. Near-identical normalized names only |
| `REVIEW_RADIUS_M` | 100 | REVIEW tier distance gate |
| `REVIEW_NAME_SIM` | 0.3 | Weak name overlap; enough to say "probably related, human decides" |

REVIEW additionally fires on an identical street-address key even when name similarity is below 0.3. `addressKey` = first two tokens of the address's first comma-segment, and only when token 1 is purely numeric ("45 Fairfax Crescent, Scarborough" and "45 Fairfax Cres, Toronto" both yield `45 fairfax`; the street-type token is dropped because sources abbreviate it inconsistently; "Main Street" alone yields null). Coarse on purpose: it only fires inside the 100 m gate, so "45 Fairfax" in another city cannot collide.

Hard exclusions:
- osm-osm pairs are never compared. Two OSM rows are two distinct mapped features; a park's five pitches sharing a name are NOT duplicates.
- google-google pairs never AUTO-merge (REVIEW only). Distinct Google listings at one address are usually facility vs tenant, a human call.

### 1.4 Winner selection

`pickWinner`: higher `SOURCE_PRIORITY` wins, then higher active-field count (richer row), then lexically smaller id (determinism).

| Prefix | Priority | Why |
|---|---|---|
| `manual` | 4 | Curated by hand, highest trust |
| `playtomic` | 3 | Operator-platform data, authoritative for booking facts |
| `mississauga`, `toronto`, `brampton` | 2 | Municipal open data, authoritative for public-field identity |
| `google` | 1 | Richer detail than OSM (photos, website) but a business listing, not an inventory |
| `osm` | 0 | Broad but fuzzy baseline |

This ladder mirrors `docs/scraping.md` section 4.3 (the precedence design of record). Do not reorder it without touching both.

### 1.5 Runner behavior

`bun scripts/scrape/dedupe.ts` (run from `apps/api/`) is dry-run by default; `--apply` soft-deletes AUTO losers only: `is_active=false` plus `duplicate_of=keeper.id` (reversible, never a hard delete). REVIEW pairs are printed, never applied. Scans up to 2,000 active venues. The weekly workflow (`.github/workflows/scrape.yml`) runs `--apply` after every scrape.

### 1.6 Known failure modes (learn these before touching thresholds)

| Failure mode | Example | What handles it |
|---|---|---|
| Generic names near each other | Two "Senior Soccer Field" pins in adjacent parks | 30 m generic radius; beyond that, never AUTO |
| Facility vs tenant club | "East Toronto Soccer" listed at the Scarborough Soccer Centre | REVIEW tier only; auto-hiding could delete a real distinct bookable |
| Complex vs member facility | "Ontario Soccer Centre Field 1" vs "The Soccer Centre" | REVIEW tier only |
| Upstream suffix variants | Toronto `ROLLUP_TO` gave "BILL HANCOX PARK" and "BILL HANCOX PARK - Sports Field Area" as two venues, live-confirmed pairs 17-116 m apart, low name sim: evaded BOTH tiers | Fixed in the adapter, not in dedupe: `parkKey()` strips the suffix before grouping (`sources/toronto.ts`). Lesson: identity bugs from one source belong in that source's grouping key, not in looser global thresholds |
| Same brand, two locations | Two Soccer Glow Kingdom sites | Distance gate; correctly not duplicates |

## 2. Data sources: theory and etiquette

Endpoint anatomy, probed field distributions, and exact query URLs live in `references/source-anatomy.md`. This section is the conceptual layer.

### 2.1 OpenStreetMap via Overpass (`sources/osm.ts`, prefix `osm:`)

- Query model: one Overpass `area` query per city. Area id = OSM relation id + 3,600,000,000 (the Overpass convention offset). Admin-boundary scoping beats bounding boxes: no leakage between adjacent cities.
- Per-city queries are load-bearing: a single 10-city union query reliably 504s at the Overpass gateway. Cost is N requests; benefit is incremental logging and per-city failure isolation.
- Selects only NAMED `leisure=pitch` or `leisure=sports_centre` with `sport=soccer` (plus named `sport=soccer` buildings). Anonymous pitches are useless to users.
- Etiquette (preserve it, docs/scraping.md section 4.4): identify with a User-Agent, back off 8/20/40 s on 429/503/504, sleep 3 s between cities. Trap: Overpass returns HTTP 200 on timeout with a `remark` field containing "timed out"; the adapter retries on that.
- Toronto and Hamilton are admin_level=6 areas that overlap smaller cities; the adapter dedupes by OSM type/id across cities.
- Licence: ODbL. Attribution is required and shipped: a pressable "© OpenStreetMap" chip on the app's Explore map (`fieldstack-app/src/screens/main/ExploreScreen.tsx`), and the site's venue pages embed OSM's own iframe which carries attribution.

### 2.2 Municipal ArcGIS / CKAN open data (prefixes `mississauga:`, `toronto:`, `brampton:`)

The safest sources: open-data licences exist to permit redistribution and the city's own inventory is authoritative for public-field identity. All three share `lib/arcgis.ts`.

- FeatureServer query anatomy: `<layer>/query?where=<SQL-ish filter>&outFields=*&f=geojson`.
- Trap: ArcGIS reports query errors (bad `where`, renamed field, moved layer) as HTTP 200 with an `error` body. `lib/arcgis.ts` throws on that; without the check, a broken query is indistinguishable from a legitimately empty layer.
- `exceededTransferLimit` only warns; paging is not implemented because every layer used is well under its server cap (as of 2026-07-05).
- Common shape: group per-field rows into one venue per parent park; venue pin = centroid of member fields; address joined by exact name match against a separate parks layer, falling back to the park name on a miss.

| City | Grouping key | Rows (probed 2026-07-05) | Quirk | Licence |
|---|---|---|---|---|
| Mississauga | `PARENTID` (fallback PARENTDESC slug) | n/a (GeoJSON download) | keep `SERVSTAT` OPEN/RCNF/blank only; surface always `grass` | Open data portal |
| Toronto | `parkKey(ROLLUP_TO)` (suffix-stripped) | 229 fields | "Turf" means synthetic here; null means grass. CKAN parks file supplies addresses | OGL-Toronto PRESUMED site-wide; this layer is not licence-stamped; confirmation with opendata@toronto.ca outstanding (as of 2026-07-05) |
| Brampton | one row = one park's MultiPoint bundle | 91 rows | explode MultiPoint into placeholder fields, 1-based index NOT stable across city updates (acceptable: interchangeable unnamed placeholders); address join hit only 41/91 (school grounds missing from ParksPts) | CC BY 4.0 CONFIRMED on the service item; attribution required. As of 2026-07-05 no "City of Brampton" credit renders in app or site: obligation documented, not yet discharged (see onside-external-positioning) |

### 2.3 Google Places API (New) (`sources/googlePlaces.ts` + `scripts/scrape/enrichPhotos.ts`, prefix `google:`)

Role 1, discovery of PRIVATE/indoor venues (the domes and sportsplexes OSM barely covers): Text Search `POST https://places.googleapis.com/v1/places:searchText`, 5 soccer-specific terms x 10 cities x up to 3 pages (max 60 results per query), name-regex relevance filter, one placeholder field per venue (`Indoor field`, surface `indoor`, size `5v5`). Requires `GOOGLE_PLACES_API_KEY`; the adapter throws if unset.

Role 2, photo enrichment (weekly): resolve a Place ID cheapest-first (stored `venues.google_place_id`, zero calls; else the id inside a `google:*` external_id; else paid Text Search accepted only within 300 m of our pin), then Place Details with a `photos` field mask, then each photo's media endpoint with `skipHttpRedirect=true` which returns a keyless `lh3.googleusercontent.com` URI. Max 4 photos.

Non-negotiables (docs/scraping.md sections 1.3 and 4.4):
- The no-cache rule: Places CONTENT (names, hours, photos, ratings) may not be stored durably. The Place ID is the one exception (migration 024 adds `venues.google_place_id`). The lh3 photo URIs are short-lived, so the weekly full re-resolution in `scrape.yml` is mandatory maintenance, not polish; stop it and photos rot into broken images.
- Attribution display is required: `photo_attributions[i]` pairs with `photos[i]` (migration 022) and both app and site render it.
- Field masks control billing. Always send one; never request fields you do not map.

Also: after every google scrape, `npm run scrape:refine -- --apply` (from `apps/api/`) must re-run; the scrape resets `is_active` and refine re-deactivates org-signal noise (clubs/academies with no facility signal) among `google:*` rows.

### 2.4 Playtomic internal tenants API (`sources/playtomic.ts`, prefix `playtomic:`)

Live-verified 2026-07-04 (documented in the adapter header):
- Working endpoint: `GET https://api.playtomic.io/v1/tenants` (public, no auth). The old `playtomic.io/api/v1/tenants` is dead.
- Valid soccer sport ids: `FUTSAL` and `FOOTBALL7` ONLY. `SOCCER`, `FOOTBALL`, `FOOTBALL11`, `INDOOR_FOOTBALL` all 400 with VALIDATION_ERROR.
- The server-side `sport_id` filter is loose (returns nearby padel-only tenants); client-side filtering on `resources[].sport_id` is mandatory.
- `playtomic.com/clubs/<slug>` returns 200 only for tenants with `playtomic_status: "ACTIVE"`; others 404 and must be dropped.
- Measured GTA soccer/futsal presence: ZERO tenants within 75 km of Toronto (2026-07). Zero is the expected steady state; the adapter exists so a future GTA adopter surfaces automatically. Do not "fix" a zero-venue playtomic run.
- ToS posture (docs/scraping.md section 4.4): undocumented consumer API. Discovery-only, sparing, clear User-Agent, conservative rate limits, may break or be disallowed at any time, never load-bearing for booking. Availability/price calls are out of scope; those need the official club-scoped credentialed API under a partnership.

## 3. Booking platform landscape (researched 2026-07, volatile)

Docs of record: `docs/scraping.md` section 3 (per-platform API reality) and `docs/business-plan.md` section 3 (competitive landscape).

| Platform | GTA soccer reality (as of 2026-07-05) | Data access | Deep-link template |
|---|---|---|---|
| CatchCorner | The incumbent for GTA hourly field rentals; "CatchCorner by Sports Illustrated", strategic deal with Canlan Sports; powers Toronto Pan Am Sports Centre, Monarch Park, Toronto Soccerplex. Partner-only inventory: it lists ONLY facilities it has signed | No integration in this repo; operators link out via plain `booking_url` (10+ operators in operators.yaml point at catchcorner.com pages) | Plain per-facility URLs, no template |
| Playtomic | Padel-first; ZERO GTA soccer/futsal tenants measured 2026-07 | Internal tenants API for discovery only; official club API is read-only, club-scoped credentials, docs cite about 1 call/min | `playtomic.com/clubs/{slug}` |
| CourtReserve | No GTA/Hamilton soccer facility found yet (operators.yaml header); the `courtreserve_org_id` key ships unused | Club-authorised API only; no public discovery endpoint. OrgId must be found manually | `app.courtreserve.com/Online/Portal/Index/{OrgId}` |
| Amilia (SmartRec) | Two GTA domes (Markham Sports Dome, Woodbridge Sports Dome) have Amilia storefronts used for youth-program signup ONLY; their hourly rentals go through CatchCorner | Per-organization JWT (org admin credentials); no cross-org discovery | `app.amilia.com/store/en/{rewriteUrl}/shop/programs` |

Unverified from the repo (research-pass claims, treat as unconfirmed until re-checked live): CatchCorner exposing no public API and carrying no user reviews; Playtomic hiding price until slot selection.

The honest conclusion (docs/scraping.md section 3.3): on ALL three platforms, live availability and price require the operator's own credentials. Deep links are the credential-free tier 1. URL templates are implemented in `lib/platformLinks.ts` (pure, tested); precedence for a field's booking link: field's own URL > operator platform deep link > operator `booking_url` > operator `website`. A platform tag is only applied when the platform URL is what was actually used.

The structural moat: none of these platforms can list free municipal inventory. Municipal open data + OSM give Onside the free-park half of the map that no booking platform carries (business-plan.md: "CatchCorner only lists facilities it has signed").

## 4. Field taxonomy (`apps/api/scripts/scrape/fieldEnums.ts`, mirrors migrations 001/008/015)

| Enum | Values (exact strings) |
|---|---|
| `field_surface` | `turf`, `grass`, `concrete`, `indoor` |
| `field_size` | `5v5`, `7v7`, `11v11`, `futsal`, `3v3` |
| `venue_type` | `public_park`, `private`, `community_centre` |

Semantics that trip people up:
- `turf` means artificial/synthetic. Natural grass is `grass`. Toronto's layer says "Turf" for synthetic, mapped to `turf`; its nulls map to `grass`.
- `indoor` is a SURFACE value (used as the placeholder for indoor facilities), and also an amenity string. OSM heuristic: `sports_centre`, `indoor=yes`, or a `building` tag means indoor, surface `indoor`, venueType `private`.
- `public_park` is the exact string the free-play logic keys on: `isFreeVenue` (`fieldstack-app/src/lib/filters.ts:95-101`) returns true when min price is 0, or when price is null AND `venue_type === "public_park"`. Municipal adapters always emit `public_park`; renaming that value breaks free-vs-paid display product-wide.
- Size mapping is heuristic per source: OSM uses the `length` tag (over 80 m is `11v11`, over 50 is `7v7`); Toronto maps Mini to `3v3`, Junior to `7v7`, else `11v11`; Mississauga parses TYPEDESC keywords with default `7v7`; Brampton placeholders are `grass`/`7v7`.

## 5. GTA geography for non-locals (`apps/api/scripts/scrape/data/cities.yaml`)

10 cities swept (as of 2026-07-05), each with an OSM admin-boundary relation id (Overpass area scoping) and a centre coordinate (radius-based sources like Playtomic):

| City | Relation ID | Centre (lat, lng) | Note |
|---|---|---|---|
| Hamilton | 7034910 | 43.2557, -79.8711 | admin_level 6; strictly outside the GTA proper, part of the original Halton/Hamilton scope |
| Burlington | 2407513 | 43.3255, -79.7990 | Halton |
| Oakville | 2407500 | 43.4675, -79.6877 | Halton |
| Milton | 2414122 | 43.5183, -79.8774 | Halton |
| Mississauga | 1954127 | 43.5890, -79.6441 | Peel |
| Brampton | 2407358 | 43.7315, -79.7624 | Peel |
| Toronto | 324211 | 43.6532, -79.3832 | admin_level 6, overlaps neighbours; OSM adapter dedupes by type/id |
| Vaughan | 324212 | 43.8361, -79.4983 | York |
| Markham | 324213 | 43.8561, -79.3370 | York |
| Richmond Hill | 2407259 | 43.8828, -79.4403 | York |

To add a city: find its "boundary/administrative" result on nominatim.openstreetmap.org, copy the relation id, cross-check the Wikidata Q-id (safest way to avoid the wrong same-named place), add centre lat/lng. The registry loader throws if lat/lng are missing. Durham region (Pickering, Ajax, Whitby, Oshawa) is not yet covered.

## 6. When NOT to use this skill

- Running or scheduling the pipeline, seeding, deploys: `onside-run-and-operate`.
- Environment setup, keys, secrets names, env matrices: `onside-config-and-flags` and `onside-build-and-env`.
- A scrape run failed / guard tripped / data looks wrong right now: `onside-debugging-playbook` (triage), `onside-failure-archaeology` (the incident stories, e.g. the ROLLUP_TO and exit-1 sagas in full).
- Which changes need what review/gates: `onside-change-control`. Nothing here overrides docs/scraping.md's ToS rules.
- What Onside may publicly claim about its data, and attribution/licence obligations as a compliance checklist: `onside-external-positioning`.
- Open research problems (better dedup, inference beyond scraping): `onside-research-frontier`.

## 7. Provenance and maintenance

Everything above was verified against the repo on 2026-07-05. Re-verify before trusting a drifted fact (run from the repo root):

| Fact | Re-verification |
|---|---|
| Dedup thresholds and stop/generic token lists | `grep -n "RADIUS_M\|NAME_SIM\|STOP_TOKENS\|GENERIC_TOKENS" apps/api/scripts/scrape/lib/dedupe.ts` |
| Source priority ladder | `grep -n -A9 "SOURCE_PRIORITY" apps/api/scripts/scrape/lib/dedupe.ts` |
| Enum values | `cat apps/api/scripts/scrape/fieldEnums.ts` |
| City list (10) and relation ids | `grep -c "osm_relation_id" apps/api/scripts/scrape/data/cities.yaml` |
| Operator count (21) and platform keys | `grep -c "^  - name:" apps/api/scripts/scrape/data/operators.yaml` |
| Playtomic endpoint, sport ids, zero-GTA note | `sed -n '1,35p' apps/api/scripts/scrape/sources/playtomic.ts` |
| Playtomic GTA count still zero (live) | `curl -s "https://api.playtomic.io/v1/tenants?coordinate=43.6532,-79.3832&radius=20000&sport_id=FUTSAL&size=40" -H "User-Agent: Onside-scraper/1.0 (https://getonside.ca)" \| head -c 300` |
| Toronto layer row count (229) | `curl -s -G "https://gis.toronto.ca/arcgis/rest/services/cot_geospatial13/FeatureServer/54/query" --data-urlencode "where=ASSET_TYPE='Soccer Field'" --data-urlencode "returnCountOnly=true" --data-urlencode "f=json"` (the plain-URL form fails in curl: space and quotes in `where=`) |
| Brampton layer row count (91) | `curl -s -G "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/ParkFeatures/FeatureServer/0/query" --data-urlencode "where=ASSET_NAME='SOCCER FIELD'" --data-urlencode "returnCountOnly=true" --data-urlencode "f=json"` |
| Google no-cache rule and precedence ladder wording | `grep -n "Place ID\|precedence" docs/scraping.md` |
| Photo attribution pairing contract | `grep -n "photo_attributions" supabase/migrations/022_photo_attributions.sql fieldstack-app/src/components/PhotoGallery.tsx` |
| isFreeVenue rule | `grep -n -A6 "export function isFreeVenue" fieldstack-app/src/lib/filters.ts` |
| Brampton attribution still undischarged | `grep -rn -i "city of brampton" site/ fieldstack-app/src/` (empty means still owed) |
| Toronto licence still unconfirmed | `grep -n "opendata@toronto.ca" apps/api/scripts/scrape/sources/toronto.ts docs/scraping.md` |
| Platform URL templates | `sed -n '1,36p' apps/api/scripts/scrape/lib/platformLinks.ts` |
