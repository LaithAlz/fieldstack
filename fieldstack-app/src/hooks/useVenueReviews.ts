/**
 * Load reviews + aggregate summary for a single venue. Refetches in lockstep
 * whenever the venueId changes or `refresh()` is called from the UI (after
 * submitting / deleting a review).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getVenueReviewSummary,
  listVenueReviews,
  type Review,
  type ReviewSummary,
} from "../lib/reviews";

export type UseVenueReviews = {
  reviews: Review[];
  summary: ReviewSummary | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

export function useVenueReviews(venueId: string): UseVenueReviews {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Tracks the venueId we should accept results for. A → B → A nav within
  // the resolution window of the trailing fetch would otherwise overwrite
  // newer state with stale data.
  const requestedVenueIdRef = useRef(venueId);
  // Prevents setState calls after the component unmounts.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    // Capture the id we're loading for BEFORE updating the ref so the stale
    // guard below compares against a later change rather than itself.
    const thisVenueId = venueId;
    requestedVenueIdRef.current = thisVenueId;
    setIsLoading(true);
    setError(null);
    const [reviewsResult, summaryResult] = await Promise.all([
      listVenueReviews(venueId),
      getVenueReviewSummary(venueId),
    ]);
    // Drop the result if the caller has since moved on to a different venue,
    // or if the component unmounted while the fetch was in flight.
    if (requestedVenueIdRef.current !== thisVenueId) return;
    if (!mountedRef.current) return;

    if (reviewsResult.error) {
      setError(reviewsResult.error);
    } else if (reviewsResult.data) {
      setReviews(reviewsResult.data);
    }
    if (!reviewsResult.error && summaryResult.error) {
      setError(summaryResult.error);
    } else if (summaryResult.data) {
      setSummary(summaryResult.data);
    }
    setIsLoading(false);
  }, [venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { reviews, summary, isLoading, error, refresh: load };
}
