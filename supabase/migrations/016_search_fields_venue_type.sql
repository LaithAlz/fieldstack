-- Add p_venue_types[] to the search_fields RPC so the mobile filter can
-- narrow results to public_park / private / community_centre. Drops the
-- prior 6-arg signature and replaces it; PostgREST routes by argument
-- name + count.

drop function if exists search_fields(
  float8, float8, float8, field_surface[], field_size[], numeric, text
);

create or replace function search_fields(
  p_lat           float8 default null,
  p_lng           float8 default null,
  p_radius_meters float8 default null,
  p_surfaces      field_surface[] default null,
  p_sizes         field_size[]    default null,
  p_venue_types   venue_type[]    default null,
  p_price_max     numeric default null,
  p_sort          text default 'distance'
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
  )
  select jsonb_build_object(
    'data', coalesce(
      jsonb_agg(
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
            'venue_type', v_venue_type
          ),
          'distance_meters', distance_meters
        )
        order by
          case when p_sort = 'price_asc'  then price_per_hour end asc  nulls last,
          case when p_sort = 'price_desc' then price_per_hour end desc nulls last,
          case when p_sort = 'distance'   then distance_meters end asc nulls last,
          name
      ),
      '[]'::jsonb
    ),
    'total', count(*)
  )
  from matched;
$$;

grant execute on function search_fields(
  float8, float8, float8, field_surface[], field_size[], venue_type[], numeric, text
) to anon, authenticated, service_role;
