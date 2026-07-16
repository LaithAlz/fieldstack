/**
 * One-tap "Book on operator's site" redirect.
 *
 * Discover-first: we are not a booking transactor, so this just opens the
 * operator's URL in a browser — no held slot, no confirmation round-trip.
 * When the caller has a preferred slot set, though, we thread it through:
 *   - `buildBookingUrl` appends date/start/duration query params for
 *     platforms that accept them (Playtomic, CourtReserve); other platforms
 *     get the raw URL unchanged.
 *   - `record()` logs the attempt with the *real* slot, un-deadening
 *     Profile's "Recent bookings" and VenueCard's "BOOKED RECENTLY".
 *   - `scheduleBookingReminder` fires a local notification 1h before the
 *     slot starts (just-in-time permission — see notifications.ts header).
 *
 * Without a slot, behavior is unchanged from the pre-slot-picker version:
 * the raw `booking_url` opens as-is, and record() still logs *that* a
 * booking happened (today's date, null start_time/duration — see
 * bookingHistory.tsx) so recency badges still work, but no reminder is
 * scheduled since there's no start time to count back from.
 *
 * Pipeline preserved from the pre-#138 sheet flow:
 *   - light haptic
 *   - track `booking_redirect_confirmed` analytics
 *   - Linking.openURL, with clipboard-copy fallback on failure
 *   - graceful "no booking link yet" toast when the field has no URL
 */

import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";

import { EVENT_BOOKING_REDIRECT_CONFIRMED, track } from "./analytics";
import type { BookingAttempt } from "./bookingHistory";
import { buildBookingUrl } from "./bookingUrl";
import { isHttpUrl } from "./openExternalUrl";
import { lightImpact } from "./haptics";
import { scheduleBookingReminder } from "./notifications";
import { preferredSlotDate, type PreferredSlot } from "./preferredSlot";
import { recordReviewValueMoment } from "./reviewPrompt";
import type { Field, Venue } from "../types/api";

type ToastApi = {
  show: (msg: string, opts?: { type?: "success" | "error" | "info" }) => void;
};

export async function openOperatorBooking(params: {
  field: Pick<Field, "id" | "booking_url" | "booking_platform">;
  venue: Pick<Venue, "id" | "operator_id" | "name">;
  toast: ToastApi;
  /** The user's preferred slot, when one is set. Absent → legacy raw-URL path. */
  slot?: PreferredSlot | null;
  /** Caller passes `useBookingHistory().record` — this module isn't a component. */
  record: (attempt: Omit<BookingAttempt, "attemptedAt" | "id">) => Promise<void>;
}): Promise<void> {
  const { field, venue, toast, slot = null, record } = params;

  if (!field.booking_url) {
    toast.show("This field doesn't have a booking link yet.", { type: "error" });
    return;
  }
  // Untrusted scraped URL: never hand a non-http(s) scheme to openURL.
  if (!isHttpUrl(field.booking_url)) {
    toast.show("This field doesn't have a valid booking link yet.", { type: "error" });
    return;
  }
  const bookingUrl = field.booking_url;

  lightImpact();
  track(EVENT_BOOKING_REDIRECT_CONFIRMED, {
    field_id: field.id,
    venue_id: venue.id,
    operator_id: venue.operator_id,
  });

  const url = slot
    ? (buildBookingUrl(field, preferredSlotDate(slot), slot.startTime, slot.duration) ?? bookingUrl)
    : bookingUrl;

  try {
    await Linking.openURL(url);
    // A booking redirect is the strongest value signal we have — weight 2
    // reaches the review-prompt threshold alone, so the "back in Onside"
    // foreground after booking can ask (#430).
    void recordReviewValueMoment(2);

    void record({
      fieldId: field.id,
      venueId: venue.id,
      date: slot ? slot.date : todayIsoDate(),
      startTime: slot ? slot.startTime : null,
      duration: slot ? slot.duration : null,
    });

    if (slot) {
      void scheduleBookingReminder({
        venueName: venue.name,
        startDate: slotStartDate(slot),
      });
    }
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

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Combines a preferred slot's date + "HH:mm" start time into one Date. */
function slotStartDate(slot: PreferredSlot): Date {
  const date = preferredSlotDate(slot);
  const [h, m] = slot.startTime.split(":").map(Number);
  date.setHours(h, m, 0, 0);
  return date;
}
