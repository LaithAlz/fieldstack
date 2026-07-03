-- Cross-source dedup provenance (see apps/api/scripts/scrape/dedupe.ts).
-- When the dedup pass hides a venue as a duplicate, it records which venue
-- it duplicates — so the deactivation is auditable and reversible, and a
-- future re-scrape can route data from the hidden row to the keeper.

alter table venues
  add column if not exists duplicate_of uuid references venues (id);

comment on column venues.duplicate_of is
  'Set when this row was deactivated as a cross-source duplicate of the referenced venue.';
