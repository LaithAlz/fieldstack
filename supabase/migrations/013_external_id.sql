-- External-id columns for idempotent scrape upserts. Each row tracks the
-- source-side identifier (e.g. "mississauga:landmark-12345") so subsequent
-- scrape runs update the same record instead of inserting duplicates.
--
-- Nullable + unique-when-set. Hand-created rows (seed + operator claims) keep
-- NULL here; the unique index has a NULLS DISTINCT semantics check so
-- multiple null values don't collide.

alter table venues
  add column if not exists external_id text;

alter table fields
  add column if not exists external_id text;

-- Partial unique indexes: enforce uniqueness only when external_id is set.
create unique index if not exists venues_external_id_uniq
  on venues (external_id)
  where external_id is not null;

create unique index if not exists fields_external_id_uniq
  on fields (external_id)
  where external_id is not null;

comment on column venues.external_id is
  'Source-side identifier (e.g. "mississauga:UNIT-1234"). NULL for manually-created rows. Used by scrape runs for idempotent upserts.';
comment on column fields.external_id is
  'Source-side identifier for the field row. NULL for manually-created rows.';
