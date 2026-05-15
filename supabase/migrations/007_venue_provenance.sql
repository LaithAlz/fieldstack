-- Scrape provenance for venues. We acquire venue data via scrapers
-- (operator websites, public booking platforms); this records *where* each
-- row came from and *when* it was last refreshed.
--
-- Nullable so existing rows don't violate constraints — the seed insert
-- and any manual rows continue to work without filling these in. Code
-- gracefully degrades when both are null (no badge rendered).
--
-- Idempotent: `if not exists` lets you paste this without checking.

alter table venues
  add column if not exists data_source text
    check (data_source is null or data_source in ('manual', 'scrape', 'operator_claim')),
  add column if not exists last_scraped_at timestamptz;

-- Optional index — useful once we want to list "stalest venues" or run
-- "scrape any venue not refreshed in 7 days" jobs. Cheap to keep.
create index if not exists venues_last_scraped_at_idx
  on venues (last_scraped_at)
  where last_scraped_at is not null;

comment on column venues.data_source is
  'Where this venue record originated: scrape, manual, operator_claim. NULL for legacy rows.';
comment on column venues.last_scraped_at is
  'Wall-clock time the row was last refreshed from its source. NULL for legacy rows.';
