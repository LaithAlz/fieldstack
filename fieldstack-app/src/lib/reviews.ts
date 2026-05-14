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
  userId: string;
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
    .order("created_at", { ascending: false });
  if (error) return { data: null, error: new Error(error.message) };
  return {
    data: (data ?? []).map(mapReview),
    error: null,
  };
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

// ---------------------------------------------------------------------------

type ReviewRow = {
  id: string;
  venue_id: string;
  user_id: string;
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
