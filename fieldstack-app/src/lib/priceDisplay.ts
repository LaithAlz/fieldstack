/**
 * Single source of truth for how a field's price renders across every card,
 * pin, and detail screen. Before this existed, `price_per_hour === 0` (an
 * explicit FREE signal — see `isFreeVenue`) rendered as "$0/hr" on the venue
 * detail and field detail screens because those call sites checked
 * `price !== null` without ever asking `isFreeVenue`. Routing every render
 * site through this one function means that guard can't drift out of sync
 * again.
 */

import { isFreeVenue } from "./filters";
import type { Field, VenueType } from "../types/api";

export type PriceDisplay =
  | { kind: "free" }
  | { kind: "priced"; amount: number }
  // Priced null but the field still has somewhere to book — the operator
  // just hasn't published a rate (see FieldRow / FieldDetailScreen).
  | { kind: "rates_on_site" }
  // No price and no booking link — nothing honest to show.
  | { kind: "none" };

export function priceDisplayFor(
  venueType: VenueType | null | undefined,
  field: Pick<Field, "price_per_hour" | "booking_url">
): PriceDisplay {
  if (isFreeVenue(venueType, field.price_per_hour)) return { kind: "free" };
  if (field.price_per_hour !== null) {
    return { kind: "priced", amount: field.price_per_hour };
  }
  if (field.booking_url) return { kind: "rates_on_site" };
  return { kind: "none" };
}

export type VenuePriceSummary =
  | { kind: "free" }
  | { kind: "from"; price: number }
  | { kind: "unknown" };

/**
 * Single source of truth for a venue-level price rollup — the number/FREE
 * badge shown on the map pin, the Explore list card, and the saved-venue
 * card. Before this existed, each of those three call sites rolled its own
 * `Math.min` over every field's price, ignoring `booking_url` entirely. That
 * let a venue with an unbookable $0 field and a bookable $50 field show FREE
 * everywhere except the reserve bar (which only ever considers bookable
 * fields, via `reserveField.cheapestBookableField`) — a direct contradiction
 * between what the user saw on the pin/card and what they saw once they
 * tapped in. Routing every venue-level rollup through this one function
 * means the candidate set (and therefore the verdict) can't drift out of
 * sync with the reserve bar's again.
 *
 * Candidate set mirrors `cheapestBookableField`'s view of the venue: fields
 * with a `booking_url` when any exist (an unbookable field can't back what
 * the reserve bar would actually show), else every field (so a venue with no
 * bookable fields at all still gets an honest rollup instead of "unknown").
 */
export function venuePriceSummary(
  fields: readonly Pick<Field, "price_per_hour" | "booking_url">[],
  venueType: VenueType | null | undefined
): VenuePriceSummary {
  const bookable = fields.filter((f) => f.booking_url);
  const candidates = bookable.length > 0 ? bookable : fields;

  const prices = candidates
    .map((f) => f.price_per_hour)
    .filter((p): p is number => p !== null);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;

  if (isFreeVenue(venueType, minPrice)) return { kind: "free" };
  if (minPrice !== null && minPrice > 0) return { kind: "from", price: minPrice };
  return { kind: "unknown" };
}
