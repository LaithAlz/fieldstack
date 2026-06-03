/**
 * Fetches venues from the API, scoped to a coordinate + radius when provided.
 * Manages loading / refreshing / error state so the screen can wire pull-to-
 * refresh and error toasts without owning request lifecycle.
 *
 * Offline fallback: if the live fetch fails AND we have a recent cached
 * snapshot, render the cached list and flag `staleFromCache=true` so the
 * UI can show a banner. Successful fetches refresh the cache.
 *
 * The API already sorts venues by distance when lat/lng/radius are passed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { getVenues } from "../api/venues";
import type { Coords } from "../lib/location";
import { getCachedVenues, setCachedVenues } from "../lib/venueCache";
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
  /** True when the visible list came from the offline cache, not the server. */
  staleFromCache: boolean;
  /** When `staleFromCache` is true, the wall-clock time the cache was written. */
  cachedAt: number | null;
  refresh: () => Promise<void>;
};

export function useVenues({ coords, radiusKm = 25 }: UseVenuesOptions): UseVenuesResult {
  const [venues, setVenues] = useState<VenueWithFields[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [staleFromCache, setStaleFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const requestId = useRef(0);

  const fetchVenues = useCallback(
    async (mode: "initial" | "refresh") => {
      const id = ++requestId.current;
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const params = coords
          ? { lat: coords.lat, lng: coords.lng, radius_km: radiusKm }
          : undefined;
        const result = await getVenues(params);

        // Drop stale responses if a newer request started while this one was in flight.
        if (id !== requestId.current) return;

        if (result.error) {
          setError(result.error);
          // Network/server error — try the offline cache as a fallback. Only
          // applies on initial load; pull-to-refresh failures leave the
          // existing in-memory list alone.
          if (mode === "initial") {
            const cached = await getCachedVenues();
            if (id !== requestId.current) return;
            if (cached) {
              setVenues(cached.venues);
              setStaleFromCache(true);
              setCachedAt(cached.fetchedAt);
            }
          }
        } else if (result.data) {
          setVenues(result.data);
          setError(null);
          setStaleFromCache(false);
          setCachedAt(null);
          void setCachedVenues(result.data);
        }
      } finally {
        // Only clear the flag for the request that is still current; stale
        // requests have already been superseded and should not touch state.
        if (id === requestId.current) {
          if (mode === "initial") setLoading(false);
          else setRefreshing(false);
        }
      }
    },
    [coords, radiusKm]
  );

  useEffect(() => {
    void fetchVenues("initial");
  }, [fetchVenues]);

  const refresh = useCallback(() => fetchVenues("refresh"), [fetchVenues]);

  return { venues, loading, refreshing, error, staleFromCache, cachedAt, refresh };
}
