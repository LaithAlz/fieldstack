-- Preserve public review content when a user deletes their account.
--
-- Personal tables (saved venues, preferred slot, booking history, recently
-- viewed) still cascade-delete with the auth user — that data is private and
-- worthless to keep. But `venue_reviews` is public content that feeds every
-- venue's average rating and count via `venue_review_summary`. Cascading it
-- away silently shifts a venue's rating whenever an author leaves.
--
-- Instead, dissociate: keep the row (rating + body, so aggregates stay
-- intact) and null the author on delete — the Google/Yelp "A former user"
-- model. Same for moderation reports, so the audit trail survives the
-- reporter leaving.
--
-- Safe against direct abuse: the insert RLS check `auth.uid() = user_id`
-- evaluates to NULL (not true) when user_id is null, so clients still can't
-- create pre-anonymized rows — only ON DELETE SET NULL produces them. And
-- the update/delete RLS (`auth.uid() = user_id`) leaves a nulled row
-- immutable to everyone but service_role, which is correct: nobody should
-- edit a departed user's review.

-- venue_reviews: user_id nullable, FK cascade -> set null
alter table venue_reviews alter column user_id drop not null;
alter table venue_reviews drop constraint if exists venue_reviews_user_id_fkey;
alter table venue_reviews
  add constraint venue_reviews_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- review_reports: reporter_id nullable, FK cascade -> set null
alter table review_reports alter column reporter_id drop not null;
alter table review_reports drop constraint if exists review_reports_reporter_id_fkey;
alter table review_reports
  add constraint review_reports_reporter_id_fkey
  foreign key (reporter_id) references auth.users(id) on delete set null;
