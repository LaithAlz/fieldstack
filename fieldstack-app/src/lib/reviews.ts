/**
 * Reviews data layer. Goes direct to Supabase from the client because RLS
 * already enforces the right access rules (anyone reads, only owner writes).
 * Keeping the round-trip out of the Fastify API also removes a hop on the
 * common "load venue detail" path.
 */

import { supabase } from "./supabase";

export type Review = {
  id: string;
  venueId: string;
  /** Null when the author deleted their account — the review is anonymized
   *  but kept so venue ratings stay intact. */
  userId: string | null;
  rating: number;
  body: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewSummary = {
  venueId: string;
  avgRating: number;
  reviewCount: number;
};

export async function listVenueReviews(
  venueId: string
): Promise<{ data: Review[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("venue_reviews")
    .select("id, venue_id, user_id, rating, body, created_at, updated_at")
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { data: null, error: new Error(error.message) };
  return {
    data: (data ?? []).map(mapReview),
    error: null,
  };
}

/**
 * All reviews authored by the given user, joined with each venue's name so
 * the UI doesn't need a second round trip per row. Sorted most-recent first.
 */
export type ReviewWithVenue = Review & {
  venue: { id: string; name: string };
};

export async function listMyReviews(
  userId: string
): Promise<{ data: ReviewWithVenue[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("venue_reviews")
    .select(
      "id, venue_id, user_id, rating, body, created_at, updated_at, venue:venues(id, name)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { data: null, error: new Error(error.message) };
  // supabase-js conservatively types FK joins as arrays. Cast through
  // unknown — the actual shape is a single object since venue_id is a
  // one-to-one FK.
  const rows = (data ?? []) as unknown as (ReviewRow & { venue: { id: string; name: string } | null })[];
  // Drop reviews whose venue join is null (deleted venue) — leaves a clean
  // list rather than a "[unknown venue]" row.
  const mapped: ReviewWithVenue[] = rows
    .filter((r): r is ReviewRow & { venue: { id: string; name: string } } => r.venue !== null)
    .map((r) => ({ ...mapReview(r), venue: r.venue }));
  return { data: mapped, error: null };
}

export async function getVenueReviewSummary(
  venueId: string
): Promise<{ data: ReviewSummary | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("venue_review_summary")
    .select("venue_id, avg_rating, review_count")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) return { data: null, error: new Error(error.message) };
  if (!data) {
    // No reviews yet — return a zero summary rather than null so callers can
    // render "0 reviews" without separate empty-state branching.
    return {
      data: { venueId, avgRating: 0, reviewCount: 0 },
      error: null,
    };
  }
  return {
    data: {
      venueId: data.venue_id as string,
      avgRating: Number(data.avg_rating),
      reviewCount: Number(data.review_count),
    },
    error: null,
  };
}

/**
 * Insert-or-update a user's review for a venue. Re-rating the same venue
 * updates the existing row via the (venue_id, user_id) unique constraint.
 * RLS makes sure user_id matches the caller's auth.uid().
 */
export async function upsertReview(input: {
  userId: string;
  venueId: string;
  rating: number;
  body: string | null;
}): Promise<{ data: Review | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("venue_reviews")
    .upsert(
      {
        user_id: input.userId,
        venue_id: input.venueId,
        rating: input.rating,
        body: input.body,
      },
      { onConflict: "venue_id,user_id" }
    )
    .select("id, venue_id, user_id, rating, body, created_at, updated_at")
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: mapReview(data), error: null };
}

export async function deleteReview(
  reviewId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("venue_reviews")
    .delete()
    .eq("id", reviewId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * File a moderation report against a review. Insert-only — the table is
 * not readable from the client (RLS-locked to service_role) so we can't
 * tell the user whether they've already reported this one. The unique
 * constraint on (review_id, reporter_id) means re-reporting is a no-op
 * at the DB level (returns 409); we treat that as success from the UI's
 * perspective so the user sees a confirming toast either way.
 */
export async function reportReview(input: {
  reviewId: string;
  reporterId: string;
  reason?: string;
}): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("review_reports").insert({
    review_id: input.reviewId,
    reporter_id: input.reporterId,
    reason: input.reason ?? "inappropriate",
  });
  if (error) {
    // 23505 = unique_violation. Treat as success — the user has already
    // reported this review; nothing to do.
    const code = (error as { code?: string }).code;
    if (code === "23505") return { error: null };
    return { error: new Error(error.message) };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------

type ReviewRow = {
  id: string;
  venue_id: string;
  user_id: string | null;
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string;
};

function mapReview(row: ReviewRow): Review {
  return {
    id: row.id,
    venueId: row.venue_id,
    userId: row.user_id,
    rating: row.rating,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
