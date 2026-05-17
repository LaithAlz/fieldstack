-- Venue type classification: public park / private commercial / community
-- centre. Lets the user filter "I want city park fields" vs "I want indoor
-- turf places" without scrolling through both.
--
-- Nullable for now — existing rows backfill from data source/name heuristics
-- below, and the scraper will keep new rows populated. The mobile UI treats
-- NULL as "unknown" and still returns the row from the unfiltered query.

create type venue_type as enum ('public_park', 'private', 'community_centre');

alter table venues
  add column venue_type venue_type;

-- Backfill: every Mississauga scraped row is a city park.
update venues
  set venue_type = 'public_park'
  where venue_type is null
    and data_source = 'scrape'
    and external_id like 'mississauga:%';

-- Backfill: OSM rows that mention community/rec centre in the name get
-- bucketed there. Anything else from OSM that scrape marked as indoor is
-- treated as private (commercial indoor turf, club facilities, sports domes).
-- Remaining OSM rows fall through to public_park (named municipal fields,
-- school yards we keep visible, etc.). The scraper itself starts setting
-- venue_type on next run so this is a one-shot bootstrap.
update venues
  set venue_type = 'community_centre'
  where venue_type is null
    and data_source = 'scrape'
    and external_id like 'osm:%'
    and (
      name ilike '%community centre%'
      or name ilike '%community center%'
      or name ilike '%rec centre%'
      or name ilike '%recreation centre%'
      or name ilike '%recreation center%'
      or name ilike '%ymca%'
    );

update venues
  set venue_type = 'private'
  where venue_type is null
    and data_source = 'scrape'
    and external_id like 'osm:%'
    and 'indoor' = any(amenities);

update venues
  set venue_type = 'public_park'
  where venue_type is null
    and data_source = 'scrape'
    and external_id like 'osm:%';

create index venues_venue_type_idx on venues (venue_type)
  where venue_type is not null;
