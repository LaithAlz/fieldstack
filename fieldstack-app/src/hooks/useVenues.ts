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

const PAGE_SIZE = 50;

type UseVenuesOptions = {
  coords?: Coords;
  radiusKm?: number;
  /**
   * Exact-id mode (Saved tab): fetch precisely these venues, ignoring
   * location scoping and pagination. An empty array short-circuits to an
   * empty result without a network call.
   */
  ids?: string[];
};

type UseVenuesResult = {
  venues: VenueWithFields[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  /** True when the visible list came from the offline cache, not the server. */
  staleFromCache: boolean;
  /** When `staleFromCache` is true, the wall-clock time the cache was written. */
  cachedAt: number | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
};

export function useVenues({ coords, radiusKm = 25, ids }: UseVenuesOptions): UseVenuesResult {
  const [venues, setVenues] = useState<VenueWithFields[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [staleFromCache, setStaleFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const requestId = useRef(0);
  const offsetRef = useRef(0);
  // Stable identity for the ids list so the fetch effect doesn't re-run on
  // every render when the caller builds the array inline.
  const idsKey = ids ? [...ids].sort().join(",") : null;

  const fetchVenues = useCallback(
    async (mode: "initial" | "refresh" | "more") => {
      const id = ++requestId.current;
      const offset = mode === "more" ? offsetRef.current : 0;

      // Exact-id mode with nothing saved: settle synchronously.
      if (idsKey !== null && idsKey.length === 0) {
        setVenues([]);
        setTotal(0);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }

      if (mode === "initial") setLoading(true);
      else if (mode === "refresh") setRefreshing(true);
      else setLoadingMore(true);

      try {
        const params = idsKey !== null
          ? { ids: idsKey.split(",") }
          : {
              ...(coords ? { lat: coords.lat, lng: coords.lng, radius_km: radiusKm } : {}),
              limit: PAGE_SIZE,
              offset,
            };
        const result = await getVenues(params);

        if (id !== requestId.current) return;

        if (result.error) {
          setError(result.error);
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
          const page = result.data;
          if (mode === "more") {
            setVenues((prev) => [...prev, ...page]);
          } else {
            setVenues(page);
            setStaleFromCache(false);
            setCachedAt(null);
            // Only the location-scoped list feeds the offline cache — an
            // id-subset (Saved tab) would poison it for the Explore list.
            if (idsKey === null) void setCachedVenues(page);
          }
          setTotal(result.total);
          setError(null);
          offsetRef.current = offset + page.length;
        }
      } finally {
        if (id === requestId.current) {
          if (mode === "initial") setLoading(false);
          else if (mode === "refresh") setRefreshing(false);
          else setLoadingMore(false);
        }
      }
    },
    [coords, radiusKm, idsKey]
  );

  useEffect(() => {
    offsetRef.current = 0;
    void fetchVenues("initial");
  }, [fetchVenues]);

  const refresh = useCallback(async () => {
    offsetRef.current = 0;
    await fetchVenues("refresh");
  }, [fetchVenues]);

  const loadMore = useCallback(async () => {
    if (loadingMore || venues.length >= total) return;
    await fetchVenues("more");
  }, [fetchVenues, loadingMore, venues.length, total]);

  return {
    venues,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore: venues.length < total,
    staleFromCache,
    cachedAt,
    refresh,
    loadMore,
  };
}
