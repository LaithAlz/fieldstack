/**
 * Deep-link tiering (docs/scraping.md §3.2/§3.3): turns an operator's
 * `integration_type` + platform id (data/operators.yaml) into a public
 * booking-portal URL, with no partnership/credentials required. Pure and
 * unit-tested — no network calls here, just URL templates:
 *
 *   - CourtReserve: app.courtreserve.com/Online/Portal/Index/{OrgId}
 *   - Amilia:       app.amilia.com/store/en/{rewriteUrl}/shop/programs
 *   - Playtomic:    playtomic.com/clubs/{slug}
 */

import type { BookingPlatform, ScrapedField } from "../types.js";
import type { Operator } from "./registry.js";

/**
 * Public booking-portal URL for an operator's configured platform, or
 * null when the operator has no (complete) platform config.
 */
export function platformBookingUrl(op: Operator): string | null {
  switch (op.integrationType) {
    case "courtreserve":
      return op.courtreserveOrgId != null
        ? `https://app.courtreserve.com/Online/Portal/Index/${encodeURIComponent(String(op.courtreserveOrgId))}`
        : null;
    case "amilia":
      return op.amiliaRewriteUrl
        ? `https://app.amilia.com/store/en/${encodeURIComponent(op.amiliaRewriteUrl)}/shop/programs`
        : null;
    case "playtomic":
      return op.playtomicSlug
        ? `https://playtomic.com/clubs/${encodeURIComponent(op.playtomicSlug)}`
        : null;
    case "none":
      return null;
  }
}

/**
 * Booking url + platform for a field under a matched operator.
 * Precedence: the field's own values win (a platform adapter like
 * playtomic.ts knows better); else the operator's platform link; else
 * the operator's booking_url/website with platform 'none'. The platform
 * tag is only applied when the platform URL is what we actually used —
 * an inherited plain booking_url/website never gets tagged with the
 * operator's integration_type.
 */
export function resolveFieldBooking(
  field: ScrapedField,
  op: Operator | null
): { bookingUrl: string | null; bookingPlatform: BookingPlatform } {
  const platformUrl = op ? platformBookingUrl(op) : null;
  const bookingUrl =
    field.bookingUrl ?? platformUrl ?? op?.bookingUrl ?? op?.website ?? null;
  const bookingPlatform: BookingPlatform =
    field.bookingPlatform ??
    (bookingUrl !== null && bookingUrl === platformUrl
      ? (op as Operator).integrationType
      : "none");
  return { bookingUrl, bookingPlatform };
}
