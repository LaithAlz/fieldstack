-- =========================================================================
-- Venue reviews. One row per (venue, user). Users can update / delete their
-- own; everyone (including anon) can read.
--
-- Public read so guest browsing surfaces average ratings without auth. Writes
-- require authed user matching the row's user_id via RLS.
--
-- The aggregate view `venue_review_summary` is published as a normal view so
-- PostgREST exposes it for the venue list / detail endpoints. It runs under
-- the caller's role so anon read works (the underlying table allows public
-- read anyway).
-- =========================================================================

create table if not exists venue_reviews (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  body       text check (body is null or length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One review per (venue, user). Re-submitting becomes an UPDATE via
  -- ON CONFLICT in the client write path.
  unique (venue_id, user_id)
);

create index if not exists venue_reviews_venue_idx
  on venue_reviews (venue_id, created_at desc);

-- updated_at maintenance — same trigger pattern as 004.
create or replace function set_venue_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_venue_reviews_updated_at
  on venue_reviews;
create trigger trg_venue_reviews_updated_at
  before update on venue_reviews
  for each row
  execute function set_venue_reviews_updated_at();

-- -------------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------------
alter table venue_reviews enable row level security;

-- Public read — guest browsing should still see ratings.
drop policy if exists "anyone reads reviews" on venue_reviews;
create policy "anyone reads reviews"
  on venue_reviews for select
  using (true);

drop policy if exists "users insert own reviews" on venue_reviews;
create policy "users insert own reviews"
  on venue_reviews for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own reviews" on venue_reviews;
create policy "users update own reviews"
  on venue_reviews for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own reviews" on venue_reviews;
create policy "users delete own reviews"
  on venue_reviews for delete
  using (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- Aggregate view for venue cards / detail headers. PostgREST exposes any
-- view in the public schema; consumers query it like a table.
-- -------------------------------------------------------------------------
-- security_invoker=true means the view runs as the caller, not the owner,
-- so RLS on venue_reviews actually applies through the view. Without this
-- the view would behave as SECURITY DEFINER and bypass any future tightening
-- of the underlying table's read policy.
create or replace view venue_review_summary
with (security_invoker = true) as
select
  venue_id,
  round(avg(rating)::numeric, 2) as avg_rating,
  count(*)::int as review_count
from venue_reviews
group by venue_id;

grant select on venue_review_summary to anon, authenticated;
