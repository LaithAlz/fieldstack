-- Per-field photos. Indoor facilities with multiple fields often look
-- visually distinct (e.g. one turf is green-walled, another is brick) and
-- venue-level photos can't tell them apart. Adds an optional text[] column;
-- when null/empty, the UI falls back to venue.photos so we don't have to
-- backfill every field upfront.

alter table fields
  add column if not exists photos text[];

comment on column fields.photos is
  'Optional per-field photo URLs. NULL or empty array → fall back to venue.photos. Most fields will share the venue gallery; this column is for the cases that don''t.';
