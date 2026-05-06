-- FieldStack initial schema
-- Tables: operators, venues, fields, waitlist
-- Extensions: postgis (for geography(Point)) + pgcrypto (for gen_random_uuid())

create extension if not exists pgcrypto;
create extension if not exists postgis;

-- =========================================================================
-- Enums
-- =========================================================================

create type integration_type as enum ('none', 'playtomic', 'courtreserve', 'amilia');
create type field_surface    as enum ('turf', 'grass', 'concrete', 'indoor');
create type field_size       as enum ('5v5', '7v7', '11v11');

-- =========================================================================
-- operators
-- =========================================================================

create table operators (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  website          text,
  phone            text,
  integration_type integration_type not null default 'none',
  created_at       timestamptz not null default now()
);

-- =========================================================================
-- venues
-- =========================================================================

create table venues (
  id          uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operators(id) on delete restrict,
  name        text not null,
  address     text not null,
  lat         float8,
  lng         float8,
  location    geography(Point, 4326),
  photos      text[] not null default '{}',
  amenities   text[] not null default '{}',
  website     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Auto-populate `location` from lat/lng on insert/update so callers never have
-- to construct PostGIS geometry by hand. ST_MakePoint takes (lng, lat).
create or replace function venues_sync_location()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.location := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  else
    new.location := null;
  end if;
  return new;
end;
$$;

create trigger venues_sync_location_trg
before insert or update of lat, lng on venues
for each row execute function venues_sync_location();

-- GIST index makes ST_DWithin radius queries O(log n) instead of full scan.
create index venues_location_gix on venues using gist (location);
create index venues_operator_idx on venues (operator_id);
create index venues_active_idx   on venues (is_active) where is_active;

-- =========================================================================
-- fields
-- =========================================================================

create table fields (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid not null references venues(id) on delete cascade,
  name             text not null,
  surface          field_surface not null,
  size             field_size not null,
  price_per_hour   numeric(10, 2),
  booking_url      text,
  booking_platform integration_type not null default 'none',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create index fields_venue_idx  on fields (venue_id);
create index fields_active_idx on fields (is_active) where is_active;

-- =========================================================================
-- waitlist
-- =========================================================================

create table waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  city       text,
  source     text,
  created_at timestamptz not null default now()
);

create unique index waitlist_email_uniq on waitlist (lower(email));

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table operators enable row level security;
alter table venues    enable row level security;
alter table fields    enable row level security;
alter table waitlist  enable row level security;

-- Public directory: anon + authenticated can read active rows.
create policy "operators_public_read" on operators for select using (true);
create policy "venues_public_read"    on venues    for select using (is_active);
create policy "fields_public_read"    on fields    for select using (is_active);

-- Anyone (anon) can join the waitlist; nobody but service-role can read it.
create policy "waitlist_anon_insert" on waitlist for insert to anon, authenticated with check (true);
