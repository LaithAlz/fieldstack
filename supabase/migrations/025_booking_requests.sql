-- =========================================================================
-- In-app booking requests, behind the `in_app_booking` feature flag
-- (fieldstack-app/src/lib/featureFlags.ts). Off by default: shipping this
-- table doesn't change what any user sees until the flag is turned on.
--
-- This is the request-only phase — no payments, no operator confirmation
-- surface yet. A user picks a slot and sends a request; it's stored and
-- visible on their own Profile. Operator-side access (view/confirm/decline)
-- lands with the operator dashboard phase; until then nobody but the
-- requesting user (and service_role) can read or write these rows.
-- =========================================================================

create table if not exists booking_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  field_id        uuid not null references fields(id),
  venue_id        uuid not null references venues(id),
  requested_date  date not null,
  -- HH:mm 24-hour, matching the booking-history / preferred-slot idiom
  -- (migration 004) — text, not `time`, so the wire format needs no
  -- parse/format round trip.
  start_time      text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  duration_hours  numeric not null check (duration_hours > 0 and duration_hours <= 8),
  -- Optional message to the operator.
  note            text,
  status          text not null default 'pending'
                    check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table booking_requests is
  'In-app booking requests behind the in_app_booking feature flag. Request-only phase: no payments, no operator confirmation surface yet. Operator-side access (view/confirm/decline) lands with the operator dashboard phase — until then only the requesting user (and service_role) can read or write these rows.';

create index if not exists booking_requests_user_idx
  on booking_requests (user_id, created_at desc);

-- updated_at maintenance — same trigger pattern as 004/005.
create or replace function set_booking_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_booking_requests_updated_at
  on booking_requests;
create trigger trg_booking_requests_updated_at
  before update on booking_requests
  for each row
  execute function set_booking_requests_updated_at();

-- -------------------------------------------------------------------------
-- RLS. No anon access anywhere below — every policy's using/with check
-- requires auth.uid() = user_id, which evaluates to NULL (not true) for an
-- anonymous request.
-- -------------------------------------------------------------------------
alter table booking_requests enable row level security;

drop policy if exists "users insert own booking requests" on booking_requests;
create policy "users insert own booking requests"
  on booking_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "users read own booking requests" on booking_requests;
create policy "users read own booking requests"
  on booking_requests for select
  using (auth.uid() = user_id);

-- Cancel-only update: a user may transition their own PENDING request to
-- 'cancelled', and nothing else. USING gates which existing rows are
-- reachable (own + still pending); WITH CHECK gates what the row is allowed
-- to become (own + cancelled) — together they block a user from writing
-- status = 'confirmed'/'declined' on their own row (that's the operator-side
-- surface, not shipped yet) and from touching anyone else's row.
drop policy if exists "users cancel own pending booking requests" on booking_requests;
create policy "users cancel own pending booking requests"
  on booking_requests for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'cancelled');

-- No delete policy — a cancelled request stays as a row (not erased) so a
-- future operator view still sees the full history.
