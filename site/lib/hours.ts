/**
 * Venue opening-hours helpers for the site. `venues.hours` is a JSONB blob
 * `{ sun: "HH:MM-HH:MM" | null, ... }` (see apps/api scrape pipeline). Parsing
 * mirrors the app's rules exactly (fieldstack-app/src/lib/venueHours.ts): a
 * range is valid only when open < close <= 24:00, and a midnight close is
 * written "24:00".
 */

export type VenueHours = Record<string, string | null> | null | undefined;

/** Weekday keys as stored (Sunday-indexed to match Date.getDay()). */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

/** Display order: Monday first (how people read a week). */
export const DISPLAY_DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const SCHEMA_DAY: Record<DayKey, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

type Range = { openMin: number; closeMin: number };

export function parseRange(value: string | null | undefined): Range | null {
  if (!value) return null;
  const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(value);
  if (!m) return null;
  const openMin = Number(m[1]) * 60 + Number(m[2]);
  const closeMin = Number(m[3]) * 60 + Number(m[4]);
  if (openMin < 0 || closeMin <= openMin || closeMin > 24 * 60) return null;
  return { openMin, closeMin };
}

/** True when the venue has at least one parseable day. */
export function hasHours(hours: VenueHours): boolean {
  if (!hours || typeof hours !== "object") return false;
  return DAY_KEYS.some((d) => parseRange(hours[d]));
}

function to12h(min: number): string {
  if (min >= 24 * 60) return "12:00 AM"; // midnight close
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "9:00 AM – 12:00 AM" for a stored range, or "Closed" when null/invalid. */
export function formatDay(value: string | null | undefined): string {
  const r = parseRange(value);
  if (!r) return "Closed";
  return `${to12h(r.openMin)} – ${to12h(r.closeMin)}`;
}

/**
 * Open/closed right now for `hours` at time `now`. Returns null when the venue
 * has no usable hours (caller shows nothing). Computed client-side so it stays
 * accurate on a statically-generated page.
 */
export function isOpenNow(hours: VenueHours, now: Date): boolean | null {
  if (!hasHours(hours)) return null;
  const today = DAY_KEYS[now.getDay()];
  const r = parseRange(hours?.[today]);
  if (!r) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= r.openMin && nowMin < r.closeMin;
}

/**
 * schema.org OpeningHoursSpecification entries for the venue JSON-LD. Uses
 * 24h "HH:MM"; a midnight close becomes "23:59" (schema.org has no 24:00).
 */
export function openingHoursSpec(hours: VenueHours): Record<string, string>[] | null {
  if (!hasHours(hours)) return null;
  const out: Record<string, string>[] = [];
  for (const d of DAY_KEYS) {
    const r = parseRange(hours?.[d]);
    if (!r) continue;
    const opens = `${String(Math.floor(r.openMin / 60)).padStart(2, "0")}:${String(r.openMin % 60).padStart(2, "0")}`;
    const closes =
      r.closeMin >= 24 * 60
        ? "23:59"
        : `${String(Math.floor(r.closeMin / 60)).padStart(2, "0")}:${String(r.closeMin % 60).padStart(2, "0")}`;
    out.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: SCHEMA_DAY[d],
      opens,
      closes,
    });
  }
  return out.length ? out : null;
}
