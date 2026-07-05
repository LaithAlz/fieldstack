/**
 * Operating-hours hints for a venue. The DB column (migration 010) stores
 * a JSONB blob like `{ mon: "06:00-23:00", tue: null, ... }`; this module
 * parses that into per-weekday minute ranges callers can compare slot
 * start times against.
 *
 * Defensive throughout — the field can be missing entirely, partially
 * filled, malformed, or set to something the scraper guessed wrong. In any
 * of those cases callers should fall back to the picker's 6 AM–11 PM
 * default (i.e. "no constraint").
 */

import type { VenueHoursJson } from "../types/api";

export type DayHours = {
  /** Minutes-of-day when the venue opens (00:00 = 0). */
  openMinutes: number;
  /** Minutes-of-day when the venue closes (last available start time). */
  closeMinutes: number;
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Returns the open/close minutes for the venue on the given date, or null
 * when:
 *   - `hours` is missing or not an object
 *   - the weekday entry is missing or explicitly null
 *   - the value doesn't parse as "HH:mm-HH:mm"
 *   - the parsed open >= close (malformed range)
 *
 * Null means "no constraint" — picker falls back to its default window.
 */
export function getDayHours(
  hours: VenueHoursJson | null | undefined,
  date: Date
): DayHours | null {
  if (!hours || typeof hours !== "object") return null;
  const weekday = WEEKDAYS[date.getDay()];
  const raw = hours[weekday];
  if (!raw || typeof raw !== "string") return null;
  return parseRange(raw);
}

// Mirrors the picker's own "no constraint" fallback (see module docstring)
// so a venue with missing/malformed hours data reads as open during the
// typical operating window rather than being silently excluded.
const DEFAULT_OPEN_MINUTES = 6 * 60; // 06:00
const DEFAULT_CLOSE_MINUTES = 23 * 60; // 23:00

/**
 * True when `now` falls inside the venue's open/close window for its
 * weekday. Used by Explore's "Open now" chip.
 *
 * When `getDayHours` can't determine a real window (missing, malformed, or
 * explicitly-closed-today data), this falls back to the same 6 AM–11 PM
 * default the picker uses for "no constraint" — i.e. it assumes the venue
 * is open rather than excluding it for a data gap.
 */
export function isOpenNow(
  hours: VenueHoursJson | null | undefined,
  now: Date = new Date()
): boolean {
  const day = getDayHours(hours, now) ?? {
    openMinutes: DEFAULT_OPEN_MINUTES,
    closeMinutes: DEFAULT_CLOSE_MINUTES,
  };
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return minutesNow >= day.openMinutes && minutesNow < day.closeMinutes;
}

export type OpenStatus = {
  /** True when the venue is inside today's operating window right now. */
  open: boolean;
  /** "Open now" or "Closed". */
  statusLabel: string;
  /** "closes 23:00" or "opens 9:00". */
  timeLabel: string;
};

/**
 * Human status line for the venue-detail "Open now · closes 23:00" /
 * "Closed · opens 9:00" row.
 *
 * Unlike `isOpenNow` — which assumes the picker's 6 AM–11 PM default when
 * today's hours are missing, because Explore's chip needs a yes/no answer
 * either way — this returns null in that case. The detail screen hides the
 * whole line rather than asserting a schedule we don't actually have.
 */
export function openStatus(
  hours: VenueHoursJson | null | undefined,
  now: Date = new Date()
): OpenStatus | null {
  const day = getDayHours(hours, now);
  if (!day) return null;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const isOpen = minutesNow >= day.openMinutes && minutesNow < day.closeMinutes;
  return isOpen
    ? { open: true, statusLabel: "Open now", timeLabel: `closes ${formatClockLabel(day.closeMinutes)}` }
    : { open: false, statusLabel: "Closed", timeLabel: `opens ${formatClockLabel(day.openMinutes)}` };
}

function formatClockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function parseRange(s: string): DayHours | null {
  // Match "HH:mm-HH:mm". Be lenient about surrounding whitespace; reject
  // anything else so a scraper bug doesn't silently grey out the whole day.
  const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(s);
  if (!m) return null;
  const openMinutes = Number(m[1]) * 60 + Number(m[2]);
  const closeMinutes = Number(m[3]) * 60 + Number(m[4]);
  if (
    !Number.isFinite(openMinutes) ||
    !Number.isFinite(closeMinutes) ||
    openMinutes < 0 ||
    closeMinutes <= openMinutes ||
    closeMinutes > 24 * 60
  ) {
    return null;
  }
  return { openMinutes, closeMinutes };
}
