/**
 * Mocked availability heuristic. Returns 'busy' for slots that are typically
 * hard to book (weekend evenings, weekday after-work peak), and 'open' for
 * everything else. Synthetic noise keyed on venueId means a given venue's
 * pattern is consistent across sessions without being identical to every
 * other venue.
 *
 * This is *not* connected to a real operator availability source. The
 * picker treats it as a heuristic hint, never a hard block — every chip
 * stays tappable, and the booking sheet's existing "Subject to availability"
 * subtext makes clear the operator's site is the source of truth.
 *
 * Replacing this with a real per-venue data source is a backend integration:
 * swap `mockedAvailability` for a function that hits an availability API and
 * returns the same enum. Callers stay unchanged.
 */

export type AvailabilityBucket = "open" | "busy";

export function mockedAvailability(
  venueId: string,
  date: Date,
  startTime: string
): AvailabilityBucket {
  const [h] = startTime.split(":").map(Number);
  if (Number.isNaN(h)) return "open";
  // Intentionally local time: callers build `date` via local-tz helpers in
  // DateTimeRangePicker, so "Friday evening" means Friday in the user's tz.
  const dow = date.getDay(); // 0 = Sunday, 6 = Saturday

  // Friday + Saturday 6 PM – 10 PM: peak demand everywhere.
  if ((dow === 5 || dow === 6) && h >= 18 && h <= 22) return "busy";

  // Weekday after-work (Mon-Thu, 5 PM – 8 PM): mixed; venue-specific noise.
  if (dow >= 1 && dow <= 4 && h >= 17 && h <= 20) {
    return hash(`${venueId}-${dow}-${h}`) % 2 === 0 ? "busy" : "open";
  }

  // Sunday evenings 6 PM – 9 PM: lighter peak; about 1 in 3 venues full.
  if (dow === 0 && h >= 18 && h <= 21) {
    return hash(`${venueId}-${dow}-${h}`) % 3 === 0 ? "busy" : "open";
  }

  return "open";
}

/** Cheap, deterministic string hash. djb2-ish, non-crypto. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
