-- Restrict venues_within RPC to return only the venue id.
-- Previously returned SETOF venues (all columns), exposing internal fields
-- like operator_id, data_source, external_id, booking_notes to the anon role.
-- The calling code (src/lib/queries/venues.ts) only uses the id to run a
-- follow-up hydration SELECT, so the projection change is safe.

-- The return type changes (SETOF venues -> table(id uuid)), and Postgres
-- forbids CREATE OR REPLACE across return types — drop first. Safe on
-- replay: 002 recreates it before this runs.
drop function if exists venues_within(float8, float8, float8);

create function venues_within(
  p_lat           float8,
  p_lng           float8,
  p_radius_meters float8
)
returns table(id uuid)
language sql
stable
as $$
  select v.id
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
