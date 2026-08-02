/**
 * Resolves the opening hours to display for a venue.
 *
 * Stored hours (from the scrape pipeline: operator + municipal park bylaw)
 * arrive on the venue itself, so when present we use them directly with no
 * extra request. When a venue has NO stored hours, we ask the API's
 * `/venues/:id/hours` route, which can return live Google Places hours for the
 * paid facilities that have a Google place id (issue #492 option 3).
 *
 * Fully degrading: if that route errors, times out, or doesn't exist yet (an
 * older deployed API), we fall back to the venue's own hours (usually null),
 * so Open-now behaves exactly as before — no regression while the API catches
 * up. Returns the effective hours plus their source for optional labeling.
 */

import { useEffect, useRef, useState } from "react";

import { getVenueHours, type VenueHoursSource } from "../api/venues";
import type { VenueHoursJson } from "../types/api";

/** True when the hours object has at least one non-null weekday entry. */
export function hasUsableHours(hours: VenueHoursJson | null | undefined): boolean {
  if (!hours || typeof hours !== "object") return false;
  return Object.values(hours).some((v) => typeof v === "string" && v.length > 0);
}

export type ResolvedHours = {
  hours: VenueHoursJson | null;
  source: VenueHoursSource;
};

export function useResolvedVenueHours(
  venueId: string,
  storedHours: VenueHoursJson | null | undefined,
  /** False while the venue is still loading — suppresses any request until we
   *  actually know whether stored hours exist. */
  enabled: boolean
): ResolvedHours {
  // Seed synchronously from stored hours so the first render is correct for the
  // common case (a venue that already has hours) with no flash and no request.
  const seeded: ResolvedHours = hasUsableHours(storedHours)
    ? { hours: storedHours ?? null, source: "stored" }
    : { hours: storedHours ?? null, source: "none" };
  const [resolved, setResolved] = useState<ResolvedHours>(seeded);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    if (!enabled) return;

    // Stored hours win — never spend a request when we already have them.
    if (hasUsableHours(storedHours)) {
      setResolved({ hours: storedHours ?? null, source: "stored" });
      return;
    }

    // No stored hours: try the API's hours route (may return Google hours). A
    // stale response (venue changed mid-flight) is dropped by the id guard —
    // the next effect run bumps requestId, same pattern as useVenue.
    setResolved({ hours: storedHours ?? null, source: "none" });
    (async () => {
      const { data, error } = await getVenueHours(venueId);
      if (id !== requestId.current) return; // stale / venue changed
      if (error || !data || !hasUsableHours(data.hours)) return; // keep the fallback
      setResolved({ hours: data.hours, source: data.source });
    })();
  }, [venueId, storedHours, enabled]);

  return resolved;
}
