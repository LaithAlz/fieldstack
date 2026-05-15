-- Free-text fields that surface operator-side rules before the user
-- redirects out to book. "24h advance booking required" or "No refund
-- within 24h" feels like trust-building friction in the right place.
--
-- Free-form (not enums) because every operator phrases these differently
-- and scraping a normalized list isn't worth it for V1.
--
-- Both nullable so existing rows stay valid; UI renders the section only
-- when at least one is non-empty.

alter table venues
  add column if not exists booking_notes text,
  add column if not exists cancellation_policy text;

comment on column venues.booking_notes is
  'Free-form pre-redirect notes (e.g. "24h advance booking required"). Shown on the venue detail page.';
comment on column venues.cancellation_policy is
  'Free-form cancellation policy summary (e.g. "Full refund up to 24h before"). Shown on the venue detail page.';
