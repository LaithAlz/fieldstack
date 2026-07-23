/**
 * Municipal park bylaw hours (issue #492 option 2).
 *
 * Public parks in the GTA operate under a citywide bylaw window, not
 * per-venue posted hours. This encodes that window EXPLICITLY as a cited
 * policy default, keyed on the source city, rather than silently guessing.
 * The runner applies it only to `public_park` venues that have no adapter or
 * operator hours (see resolveVenueHours), and it is the last fallback before
 * the app's own default window — so real observed hours always win.
 *
 * Honesty notes:
 *   - This is a POLICY default (the legal window a park may be used), not
 *     observed per-venue data. It is strictly more accurate than the app's
 *     blanket 06:00-23:00 fallback it replaces for these venues.
 *   - It is keyed by the municipal source prefix (toronto/mississauga/
 *     brampton), which is exactly the set of venues the bylaw governs. OSM
 *     parks in other cities are not covered here and keep the app default
 *     until their city's bylaw is added.
 *   - A midnight close is written "24:00" (the format parseRange in
 *     fieldstack-app/src/lib/venueHours.ts requires; "00:00" would invert).
 *
 * Follow-up (not in scope here): the app currently renders bylaw hours the
 * same as operator hours. Labeling them distinctly ("City park hours") is a
 * UI refinement tracked separately; it does not affect Open-now correctness.
 */

import type { ScrapedVenue } from "../types.js";

type WeeklyHours = Record<string, string>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Build a 7-day block with the same window every day. */
function everyDay(range: string): WeeklyHours {
  return Object.fromEntries(DAY_KEYS.map((d) => [d, range]));
}

/**
 * City park bylaw windows, by the venue's source prefix. Each cites the
 * governing bylaw; re-verify before changing.
 *
 *   toronto     — Toronto Municipal Code Ch. 608 (Parks): open 5:30 a.m. to
 *                 12:00 a.m. (no person in a park 12:01 a.m.-5:30 a.m.).
 *                 toronto.ca/legdocs/municode/1184_608.pdf
 *   mississauga — Parks By-law 0197-2020: open dawn to 11 p.m. (no loitering
 *                 11:01 p.m.-dawn). "Dawn" is approximated as 06:00, matching
 *                 the app's own default open. mississauga.ca Parks By-law.
 *   brampton    — Park Lands By-law 161-83: no person in parkland 11:00 p.m.
 *                 to 7:00 a.m. brampton.ca/en/City-Hall/Bylaws (Parkland.PDF)
 */
const PARK_BYLAW_HOURS: Record<string, WeeklyHours> = {
  toronto: everyDay("05:30-24:00"),
  mississauga: everyDay("06:00-23:00"),
  brampton: everyDay("07:00-23:00"),
};

/**
 * The bylaw hours for a scraped venue, or null when the policy doesn't apply
 * (not a public park, or a source city with no encoded bylaw). Pure — no
 * network or DB.
 */
export function resolveParkHours(v: ScrapedVenue): WeeklyHours | null {
  if (v.venueType !== "public_park") return null;
  const prefix = v.externalId.split(":")[0] ?? "";
  return PARK_BYLAW_HOURS[prefix] ?? null;
}

export { PARK_BYLAW_HOURS };
