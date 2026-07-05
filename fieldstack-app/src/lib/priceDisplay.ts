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
