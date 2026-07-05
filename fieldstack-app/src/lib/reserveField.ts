/**
 * Picks which field a multi-field venue's sticky reserve bar represents.
 *
 * Only fields with a `booking_url` are "bookable" — a field with no way to
 * book it can't anchor the bar's price/Book action, so it's excluded outright
 * regardless of price. Among bookable fields, the cheapest wins: an unpriced
 * ("rates on site") field never displaces a field with a known price, since
 * we don't actually know whether it's cheaper — but the first bookable field
 * seeds the pick so a venue whose only bookable fields are all unpriced still
 * lands on one of them instead of null. Ties keep catalog order.
 */

import type { Field } from "../types/api";

// Generic (rather than fixed to `Field`) so callers keep the full field type
// on the result — VenueDetailScreen needs `.id`/`.name` off the winner to
// book it and show it in the field-picker sheet, not just the two props this
// function reads.
export function cheapestBookableField<
  F extends Pick<Field, "price_per_hour" | "booking_url">
>(fields: readonly F[]): F | null {
  let best: F | null = null;
  for (const field of fields) {
    if (!field.booking_url) continue;
    if (best === null) {
      best = field;
      continue;
    }
    if (field.price_per_hour === null) continue;
    if (best.price_per_hour === null || field.price_per_hour < best.price_per_hour) {
      best = field;
    }
  }
  return best;
}
