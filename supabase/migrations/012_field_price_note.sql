-- Free-text pricing caveat for fields. The single `price_per_hour` column
-- undersells reality at most venues — peak/off-peak/weekend rates, member
-- discounts, drop-in vs membership. Rather than model each variant (and
-- guess wrong), let the scraper / operator drop a short string the UI
-- shows verbatim:
--
--   "Peak $150 / Off-peak $90 / Weekend $180"
--   "Member $80 · Drop-in $120"
--   "+$20 weekday evenings after 6 PM"
--
-- Nullable; UI renders only when present.

alter table fields
  add column if not exists price_note text;

comment on column fields.price_note is
  'Free-text pricing caveat shown beside price_per_hour (peak/off-peak/member rates, etc.). NULL = base price only.';
