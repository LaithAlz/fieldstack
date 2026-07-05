-- Google Place ID persistence (see apps/api/scripts/scrape/enrichPhotos.ts).
-- The one Places field Google's terms allow storing durably; written by the
-- google scrape source and by enrichPhotos' resolution write-back so weekly
-- photo refreshes can skip a paid Text Search re-resolution.

alter table venues
  add column if not exists google_place_id text;

comment on column venues.google_place_id is
  'The one Places field allowed in durable storage (content must be fetched at display time); written by the google scrape source and by enrichPhotos'' resolution write-back so weekly photo refreshes skip paid Text Search re-resolution.';
