/**
 * Fetches a single venue by id (with its active fields nested) and exposes
 * the standard `{ data, isLoading, error }` triple for the Venue Detail
 * screen. Refetches automatically when `venueId` changes.
 *
 * Uses a request-id guard so a slow first response can't overwrite a fresher
 * one if the user navigates between venues quickly.
 */

import { useEffect, useRef, useState } from "react";

import { getVenue } from "../api/venues";
import type { VenueWithFields } from "../types/api";

type UseVenueResult = {
  data: VenueWithFields | null;
  isLoading: boolean;
  error: Error | null;
};

export function useVenue(venueId: string): UseVenueResult {
  const [data, setData] = useState<VenueWithFields | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);

    (async () => {
      const result = await getVenue(venueId);
      if (id !== requestId.current) return; // stale response — drop

      if (result.error) {
        setError(result.error);
        setData(null);
      } else {
        setData(result.data);
      }
      setIsLoading(false);
    })();
  }, [venueId]);

  return { data, isLoading, error };
}
