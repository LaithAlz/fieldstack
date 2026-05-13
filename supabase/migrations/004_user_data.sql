-- =========================================================================
-- User-scoped data: saved venues, preferred slot, booking history, recents.
--
-- Each row references auth.users(id) and is locked behind an
-- auth.uid() = user_id RLS policy. Anon callers can't read or write user
-- rows; authed callers see only their own.
--
-- Date/time columns intentionally use text for `start_time` (HH:mm) to
-- match the client's wire format exactly — no parse/format round trips.
-- `slot_date` uses the proper postgres `date` type since it sorts cleanly
-- and the client already serializes to YYYY-MM-DD.
-- =========================================================================

-- -------------------------------------------------------------------------
-- user_saved_venues
-- -------------------------------------------------------------------------
create table if not exists user_saved_venues (
  user_id    uuid not null references auth.users(id) on delete cascade,
  venue_id   uuid not null references venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

create index if not exists user_saved_venues_user_idx
  on user_saved_venues (user_id, created_at desc);

alter table user_saved_venues enable row level security;

-- Drop-then-create makes the migration safe to re-run; Postgres policies
-- don't support IF NOT EXISTS.
drop policy if exists "users read own saved venues" on user_saved_venues;
create policy "users read own saved venues"
  on user_saved_venues for select
  using (auth.uid() = user_id);

drop policy if exists "users insert own saved venues" on user_saved_venues;
create policy "users insert own saved venues"
  on user_saved_venues for insert
  with check (auth.uid() = user_id);

drop policy if exists "users delete own saved venues" on user_saved_venues;
create policy "users delete own saved venues"
  on user_saved_venues for delete
  using (auth.uid() = user_id);


-- -------------------------------------------------------------------------
-- user_preferred_slot — one row per user.
-- -------------------------------------------------------------------------
create table if not exists user_preferred_slot (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  slot_date  date not null,
  -- HH:mm 24-hour. Regex enforced because text columns don't otherwise
  -- prevent garbage from corrupting the format.
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  duration   numeric(3, 1) not null check (duration > 0 and duration <= 6),
  updated_at timestamptz not null default now()
);

-- updated_at maintenance — default only fires on insert. Trigger keeps it
-- fresh on every UPDATE without the client having to pass it explicitly.
create or replace function set_user_preferred_slot_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_preferred_slot_updated_at
  on user_preferred_slot;
create trigger trg_user_preferred_slot_updated_at
  before update on user_preferred_slot
  for each row
  execute function set_user_preferred_slot_updated_at();

alter table user_preferred_slot enable row level security;

drop policy if exists "users read own preferred slot" on user_preferred_slot;
create policy "users read own preferred slot"
  on user_preferred_slot for select
  using (auth.uid() = user_id);

drop policy if exists "users upsert own preferred slot" on user_preferred_slot;
create policy "users upsert own preferred slot"
  on user_preferred_slot for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own preferred slot" on user_preferred_slot;
create policy "users update own preferred slot"
  on user_preferred_slot for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own preferred slot" on user_preferred_slot;
create policy "users delete own preferred slot"
  on user_preferred_slot for delete
  using (auth.uid() = user_id);


-- -------------------------------------------------------------------------
-- user_booking_history — append-only log of booking attempts.
-- -------------------------------------------------------------------------
create table if not exists user_booking_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  field_id     uuid not null references fields(id) on delete cascade,
  venue_id     uuid not null references venues(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  slot_date    date not null,
  start_time   text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  duration     numeric(3, 1) not null check (duration > 0 and duration <= 6)
);

create index if not exists user_booking_history_user_idx
  on user_booking_history (user_id, attempted_at desc);

alter table user_booking_history enable row level security;

drop policy if exists "users read own booking history" on user_booking_history;
create policy "users read own booking history"
  on user_booking_history for select
  using (auth.uid() = user_id);

drop policy if exists "users insert own booking history" on user_booking_history;
create policy "users insert own booking history"
  on user_booking_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "users delete own booking history" on user_booking_history;
create policy "users delete own booking history"
  on user_booking_history for delete
  using (auth.uid() = user_id);


-- -------------------------------------------------------------------------
-- user_recently_viewed — composite-PK upsert table. Re-viewing a venue
-- updates `viewed_at` in place rather than appending.
-- -------------------------------------------------------------------------
create table if not exists user_recently_viewed (
  user_id   uuid not null references auth.users(id) on delete cascade,
  venue_id  uuid not null references venues(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

create index if not exists user_recently_viewed_user_idx
  on user_recently_viewed (user_id, viewed_at desc);

alter table user_recently_viewed enable row level security;

drop policy if exists "users read own recently viewed" on user_recently_viewed;
create policy "users read own recently viewed"
  on user_recently_viewed for select
  using (auth.uid() = user_id);

drop policy if exists "users upsert own recently viewed" on user_recently_viewed;
create policy "users upsert own recently viewed"
  on user_recently_viewed for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own recently viewed" on user_recently_viewed;
create policy "users update own recently viewed"
  on user_recently_viewed for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own recently viewed" on user_recently_viewed;
create policy "users delete own recently viewed"
  on user_recently_viewed for delete
  using (auth.uid() = user_id);
