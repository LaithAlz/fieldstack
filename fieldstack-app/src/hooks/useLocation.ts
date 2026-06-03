/**
 * Resolves the active "browse from" coordinates plus a human label and the
 * permission status. Used by the Venue List location pill and any hook that
 * sorts results by distance.
 *
 * Cold-start order:
 * 1. Read system permission (silent — never prompts).
 * 2. If granted, fetch fresh coords; persist via setLastLocation.
 * 3. If not granted, fall back to last-known then DEFAULT_COORDS.
 *
 * `setManualLocation` lets the Location Picker Sheet override the resolved
 * coords + label without touching permissions.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_COORDS,
  getCurrentCoords,
  getPermissionStatus,
  type Coords,
  type PermissionStatus,
} from "../lib/location";
import { getLastLocation, setLastLocation } from "../lib/storage";

export type LocationState = {
  coords: Coords;
  label: string;
  permissionStatus: PermissionStatus;
  /** True until the initial async resolution completes. */
  loading: boolean;
  /** True when permission was granted but GPS returned null coordinates. */
  coordsFetchFailed: boolean;
};

const LABEL_DOWNTOWN = "Downtown Toronto";
const LABEL_NEARBY = "Near you";

export function useLocation() {
  const [state, setState] = useState<LocationState>({
    coords: DEFAULT_COORDS,
    label: LABEL_DOWNTOWN,
    permissionStatus: "undetermined",
    loading: true,
    coordsFetchFailed: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await getPermissionStatus();
      if (cancelled) return;

      let gpsFailed = false;
      if (status === "granted") {
        const fresh = await getCurrentCoords();
        if (cancelled) return;
        if (fresh) {
          setLastLocation(fresh).catch(() => undefined);
          setState({
            coords: fresh,
            label: LABEL_NEARBY,
            permissionStatus: status,
            loading: false,
            coordsFetchFailed: false,
          });
          return;
        }
        // Permission granted but GPS returned null.
        gpsFailed = true;
      }

      // Permission not granted, or we couldn't fetch — try last known, else
      // fall back to the downtown anchor.
      const last = await getLastLocation();
      if (cancelled) return;
      setState({
        coords: last ?? DEFAULT_COORDS,
        label: last ? LABEL_NEARBY : LABEL_DOWNTOWN,
        permissionStatus: status,
        loading: false,
        coordsFetchFailed: gpsFailed,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setManualLocation = useCallback((coords: Coords, label: string) => {
    setState((prev) => ({ ...prev, coords, label }));
    setLastLocation(coords).catch(() => undefined);
  }, []);

  // Memoize the coords object so callers only get a new reference when the
  // actual lat/lng values change. Without this, every setState (e.g. updating
  // loading → false) produces a new coords object and causes hooks like
  // useVenues to re-run their fetchVenues even though the coordinates haven't
  // moved.
  const coords = useMemo(
    () => state.coords,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.coords.lat, state.coords.lng]
  );

  return { ...state, coords, setManualLocation };
}
