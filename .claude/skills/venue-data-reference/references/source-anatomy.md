# Source anatomy: exact endpoints, schemas, probed distributions

Companion to `../SKILL.md` section 2. Everything verified against the repo on 2026-07-05; live endpoint facts date-stamped where they can drift. Paths are repo-relative; run commands from the repo root unless stated.

## 1. OSM / Overpass (`apps/api/scripts/scrape/sources/osm.ts`)

Endpoint: `POST https://overpass-api.de/api/interpreter`, body `data=<query>` as `application/x-www-form-urlencoded`.

Per-city query template (relation id from `data/cities.yaml`, AREA_OFFSET = 3_600_000_000):

```
[out:json][timeout:120];
area(<3600000000 + relation_id>)->.city;
(
  way(area.city)["leisure"="pitch"]["sport"="soccer"]["name"];
  node(area.city)["leisure"="pitch"]["sport"="soccer"]["name"];
  way(area.city)["leisure"="sports_centre"]["sport"="soccer"]["name"];
  node(area.city)["leisure"="sports_centre"]["sport"="soccer"]["name"];
  way(area.city)["sport"="soccer"]["building"]["name"];
);
out center tags;
```

`out center` gives ways a single centroid coordinate, so nodes and ways map the same way.

| Aspect | Value |
|---|---|
| external_id | venue `osm:<type>/<id>`, field `osm:field-<type>-<id>` (1 field per pin) |
| User-Agent | `Onside-scraper/1.0 (https://getonside.ca)` |
| Backoff | 0/8/20/40 s on 429, 503, 504, and on HTTP-200-with-remark "timed out" |
| Between cities | 3 s sleep |
| Surface mapping | `surface` tag: artificial/turf/synthetic to `turf`; grass/natural to `grass`; concrete/asphalt/paved to `concrete`; default `grass`. Indoor heuristic overrides to `indoor` |
| Indoor heuristic | `leisure=sports_centre` OR `indoor=yes` OR any `building` tag |
| Size mapping | `length` tag: over 80 to `11v11`, over 50 to `7v7`, else `5v5`; no length: sports_centre to `5v5`, `sport=futsal` to `futsal`, else `11v11` |
| venue_type | name contains community centre / rec centre / ymca to `community_centre`; indoor to `private`; else `public_park` |
| Amenities | `lit=yes` or `lighting=yes` adds `lights`; indoor adds `indoor`; `covered=yes` adds `covered`; any `parking` tag adds `parking` |
| Cross-city dedupe | by `<type>/<id>` set (Toronto and Hamilton are admin_level 6 and overlap level-8 neighbours) |

## 2. Municipal ArcGIS / CKAN

Shared fetch: `apps/api/scripts/scrape/lib/arcgis.ts`. User-Agent `FieldStack-scraper/1.0 (https://fieldstack.app)` (legacy brand string, known inconsistency with the OSM UA). Backoff 0/5/15 s on 429 and any 5xx and network errors. Throws on ArcGIS HTTP-200-with-`error`-body. Warns only on `exceededTransferLimit` (no paging implemented; every layer used is under its server cap as of 2026-07-05).

### 2.1 Mississauga (`sources/mississauga.ts`)

- URL: `https://hub-mississauga.opendata.arcgis.com/datasets/mississauga::city-soccer-fields-1.geojson` (whole-layer GeoJSON download, not a FeatureServer query).
- One feature = one FIELD. Grouped into venues by `PARENTID` (fallback: slug of `PARENTDESC`).
- Filter: keep `SERVSTAT` of `OPEN`, `RCNF` (recently constructed), or blank.
- external_id: venue `mississauga:parent-<PARENTID>` or `mississauga:park-<slug>`, field `mississauga:field-<GISKEY|OBJECTID>`.
- Surface always `grass`; size from `TYPEDESC` keywords (11/7/5, "box" to `3v3`, "futsal" to `futsal`, default `7v7`).
- Address from `ADDRESS`, else `STREETNUMBER + STREETNAME`, else park name.

### 2.2 Toronto (`sources/toronto.ts`)

- Fields layer: `https://gis.toronto.ca/arcgis/rest/services/cot_geospatial13/FeatureServer/54/query?where=ASSET_TYPE='Soccer Field'&outFields=*&f=geojson` (229 rows as of 2026-07-05, Point geometry, one row per field).
- Address join: CKAN parks file `https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/cbea3a67-9168-4c6d-8186-16ac1a795b5b/resource/f6cdcd50-da7b-4ede-8e60-c3cdba70b559/download/parks-and-recreation-facilities-4326.geojson`, exact `ASSET_NAME` to `ADDRESS` match.
- Grouping: `parkKey(ROLLUP_TO)` where parkKey strips a trailing `- Sports Field Area` (case-insensitive, regex `/\s*-\s*sports? field area.*$/i`). Without this, one park splits into two venues that evade both dedupe tiers (live-confirmed variant pairs 17-116 m apart) and the address join misses.
- external_id: venue `toronto:park-<slug(parkKey)>`, field `toronto:field-<ASSET_ID>`.
- Probed `SURFACE_MATERIAL` distribution (2026-07-05, groupBy over all 229 rows): "Turf" 217, "Artificial Turf" 7, null 5. No natural-grass value exists in the layer, so bare "Turf" maps to `turf` and null to `grass`.
- Probed `FIELD_SIZE_TYPE`: Full 57, Full Size 5, Junior 34, Mini 55, Mini-Pitch 4, null 75. Mapping: Mini to `3v3`, Junior to `7v7`, Full/null to `11v11`.
- Field name: `PUBLIC_NAME` if non-empty, else `ASSET_NAME` with 2+ whitespace runs removed entirely ("Soccer Field (  2)" becomes "Soccer Field (2)").
- Venue pin = centroid of member fields; venues where every member field had null geometry are dropped.
- `LIGHTING_IND === "Y"` on any member adds the `lights` amenity.

### 2.3 Brampton (`sources/brampton.ts`)

- Soccer rows: `https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/ParkFeatures/FeatureServer/0/query?where=ASSET_NAME='SOCCER FIELD'&outFields=*&f=geojson` (91 rows as of 2026-07-05).
- One row = one park's soccer bundle; geometry is a single MultiPoint holding every field's coordinate. Exploded into one placeholder field per point (`Soccer Field <n>`, `grass`, `7v7`), 1-based index. Point order is NOT stable across city data updates; accepted because the placeholders are interchangeable, a reorder just renames "Field 3" to "Field 4".
- Address join: `https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/ParksPts/FeatureServer/0/query?where=1=1&outFields=PARK_NAME,ADDRESS&f=geojson`, exact `FULL_NAME` to `PARK_NAME` match. Probed 2026-07-05: only 41 of 91 soccer rows joined (many are school grounds like "BRAMALEA S.S." absent from ParksPts); fallback is the park name.
- external_id: venue `brampton:park-<ID>`, field `brampton:field-<ID>-<n>`.
- Null-geometry rows explode to zero fields and are dropped.

## 3. Google Places (New)

### 3.1 Discovery (`sources/googlePlaces.ts`)

- `POST https://places.googleapis.com/v1/places:searchText` with headers `X-Goog-Api-Key` and `X-Goog-FieldMask`.
- Field mask (billing control, request nothing unmapped): `places.id, places.displayName, places.formattedAddress, places.location, places.types, places.websiteUri, nextPageToken`.
- Queries: 5 terms (`indoor soccer`, `soccer dome`, `futsal`, `indoor sports complex soccer`, `soccer training centre`) x 10 cities, textQuery `"<term> in <city>, Ontario"`, `regionCode: "CA"`, pageSize 20, up to 3 pages per query (max 60 results). New page tokens need about 2 s before they are valid; 150 ms sleep between queries.
- Relevance filter regex on the name (lenient, keeps maybes): soccer/futsal/futbol/football/indoor/sportsplex/sports complex-centre-plex/dome/arena/field house/pitch/turf/academy.
- Output: `private` venue, `googlePlaceId` set, ONE placeholder field `google:<place_id>:field-1` (`Indoor field`, `indoor`, `5v5`), booking URL = the place's own `websiteUri`.
- Cost: Text Search is billed per call; a full run is terms x cities x pages. Scheduled weekly, not per deploy.

### 3.2 Photo enrichment (`apps/api/scripts/scrape/enrichPhotos.ts`, weekly in `.github/workflows/scrape.yml`)

Constants: MATCH_RADIUS_M 300, MAX_PHOTOS 4, DELAY_MS 120 between venues, page size 1000.

1. Resolution order per venue, cheapest first: stored `venues.google_place_id` (zero Places calls); id embedded in a `google:*` external_id; paid Text Search with 500 m location bias, accepted only within 300 m of our pin (a name collision across town cannot attach the wrong photos).
2. Dead stored ids are never terminal: a 404 on Place Details falls through to fresh resolution; the stored id is replaced or cleared. Transient 429/5xx leaves the stored id alone.
3. Place Details with `photos` field mask, then each photo's `/media?maxWidthPx=...&skipHttpRedirect=true` returns JSON with a keyless `lh3.googleusercontent.com` URI. That URI is stored; no API key ships to clients.
4. Attributions stored parallel to photos: `Photo: <author> / Google` or `Photo via Google`. App and site render `photo_attributions[i]` with `photos[i]` (migration 022 contract).
5. Any id resolved via paths 2 or 3 is back-filled into `venues.google_place_id` so next week's run short-circuits.

Venues with no confident match or no photos are left untouched (the app falls back to the satellite hero image).

## 4. Playtomic (`sources/playtomic.ts`)

- `GET https://api.playtomic.io/v1/tenants?coordinate=<lat>,<lng>&radius=20000&sport_id=<FUTSAL|FOOTBALL7>&size=40`, no auth, User-Agent `FieldStack-scraper/1.0 (https://fieldstack.app)`.
- Backoff 0/5/15 s on 429/503/504; non-retryable non-OK (e.g. 400 VALIDATION_ERROR) throws immediately. 1.5 s sleep between queries. Sweeps every city x both sport ids, dedupes tenants by `tenant_id`.
- Client-side filter (mandatory, server filter is loose): keep tenants with `playtomic_status === "ACTIVE"`, a slug or tenant_uid, finite coordinates, and at least one resource where `sport_id` is in {FUTSAL, FOOTBALL7} and `is_active !== false`.
- Mapping: FUTSAL resource to surface `concrete` size `futsal`; otherwise indoor resource_type to `indoor` else `turf`, size `7v7`. Venue is `private`, `confidence: 3`, bookingUrl `https://playtomic.com/clubs/<slug>` tagged `bookingPlatform: 'playtomic'`. Opening hours map to the app's `mon..sun` `"HH:mm-HH:mm"` shape; default cancellation policy maps to a sentence.
- external_id: venue `playtomic:<tenant_id>`, field `playtomic:<tenant_id>:<resource_id>`.
- Note: `confidence` is adapter-set scaffolding; the runner does not consume it (as of 2026-07-05).
- Availability endpoint (`GET /v1/availability`, tenant_id, max 25 h window) exists but is deliberately out of scope for the discovery-only adapter; anything load-bearing requires the official club API (read-only, club-scoped credentials generated in Playtomic Manager, docs cite about 1 call/min, one-month change notice).

## 5. Where each fact class should come from (enrichment precedence)

From `docs/scraping.md` section 2, the attribute-to-best-source table:

| Attribute | Best source | Note |
|---|---|---|
| Field count/names/sizes | Booking platform > municipal > OSM heuristics | Platforms expose real resources; OSM guesses 1 field per pin |
| Surface | Municipal/platform > OSM surface tag | |
| Price per hour | Booking platform ONLY | OSM and municipal data never carry price |
| Hours | Google Places / platform | Places hours are display-time only (no-cache rule) |
| Photos | Google Places (transient, attributed) or operator-supplied | |
| Booking notes / cancellation | Operator site / platform | |
