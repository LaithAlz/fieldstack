# FieldStack

A soccer field discovery and booking aggregator for the Greater Toronto Area. The first slice is the database: operators, venues, fields, and a public waitlist, with PostGIS for radius search.

## Stack

- **Postgres + PostGIS** via Supabase
- **TypeScript** seed scripts (`tsx`)
- `@supabase/supabase-js` v2

## Project layout

```
.
├── supabase/migrations/001_init.sql   # schema + extensions + RLS + trigger
├── scripts/seed.ts                    # service-role seed of 15 GTA venues
├── types/database.ts                  # generated Supabase types
└── package.json
```

## Database

### Setup — local

You need the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and Docker.

```bash
# 1. Install deps
npm install                    # or: pnpm install

# 2. Boot the local stack (Postgres, PostgREST, Studio, etc.)
npx supabase start

# 3. Apply the migration
npx supabase db reset          # wipes + re-applies every migration in supabase/migrations

# 4. Configure env
cp .env.example .env
# Paste the `service_role key` printed by `supabase start` into .env

# 5. Seed
npm run seed
```

Studio is at <http://127.0.0.1:54323> after `supabase start`.

### Setup — remote (linked Supabase project)

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push           # applies migrations to the remote DB

# Then update .env to point at the remote project URL + service_role key
npm run seed
```

### Re-generating types

`types/database.ts` is committed by hand to keep the repo usable without the CLI installed. To regenerate from the live schema:

```bash
npm run db:types               # against local stack
npm run db:types:remote        # against the linked remote project
```

## Schema notes

- **`venues.location`** is a `geography(Point, 4326)` populated by the `venues_sync_location` trigger from `lat` / `lng`. Don't write to it directly — set the lat/lng floats and the trigger handles the rest. There's a GIST index so `ST_DWithin` is fast.
- **RLS** is on. `operators`, `venues`, `fields` are publicly readable (active rows only for venues/fields). `waitlist` accepts inserts from anon but reads are service-role only.
- **Enums** (`integration_type`, `field_surface`, `field_size`) live in the DB; updating them later means an `ALTER TYPE … ADD VALUE` migration.

### Example — venues within 5 km

```sql
select v.name, v.address,
       st_distance(v.location, st_makepoint(-79.3832, 43.6532)::geography) as meters
from venues v
where st_dwithin(
  v.location,
  st_makepoint(-79.3832, 43.6532)::geography,  -- (lng, lat) of downtown Toronto
  5000
)
  and v.is_active
order by meters;
```

From the JS client:

```ts
const { data } = await supabase.rpc("venues_within", { lng, lat, meters: 5000 });
```

(You'll want to wrap the radius query in a SQL function so PostgREST can call it — the migration leaves that to the API layer.)

## Seed data

15 real GTA venues, mix of municipal and private:

| City         | Venues |
|--------------|-------:|
| Toronto      | 7      |
| Mississauga  | 5      |
| Brampton     | 3      |

Coordinates are approximate (good enough for radius queries; refine via a real geocoder before going to prod). Pricing is realistic but not pulled from live booking pages — adjust against actual quotes when you wire up the booking integrations.
