-- Proximity search via PostgREST RPC. PostgREST can't call ST_DWithin directly,
-- so wrap it in a function that returns `setof venues` — the client gets back
-- normal venue rows, ordered by distance, and PostgREST infers the column types.

create or replace function venues_within(
  p_lat           float8,
  p_lng           float8,
  p_radius_meters float8
)
returns setof venues
language sql
stable
as $$
  select v.*
  from venues v
  where v.is_active
    and v.location is not null
    and st_dwithin(
      v.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_meters
    )
  order by st_distance(
    v.location,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  );
$$;

grant execute on function venues_within(float8, float8, float8) to anon, authenticated, service_role;
