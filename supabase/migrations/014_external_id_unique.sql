-- Migration 013 used partial unique indexes (WHERE external_id IS NOT NULL),
-- but PostgREST's upsert ON CONFLICT can't target a partial index. Swap to
-- proper UNIQUE constraints.
--
-- Postgres 15+ defaults to "NULLS DISTINCT" — multiple null values still
-- coexist, only non-null values are enforced unique. That matches what
-- migration 013's partial index achieved, just in a way PostgREST recognizes.

drop index if exists venues_external_id_uniq;
drop index if exists fields_external_id_uniq;

alter table venues
  add constraint venues_external_id_unique unique (external_id);

alter table fields
  add constraint fields_external_id_unique unique (external_id);
