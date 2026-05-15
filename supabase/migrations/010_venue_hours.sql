-- Operating hours per venue. JSONB shape:
--   {
--     "mon": "06:00-23:00",
--     "tue": "06:00-23:00",
--     ...
--     "sun": null   -- closed
--   }
--
-- Keys: lowercase 3-letter weekday abbreviations. Values: "HH:mm-HH:mm" (24h)
-- or null when closed. We store strings rather than ints/structs to keep the
-- scraper simple — the column is a hint, not a constraint, so the picker
-- gracefully ignores anything it can't parse.
--
-- Nullable so legacy rows (and venues with unknown hours) stay valid; in
-- that case the UI falls back to the 6 AM–11 PM picker default.

alter table venues
  add column if not exists hours jsonb;

comment on column venues.hours is
  'Optional per-weekday open/close hints. Keys mon..sun, values "HH:mm-HH:mm" or null when closed. NULL on the row = no hint, picker uses 6 AM–11 PM default.';
