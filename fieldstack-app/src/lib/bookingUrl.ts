/**
 * Builds the final booking URL for a field, appending date/time/duration
 * query params on platforms that accept them (Playtomic, CourtReserve).
 *
 * Other platforms (Amilia, "none") get the raw `field.booking_url` — adding
 * unrecognized params can break some operators' deep links.
 */

import type { Field } from "../types/api";

export function buildBookingUrl(
  field: Pick<Field, "booking_url" | "booking_platform">,
  date: Date,
  startTime: string,        // "HH:mm" 24h
  durationHours: number
): string | null {
  const base = field.booking_url;
  if (!base) return null;

  if (field.booking_platform === "playtomic" || field.booking_platform === "courtreserve") {
    try {
      const url = new URL(base);
      url.searchParams.set("date", formatDateISO(date));
      url.searchParams.set("start", startTime);
      url.searchParams.set("duration", String(Math.round(durationHours * 60)));
      return url.toString();
    } catch {
      // base wasn't a parseable URL — fall through to the raw string so the
      // user at least gets to the operator's page.
      return base;
    }
  }

  return base;
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
