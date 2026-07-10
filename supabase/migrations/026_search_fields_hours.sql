-- Add venues.hours to search_fields's venue projection so clients can
-- compute a real "open now" instead of falling back to the default
-- 6:00-23:00 window (the Explore chip and card labels did exactly that;
-- see fieldstack-app/src/lib/venueHours.ts).
--
-- Replay-safety note (the migration-019 rule): the argument list AND the
-- return type (jsonb) are unchanged from migration 020, so CREATE OR
-- REPLACE is safe here; no drop needed. Only the function body changes.

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
    limit  p_limit
    offset p_offset
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
