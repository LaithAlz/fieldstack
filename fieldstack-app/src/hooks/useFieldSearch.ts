/**
 * Owns the field-search state machine: filters, location text → coords
 * geocoding, debouncing, fetching, persistence, and analytics. The screen
 * stays a thin shell over this hook.
 *
 * Two independent debouncers:
 *   - `locationText` → 500ms → geocodeAsync → updates lat/lng
 *   - filters / coords → 300ms → searchFields
 *
 * The fetch effect watches both filters and coords; geocoding cascades into
 * a fetch via the second debounce naturally.
 */

import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { searchFields, type SearchFieldsResult, type SearchSort } from "../api/search";
import { EVENT_SEARCH_FILTERED, track } from "../lib/analytics";
import {
  clearLastFilters as clearStoredFilters,
  getLastFilters,
  getSportPreference,
  setLastFilters,
  type StoredFilters,
} from "../lib/storage";
import type { FieldSize, FieldSurface, SearchResult } from "../types/api";

const FILTER_DEBOUNCE_MS = 300;
const LOCATION_DEBOUNCE_MS = 500;
const DEFAULT_RADIUS_KM = 25;

export type FieldSearchFilters = {
  surface: FieldSurface[];
  size: FieldSize[];
  priceMax: number | null;
  sort: SearchSort;
};

export type FieldSearchLocation = {
  text: string;
  lat: number | null;
  lng: number | null;
};

const DEFAULT_FILTERS: FieldSearchFilters = {
  surface: [],
  size: [],
  priceMax: null,
  sort: "distance",
};

const DEFAULT_LOCATION: FieldSearchLocation = {
  text: "",
  lat: null,
  lng: null,
};

export type SetFilter = <K extends keyof FieldSearchFilters>(
  key: K,
  value: FieldSearchFilters[K]
) => void;

export type UseFieldSearchResult = {
  results: SearchResult[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  filters: FieldSearchFilters;
  location: FieldSearchLocation;
  /** Set when the most recent geocode failed; cleared on the next success. */
  locationError: Error | null;
  setFilter: SetFilter;
  clearFilters: () => void;
  setLocation: (text: string) => void;
};

export function useFieldSearch(): UseFieldSearchResult {
  const [filters, setFilters] = useState<FieldSearchFilters>(DEFAULT_FILTERS);
  const [location, setLocationState] = useState<FieldSearchLocation>(DEFAULT_LOCATION);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [locationError, setLocationError] = useState<Error | null>(null);

  // True until persisted filters have been read on mount. Suppresses
  // `search_filtered` analytics during restoration so we don't log a "user
  // applied filters" event on cold start.
  const restoredRef = useRef(false);
  const requestId = useRef(0);

  // ---- Restore persisted state on mount ----------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stored, sportPref] = await Promise.all([
        getLastFilters(),
        getSportPreference(),
      ]);
      if (cancelled) return;
      if (stored) {
        setFilters(stored);
      } else if (sportPref && sportPref.length > 0) {
        // REQ-F1.6: seed from sport preference when no filters have been saved.
        setFilters({ ...DEFAULT_FILTERS, size: sportPref });
      }
      restoredRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Persist filters on every change (after initial restore) -----------
  useEffect(() => {
    if (!restoredRef.current) return;
    void setLastFilters(filters);
  }, [filters]);

  // ---- Debounced geocode for location text -------------------------------
  useEffect(() => {
    if (location.text.trim().length === 0) {
      setLocationError(null);
      return;
    }
    const text = location.text;
    const timer = setTimeout(async () => {
      try {
        const matches = await Location.geocodeAsync(text);
        if (matches.length === 0) {
          setLocationError(new Error(`No matches for "${text}"`));
          return;
        }
        const first = matches[0];
        setLocationError(null);
        setLocationState((prev) =>
          prev.text === text
            ? { ...prev, lat: first.latitude, lng: first.longitude }
            : prev
        );
      } catch (err) {
        setLocationError(err instanceof Error ? err : new Error("Geocoding failed"));
      }
    }, LOCATION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [location.text]);

  // ---- Debounced fetch on filter / coord changes -------------------------
  useEffect(() => {
    if (!restoredRef.current) return;

    const timer = setTimeout(async () => {
      const id = ++requestId.current;
      setIsLoading(true);

      const params = buildSearchParams(filters, location);
      const result: SearchFieldsResult = await searchFields(params);

      // Drop stale responses if a newer request started while in flight.
      if (id !== requestId.current) return;

      if (result.error) {
        setError(result.error);
      } else {
        setResults(result.data ?? []);
        setTotal(result.total);
        setError(null);
      }
      setIsLoading(false);

      track(EVENT_SEARCH_FILTERED, {
        surface: filters.surface,
        size: filters.size,
        price_max: filters.priceMax,
        sort: filters.sort,
        has_location: location.lat !== null && location.lng !== null,
      });
    }, FILTER_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.surface,
    filters.size,
    filters.priceMax,
    filters.sort,
    location.lat,
    location.lng,
    // restoredRef.current isn't reactive — the outer guard re-runs naturally
    // when state changes after restoration completes.
  ]);

  // ---- Mutators ----------------------------------------------------------
  const setFilter: SetFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    void clearStoredFilters();
  }, []);

  const setLocation = useCallback((text: string) => {
    // Reset coords until geocode resolves so the fetch effect doesn't fire
    // against the previous location while the user is still typing.
    setLocationState((prev) => ({ ...prev, text, lat: null, lng: null }));
  }, []);

  return useMemo(
    () => ({
      results,
      total,
      isLoading,
      error,
      filters,
      location,
      locationError,
      setFilter,
      clearFilters,
      setLocation,
    }),
    [
      results,
      total,
      isLoading,
      error,
      filters,
      location,
      locationError,
      setFilter,
      clearFilters,
      setLocation,
    ]
  );
}

/**
 * The /search/fields endpoint currently accepts a single `surface` and a
 * single `size` (see api/search.ts). We model filters as arrays so the UI
 * can offer multi-select via FilterBottomSheet — until the API gains array
 * support, we send the first selected value. Passing none = no filter.
 */
function buildSearchParams(
  filters: FieldSearchFilters,
  location: FieldSearchLocation
): Parameters<typeof searchFields>[0] {
  const params: Parameters<typeof searchFields>[0] = {
    sort: filters.sort,
  };
  if (location.lat !== null && location.lng !== null) {
    params.lat = location.lat;
    params.lng = location.lng;
    params.radius_km = DEFAULT_RADIUS_KM;
  }
  if (filters.surface.length > 0) params.surface = filters.surface[0];
  if (filters.size.length > 0) params.size = filters.size[0];
  if (filters.priceMax !== null) params.price_max = filters.priceMax;
  return params;
}

// Re-export for convenience so the screen doesn't have to import StoredFilters
// from storage.ts to know the shape it gets back.
export type { StoredFilters };
