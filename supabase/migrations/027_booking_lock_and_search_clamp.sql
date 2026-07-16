-- =========================================================================
-- Two security-hardening fixes (audit 2026-07-16), both idempotent
-- create-or-replace so a fresh replay from 001 applies cleanly.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. booking_requests: lock every column but `status` on UPDATE.
--
-- The cancel policy (025) gates the update on `auth.uid() = user_id and
-- status = 'pending'` / with check `... and status = 'cancelled'`, but a
-- WITH CHECK only constrains user_id and status — nothing stops the same
-- UPDATE from also rewriting field_id, venue_id, requested_date, start_time,
-- duration_hours, note, or created_at. That corrupts the history the table
-- is meant to preserve for the future operator view. Enforce column
-- immutability in a trigger so only status (and the trigger-managed
-- updated_at) can change after insert.
--
-- No exemption for service_role is needed today: no server/script writes
-- booking_requests (it is user-only data), and the sole app write path is
-- the user cancel. If an operator confirm/decline phase later needs to write
-- other columns, relax this trigger in that migration.
-- -------------------------------------------------------------------------
create or replace function booking_requests_lock_columns()
returns trigger
language plpgsql
as $$
begin
  if new.user_id        is distinct from old.user_id
     or new.field_id       is distinct from old.field_id
     or new.venue_id       is distinct from old.venue_id
     or new.requested_date is distinct from old.requested_date
     or new.start_time     is distinct from old.start_time
     or new.duration_hours is distinct from old.duration_hours
     or new.note           is distinct from old.note
     or new.created_at     is distinct from old.created_at then
    raise exception 'booking_requests: only status may change on update';
  end if;
  return new;
end;
$$;

-- Fires before trg_booking_requests_updated_at (name sorts earlier), so the
-- updated_at bump that follows is unaffected by this check.
drop trigger if exists trg_booking_requests_lock_columns on booking_requests;
create trigger trg_booking_requests_lock_columns
  before update on booking_requests
  for each row
  execute function booking_requests_lock_columns();

-- -------------------------------------------------------------------------
-- 2. search_fields: clamp p_limit / p_offset.
--
-- The RPC is granted to anon/authenticated and callable directly via
-- PostgREST (`/rest/v1/rpc/search_fields`), bypassing the API's Zod bounds.
-- An unclamped p_limit (e.g. 2^31) turns pagination into a full-table heavy
-- scan. Clamp in the function so the bound holds no matter the caller.
--
-- Replay-safety (migration-019 rule): argument list and return type (jsonb)
-- are identical to migration 026, so CREATE OR REPLACE needs no drop; only
-- the limit/offset expressions change.
-- -------------------------------------------------------------------------
create or replace function search_fields(
  p_lat           float8 default null,
  p_lng           float8 default null,
  p_radius_meters float8 default null,
  p_surfaces      field_surface[] default null,
  p_sizes         field_size[]    default null,
  p_venue_types   venue_type[]    default null,
  p_price_max     numeric default null,
  p_sort          text    default 'distance',
  p_limit         int     default 50,
  p_offset        int     default 0
)
returns jsonb
language sql
stable
as $$
  with origin as (
    select case
      when p_lat is not null and p_lng is not null
        then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    end as g
  ),
  matched as (
    select
      f.id, f.venue_id, f.name, f.surface, f.size, f.price_per_hour,
      f.booking_url, f.booking_platform, f.is_active, f.created_at,
      v.id          as v_id,
      v.name        as v_name,
      v.lat         as v_lat,
      v.lng         as v_lng,
      v.address     as v_address,
      v.photos      as v_photos,
      v.venue_type  as v_venue_type,
      v.hours       as v_hours,
      case when (select g from origin) is not null
        then st_distance(v.location, (select g from origin))
      end as distance_meters
    from fields f
    join venues v on v.id = f.venue_id
    where f.is_active
      and v.is_active
      and (p_surfaces    is null or f.surface    = any(p_surfaces))
      and (p_sizes       is null or f.size       = any(p_sizes))
      and (p_venue_types is null or v.venue_type = any(p_venue_types))
      and (p_price_max   is null or f.price_per_hour <= p_price_max)
      and (
        (select g from origin) is null
        or p_radius_meters is null
        or (v.location is not null
            and st_dwithin(v.location, (select g from origin), p_radius_meters))
      )
  ),
  ordered as (
    select * from matched
    order by
      case when p_sort = 'price_asc'  then price_per_hour end asc  nulls last,
      case when p_sort = 'price_desc' then price_per_hour end desc nulls last,
      case when p_sort = 'distance'   then distance_meters end asc nulls last,
      name
    -- Clamp regardless of caller: PostgREST exposes this RPC directly.
    limit  least(greatest(coalesce(p_limit, 50), 0), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'data', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'field', jsonb_build_object(
            'id',                id,
            'venue_id',          venue_id,
            'name',              name,
            'surface',           surface,
            'size',              size,
            'price_per_hour',    price_per_hour,
            'booking_url',       booking_url,
            'booking_platform',  booking_platform,
            'is_active',         is_active,
            'created_at',        created_at
          ),
          'venue', jsonb_build_object(
            'id',         v_id,
            'name',       v_name,
            'lat',        v_lat,
            'lng',        v_lng,
            'address',    v_address,
            'photos',     v_photos,
            'venue_type', v_venue_type,
            'hours',      v_hours
          ),
          'distance_meters', distance_meters
        )
      ) from ordered),
      '[]'::jsonb
    ),
    'total', (select count(*) from matched)
  );
$$;
