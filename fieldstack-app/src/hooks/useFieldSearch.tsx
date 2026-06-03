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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { searchFields, type SearchFieldsResult, type SearchSort } from "../api/search";
import { useLocation } from "./useLocation";
import { EVENT_SEARCH_FILTERED, track } from "../lib/analytics";
import type { Coords } from "../lib/location";
import {
  clearLastFilters as clearStoredFilters,
  getLastFilters,
  setLastFilters,
  type StoredFilters,
} from "../lib/storage";
import type { FieldSize, FieldSurface, SearchResult, VenueType } from "../types/api";

const FILTER_DEBOUNCE_MS = 300;
const LOCATION_DEBOUNCE_MS = 500;
// 75km covers all three current target cities (Oakville/Hamilton/Milton)
// from any default anchor in the GTA. Tighten when scope expands and
// distances become user-meaningful again.
const DEFAULT_RADIUS_KM = 75;

export type FieldSearchFilters = {
  surface: FieldSurface[];
  size: FieldSize[];
  venueType: VenueType[];
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
  venueType: [],
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
  // Functional form mirrors React's useState — required when callers chain
  // updates faster than React can re-render (e.g. rapid empty-state chip taps).
  value: FieldSearchFilters[K] | ((prev: FieldSearchFilters[K]) => FieldSearchFilters[K])
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
  /**
   * Update the location text. The 500ms geocode runs unless explicit `coords`
   * are passed — used by the screen to seed an initial location from
   * `useLocation` without forcing a redundant geocode round-trip.
   */
  setLocation: (text: string, coords?: Coords) => void;
};

// ---------------------------------------------------------------------------
// Provider + context. Hoisted from a per-call hook so FieldSearchScreen and
// MapViewScreen share one set of filters / results / debounced fetches.
// Without this both screens would maintain independent state and double the
// network traffic, and a filter set on Map wouldn't apply when nav-back to
// the list.
// ---------------------------------------------------------------------------

const FieldSearchContext = createContext<UseFieldSearchResult | null>(null);

export function FieldSearchProvider({ children }: { children: ReactNode }) {
  const value = useFieldSearchState();
  const {
    coords: userCoords,
    label: userLabel,
    loading: locationLoading,
  } = useLocation();

  // Seed the search hook's location from useLocation as soon as it resolves.
  // Previously this lived on FieldSearchScreen, which meant any screen that
  // mounted MapView directly (without first passing through the list) would
  // see empty results — the search just never fired. Hoisting here covers
  // every consumer of useFieldSearch().
  //
  // `userCoords` may be null when permission is denied; we still seed so the
  // search can fall back to text geocoding or the default downtown area.
  const seededRef = useRef(false);
  const seedLocation = value.setLocation;
  const locationTextLength = value.location.text.length;
  useEffect(() => {
    if (locationLoading || seededRef.current) return;
    if (locationTextLength === 0) {
      seedLocation(userLabel, userCoords);
    }
    seededRef.current = true;
  }, [locationLoading, userLabel, userCoords, locationTextLength, seedLocation]);

  return (
    <FieldSearchContext.Provider value={value}>
      {children}
    </FieldSearchContext.Provider>
  );
}

export function useFieldSearch(): UseFieldSearchResult {
  const ctx = useContext(FieldSearchContext);
  if (!ctx) {
    throw new Error(
      "useFieldSearch must be used inside <FieldSearchProvider>"
    );
  }
  return ctx;
}

function useFieldSearchState(): UseFieldSearchResult {
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
  /**
   * When `setLocation` is called with explicit coords, the next geocode
   * effect run for that text should be skipped — the caller already knows
   * the coordinates. Cleared after the matching run consumes it.
   */
  const skipGeocodeForRef = useRef<string | null>(null);

  // ---- Restore persisted state on mount ----------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getLastFilters();
      if (cancelled) return;
      if (!restoredRef.current) {
        if (stored) setFilters(stored);
      }
      restoredRef.current = true;
      // The fetch effect guards on restoredRef.current, but refs aren't
      // reactive so the effect won't re-run here. If the stored filters
      // equal the current state (no setFilters call above) the fetch effect
      // deps haven't changed either, so isLoading would stay true forever.
      // Clear it now; the fetch effect will set it back to true when a real
      // fetch is triggered.
      if (requestId.current === 0) setIsLoading(false);
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
    if (skipGeocodeForRef.current === text) {
      skipGeocodeForRef.current = null;
      return;
    }
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

      if (params) {
        track(EVENT_SEARCH_FILTERED, {
          ...params,
          has_location: params.lat !== undefined,
        });
      }
    }, FILTER_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.surface,
    filters.size,
    filters.venueType,
    filters.priceMax,
    filters.sort,
    location.lat,
    location.lng,
    // restoredRef.current isn't reactive — the outer guard re-runs naturally
    // when state changes after restoration completes.
  ]);

  // ---- Mutators ----------------------------------------------------------
  const setFilter: SetFilter = useCallback((key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: typeof value === "function" ? (value as (p: typeof prev[typeof key]) => typeof prev[typeof key])(prev[key]) : value,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    void clearStoredFilters();
  }, []);

  const setLocation = useCallback((text: string, coords?: Coords) => {
    if (coords) {
      skipGeocodeForRef.current = text;
      setLocationError(null);
      setLocationState({ text, lat: coords.lat, lng: coords.lng });
      return;
    }
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
 * Build the /search/fields query. Surface and size are multi-select on the
 * UI side, and the API + SQL function now both accept arrays — see PR 17.
 * Empty arrays are omitted entirely so the server's filter short-circuits.
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
  if (filters.surface.length > 0) params.surface = filters.surface;
  if (filters.size.length > 0) params.size = filters.size;
  if (filters.venueType.length > 0) params.venue_type = filters.venueType;
  if (filters.priceMax !== null) params.price_max = filters.priceMax;
  return params;
}

// Re-export for convenience so the screen doesn't have to import StoredFilters
// from storage.ts to know the shape it gets back.
export type { StoredFilters };
