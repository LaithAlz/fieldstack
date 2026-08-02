/**
 * Normalize Google Places `regularOpeningHours` into the same weekly shape the
 * rest of Onside uses: `{ sun: "HH:MM-HH:MM" | null, ... }` (see the scrape
 * pipeline and fieldstack-app/src/lib/venueHours.ts). A midnight close is
 * written "24:00", matching the app's parser.
 *
 * This is the DISPLAY-TIME path for Google hours (issue #492 option 3): Places
 * *content* (hours) may not be stored durably per Google's terms, so callers
 * fetch it live and cache it briefly — never write it to a durable row.
 *
 * Pure and unit-tested; no network here. Handles the common cases (one period
 * per day, 24/7, and a close that crosses midnight); multi-period days collapse
 * to the widest open..close span, which is fine for a display hint.
 */

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type GPoint = { day?: number; hour?: number; minute?: number };
type GPeriod = { open?: GPoint; close?: GPoint };
export type GoogleRegularOpeningHours = { periods?: GPeriod[] } | null | undefined;

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function normalizeGoogleHours(
  roh: GoogleRegularOpeningHours
): Record<string, string | null> | null {
  const periods = roh?.periods;
  if (!periods || periods.length === 0) return null;

  // Google's 24/7 convention: a single period that opens day 0 at 00:00 with no
  // close means always open.
  if (periods.length === 1) {
    const p = periods[0];
    if (
      p?.open &&
      !p.close &&
      (p.open.day ?? 0) === 0 &&
      (p.open.hour ?? 0) === 0 &&
      (p.open.minute ?? 0) === 0
    ) {
      return Object.fromEntries(DAY_KEYS.map((d) => [d, "00:00-24:00"]));
    }
  }

  const spans: Record<string, { open: number; close: number } | null> = {};
  for (const d of DAY_KEYS) spans[d] = null;

  for (const p of periods) {
    if (!p.open || typeof p.open.day !== "number") continue;
    const od = p.open.day;
    if (od < 0 || od > 6) continue;
    const openMin = (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0);

    let closeMin: number;
    if (!p.close || typeof p.close.day !== "number") {
      closeMin = 24 * 60; // open with no same-record close: treat as until midnight
    } else if (p.close.day === od) {
      closeMin = (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0);
    } else {
      closeMin = 24 * 60; // crosses midnight: cap the open day at midnight (display approximation)
    }

    if (!(openMin >= 0 && closeMin > openMin && closeMin <= 24 * 60)) continue;

    const key = DAY_KEYS[od];
    if (!key) continue;
    const existing = spans[key];
    spans[key] = existing
      ? { open: Math.min(existing.open, openMin), close: Math.max(existing.close, closeMin) }
      : { open: openMin, close: closeMin };
  }

  const out: Record<string, string | null> = {};
  let any = false;
  for (const d of DAY_KEYS) {
    const s = spans[d];
    if (s) {
      out[d] = `${hhmm(s.open)}-${hhmm(s.close)}`;
      any = true;
    } else {
      out[d] = null;
    }
  }
  return any ? out : null;
}
