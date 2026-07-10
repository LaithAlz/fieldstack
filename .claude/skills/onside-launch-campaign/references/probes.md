# Launch-campaign probe commands

Exact, copy-pasteable probes backing the gates in SKILL.md. All are
READ-ONLY. Scripts that need credentials read them from
`/Users/laith/code/soccer/apps/api/.env` automatically (bun auto-loads .env
from the cwd), which holds `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
Service role bypasses RLS so inactive rows are visible; never paste those
values anywhere. Expected outputs are stamped (as of 2026-07-06).

## 1. Venue counts by source prefix (Front B baseline)

Prefer the maintained script:

```bash
bun /Users/laith/code/soccer/.claude/skills/onside-diagnostics-and-tooling/scripts/db-spot-check.ts
```

Inline equivalent for just the prefix breakdown:

```bash
cd /Users/laith/code/soccer/apps/api && bun -e '
import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await s.from("venues").select("external_id, is_active").limit(5000);
if (error) { console.error(error.message); process.exit(1); }
const counts = {};
for (const v of data) {
  const k = ((v.external_id ?? "manual-null").split(":")[0]) + (v.is_active ? "" : " (inactive)");
  counts[k] = (counts[k] ?? 0) + 1;
}
console.log(JSON.stringify(counts, null, 2));'
```

Expected (2026-07-06): google 312, mississauga 140, toronto 135, brampton 91,
osm 76 active (754 total); inactive rows are dedupe/refine soft-deletes.

## 2. Hours coverage (gate B1 baseline)

```bash
cd /Users/laith/code/soccer/apps/api && bun -e '
import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { count: withHours } = await s.from("venues").select("id", { count: "exact", head: true }).eq("is_active", true).not("hours", "is", null);
const { count: active } = await s.from("venues").select("id", { count: "exact", head: true }).eq("is_active", true);
console.log("active:", active, "with hours:", withHours);'
```

Expected (2026-07-06): `active: 754 with hours: 0`. Gate B1b needs
`with hours` > 0 before the open-now probe below means anything.

## 3. Open-now differentiation probe (gate B1b, run after B1a ships)

Counts open vs closed among venues that HAVE hours, at the time you run it.
Run once around 10:00 and once around 23:30 local (America/Toronto).

```bash
cd /Users/laith/code/soccer/apps/api && bun -e '
import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await s.from("venues").select("hours").eq("is_active", true).not("hours", "is", null).limit(2000);
const days = ["sun","mon","tue","wed","thu","fri","sat"];
const now = new Date();
const key = days[now.getDay()];
const mins = now.getHours() * 60 + now.getMinutes();
let open = 0, closed = 0, malformed = 0;
for (const v of data ?? []) {
  const span = v.hours?.[key];
  const m = typeof span === "string" && span.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) { malformed++; continue; }
  const o = +m[1] * 60 + +m[2], c = +m[3] * 60 + +m[4];
  if (o >= c) { malformed++; continue; }
  if (mins >= o && mins < c) open++; else closed++;
}
console.log(JSON.stringify({ withHours: (data ?? []).length, open, closed, malformedOrClosedToday: malformed }));'
```

Gate passes when `withHours > 0` and, at some probe time, both `open > 0`
and `closed > 0` (venues actually differ from each other). The parsing rules
mirror `fieldstack-app/src/lib/venueHours.ts` (keys mon..sun, `HH:mm-HH:mm`,
open must be before close; migration 010).

## 4. Search projection carries hours (gate B1a)

```bash
curl -s "https://api.getonside.ca/search/fields?lat=43.6532&lng=-79.3832&radius_km=20&limit=5" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print([('hours' in r['venue']) for r in d['data']])"
```

Before B1a: `[False, False, False, False, False]`. After: all True (values
null until B1b). Remember the 30s Redis TTL on this route when re-probing.

## 5. Municipal ground-truth counts (gate B4)

Toronto soccer-field assets (PFR layer 54):

```bash
curl -s -G "https://gis.toronto.ca/arcgis/rest/services/cot_geospatial13/FeatureServer/54/query" \
  --data-urlencode "where=ASSET_TYPE='Soccer Field'" \
  --data-urlencode "returnCountOnly=true" --data-urlencode "f=json"
# Expected (2026-07-06): {"count":229}
```

Brampton park soccer-field bundles:

```bash
curl -s -G "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/ParkFeatures/FeatureServer/0/query" \
  --data-urlencode "where=ASSET_NAME='SOCCER FIELD'" \
  --data-urlencode "returnCountOnly=true" --data-urlencode "f=json"
# Expected (2026-07-06): {"count":91}
```

Mississauga (full geojson, count features):

```bash
curl -sL "https://hub-mississauga.opendata.arcgis.com/datasets/mississauga::city-soccer-fields-1.geojson" \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)['features']))"
# Expected (2026-07-06): 237
```

Note the plain-URL form of the ArcGIS queries fails in curl (spaces and
quotes in `where=`); use `-G --data-urlencode` as above.

DB side to compare (fields by prefix):

```bash
cd /Users/laith/code/soccer/apps/api && bun -e '
import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (const p of ["toronto","mississauga","brampton","osm","google"]) {
  const { count } = await s.from("fields").select("id", { count: "exact", head: true }).eq("is_active", true).like("external_id", p + ":%");
  console.log(p, "fields:", count);
}'
```

Expected (2026-07-06): toronto 229, mississauga 237, brampton 195, osm 82,
google 315. Interpretation: Toronto and Mississauga field counts match their
municipal asset counts exactly; Brampton's 91 municipal rows are park
bundles exploded into 195 placeholder fields, so compare Brampton at the
VENUE level (91).

## 6. Booking-request ops probe (Front C1 concierge loop)

Lists pending requests with venue/field names, oldest first:

```bash
cd /Users/laith/code/soccer/apps/api && bun -e '
import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await s.from("booking_requests")
  .select("id, status, requested_date, start_time, duration_hours, note, created_at, venues(name), fields(name)")
  .eq("status", "pending").order("created_at", { ascending: true }).limit(50);
if (error) { console.error(error.message); process.exit(1); }
console.log(JSON.stringify(data, null, 2));'
```

Expected before C1 rollout: `[]`. Column names come from migration
`025_booking_requests.sql`; if the select errors on a column, re-read that
migration rather than guessing. Status updates (confirm/decline relay
outcomes) are service-role writes; RLS lets the requesting user only cancel.

## 7. PostHog flag sanity (Front C1, on-device)

Local override to exercise the flow without touching the dashboard:

```bash
# in fieldstack-app/.env
EXPO_PUBLIC_FF_IN_APP_BOOKING=1
```

Then in the app (dev build, signed in): venue detail reserve bar reads
"Request to book" and opens the request sheet; submitting fires
`booking_request_submitted` (watch Metro logs or PostHog Activity). Remove
the override and the bar reverts to "Book" with the operator redirect.
