-- User-facing report mechanism for inappropriate reviews. Required by
-- App Store Review Guideline 1.2 for user-generated content. Anyone
-- signed in can file a report; nobody (anon or authed) can read them
-- back — that's a service-role / dashboard-only surface.
--
-- We track who reported (user_id) so a malicious user can't spam the
-- same review N times with N accounts cheaply, and so we can audit.

create table if not exists review_reports (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references venue_reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  -- One active report per (review, reporter). Re-reporting becomes an
  -- UPDATE via ON CONFLICT in the client write path.
  unique (review_id, reporter_id)
);

create index if not exists review_reports_review_idx
  on review_reports (review_id, created_at desc);

alter table review_reports enable row level security;

-- Authed users can insert their own reports. They cannot read any
-- reports back (not even their own) — keeps the moderation surface
-- private.
drop policy if exists "users insert own reports" on review_reports;
create policy "users insert own reports"
  on review_reports for insert
  with check (auth.uid() = reporter_id);

-- No select policy: anon + authenticated have no read access. The
-- service role bypasses RLS entirely, which is what the moderation
-- dashboard or backend job would use.
