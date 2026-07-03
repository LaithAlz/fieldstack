-- Venue photos come from Google Places (see apps/api/scripts/scrape/enrichPhotos.ts).
-- Google Maps Platform terms require displaying author attributions wherever a
-- Places photo is shown, so store them alongside: photo_attributions[i] credits
-- photos[i]. Kept as a parallel text[] (not jsonb) to match the photos column
-- and stay trivially renderable.

alter table venues
  add column if not exists photo_attributions text[] not null default '{}';

comment on column venues.photo_attributions is
  'Author credit for the same-index entry in photos (Google Places authorAttributions displayName).';
