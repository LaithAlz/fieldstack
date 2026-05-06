/**
 * Fetches venues from the API, scoped to a coordinate + radius when provided.
 * Manages loading / refreshing / error state so the screen can wire pull-to-
 * refresh and error toasts without owning request lifecycle.
 *
 * The API already sorts venues by distance when lat/lng/radius are passed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { getVenues } from "../api/venues";
import type { Coords } from "../lib/location";
import type { VenueWithFields } from "../types/api";

type UseVenuesOptions = {
  coords?: Coords;
  radiusKm?: number;
};

type UseVenuesResult = {
  venues: VenueWithFields[];
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

export function useVenues({ coords, radiusKm = 25 }: UseVenuesOptions): UseVenuesResult {
  const [venues, setVenues] = useState<VenueWithFields[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);

  const fetchVenues = useCallback(
    async (mode: "initial" | "refresh") => {
      const id = ++requestId.current;
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      const params = coords
        ? { lat: coords.lat, lng: coords.lng, radius_km: radiusKm }
        : undefined;
      const result = await getVenues(params);

      // Drop stale responses if a newer request started while this one was in flight.
      if (id !== requestId.current) return;

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setVenues(result.data);
        setError(null);
      }
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    },
    [coords, radiusKm]
  );

  useEffect(() => {
    void fetchVenues("initial");
  }, [fetchVenues]);

  const refresh = useCallback(() => fetchVenues("refresh"), [fetchVenues]);

  return { venues, loading, refreshing, error, refresh };
}
