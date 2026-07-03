/**
 * One-tap "Book on operator's site" redirect.
 *
 * Discover-first: we are not a booking transactor, so this just opens the
 * operator's URL in a browser. No date/time picker, no held slot. The dated
 * `buildBookingUrl` form (with Playtomic/CourtReserve query params) stays
 * alive for any future transactional path; this helper uses the raw URL
 * because we don't have a slot to thread through.
 *
 * Pipeline preserved from the pre-#138 sheet flow:
 *   - light haptic
 *   - track `booking_redirect_confirmed` analytics
 *   - Linking.openURL, with clipboard-copy fallback on failure
 *   - graceful "no booking link yet" toast when the field has no URL
 *
 * Dropped vs the prior sheet flow:
 *   - recordAttempt → user_booking_history requires non-null slot_date /
 *     start_time / duration (see migration 004); without a picked slot we
 *     can't insert a valid row. Bring this back if we re-introduce slot
 *     selection.
 *   - scheduleBookingReminder + promptAddToCalendarOnReturn → both need
 *     a startDate, same reason.
 */

import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";

import { EVENT_BOOKING_REDIRECT_CONFIRMED, track } from "./analytics";
import { lightImpact } from "./haptics";
import { recordReviewValueMoment } from "./reviewPrompt";
import type { Field, Venue } from "../types/api";

type ToastApi = {
  show: (msg: string, opts?: { type?: "success" | "error" | "info" }) => void;
};

export async function openOperatorBooking(params: {
  field: Pick<Field, "id" | "booking_url">;
  venue: Pick<Venue, "id" | "operator_id">;
  toast: ToastApi;
}): Promise<void> {
  const { field, venue, toast } = params;

  if (!field.booking_url) {
    toast.show("This field doesn't have a booking link yet.", { type: "error" });
    return;
  }

  lightImpact();
  track(EVENT_BOOKING_REDIRECT_CONFIRMED, {
    field_id: field.id,
    venue_id: venue.id,
    operator_id: venue.operator_id,
  });

  const url = field.booking_url;
  try {
    await Linking.openURL(url);
    // A booking redirect is the strongest value signal we have — weight 2
    // reaches the review-prompt threshold alone, so the "back in Onside"
    // foreground after booking can ask (#430).
    void recordReviewValueMoment(2);
  } catch {
    // Auto-copy on failure so the user isn't dead-ended.
    try {
      await Clipboard.setStringAsync(url);
      toast.show("Couldn't open the booking page. Link copied to clipboard.", {
        type: "error",
      });
    } catch {
      toast.show("Couldn't open the booking page.", { type: "error" });
    }
  }
}
