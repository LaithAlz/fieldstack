/**
 * Booking-requests data layer — mirrors lib/reviews.ts exactly: goes direct
 * to Supabase from the client because RLS already enforces the right access
 * rules (insert own, select own, cancel-only update own; see
 * supabase/migrations/025_booking_requests.sql). No operator-side surface
 * yet — that lands with the operator dashboard phase.
 *
 * Gated end-to-end behind the `in_app_booking` feature flag
 * (lib/featureFlags.ts); this module itself has no flag check since it's
 * only ever called from already-gated call sites.
 */

import { supabase } from "./supabase";

export type BookingRequestStatus = "pending" | "confirmed" | "declined" | "cancelled";

export type BookingRequest = {
  id: string;
  userId: string;
  fieldId: string;
  venueId: string;
  /** ISO YYYY-MM-DD. */
  requestedDate: string;
  /** "HH:mm" 24h. */
  startTime: string;
  durationHours: number;
  /** Optional message to the operator. */
  note: string | null;
  status: BookingRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type BookingRequestWithVenue = BookingRequest & {
  venue: { id: string; name: string };
  field: { id: string; name: string };
};

const SELECT_COLUMNS =
  "id, user_id, field_id, venue_id, requested_date, start_time, duration_hours, note, status, created_at, updated_at";

/**
 * Shapes the Supabase insert payload from raw caller inputs — trimming an
 * empty/whitespace-only note down to `null` so the DB never stores an empty
 * string. Pulled out as a pure function (no supabase import) so this bit of
 * logic is unit-testable without a network mock.
 */
export function buildBookingRequestInsert(input: {
  userId: string;
  fieldId: string;
  venueId: string;
  requestedDate: string;
  startTime: string;
  durationHours: number;
  note?: string | null;
}): {
  user_id: string;
  field_id: string;
  venue_id: string;
  requested_date: string;
  start_time: string;
  duration_hours: number;
  note: string | null;
} {
  const trimmedNote = input.note?.trim() ?? "";
  return {
    user_id: input.userId,
    field_id: input.fieldId,
    venue_id: input.venueId,
    requested_date: input.requestedDate,
    start_time: input.startTime,
    duration_hours: input.durationHours,
    note: trimmedNote.length > 0 ? trimmedNote : null,
  };
}

export async function insertBookingRequest(input: {
  userId: string;
  fieldId: string;
  venueId: string;
  requestedDate: string;
  startTime: string;
  durationHours: number;
  note?: string | null;
}): Promise<{ data: BookingRequest | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("booking_requests")
    .insert(buildBookingRequestInsert(input))
    .select(SELECT_COLUMNS)
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: mapBookingRequest(data), error: null };
}

/**
 * All booking requests filed by the given user, joined with each request's
 * venue + field name so the Profile list doesn't need a round trip per row.
 * Sorted most-recent first, mirroring listMyReviews.
 */
export async function listMyBookingRequests(
  userId: string
): Promise<{ data: BookingRequestWithVenue[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("booking_requests")
    .select(`${SELECT_COLUMNS}, venue:venues(id, name), field:fields(id, name)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { data: null, error: new Error(error.message) };
  // Same FK-join widening as listMyReviews — supabase-js types a
  // to-one join conservatively as an array; the actual shape is a single
  // object since field_id/venue_id are each a single FK.
  const rows = (data ?? []) as unknown as (BookingRequestRow & {
    venue: { id: string; name: string } | null;
    field: { id: string; name: string } | null;
  })[];
  // Drop rows whose venue/field join is null (deleted venue/field) rather
  // than rendering an "[unknown]" row.
  const mapped: BookingRequestWithVenue[] = rows
    .filter(
      (r): r is BookingRequestRow & { venue: { id: string; name: string }; field: { id: string; name: string } } =>
        r.venue !== null && r.field !== null
    )
    .map((r) => ({ ...mapBookingRequest(r), venue: r.venue, field: r.field }));
  return { data: mapped, error: null };
}

/**
 * Cancels a pending request. RLS restricts this to the caller's own rows
 * still in 'pending' status, and to the 'cancelled' transition only — a user
 * can never self-confirm or self-decline a request through this call.
 */
export async function cancelBookingRequest(
  requestId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("booking_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

// ---------------------------------------------------------------------------

type BookingRequestRow = {
  id: string;
  user_id: string;
  field_id: string;
  venue_id: string;
  requested_date: string;
  start_time: string;
  duration_hours: number;
  note: string | null;
  status: BookingRequestStatus;
  created_at: string;
  updated_at: string;
};

function mapBookingRequest(row: BookingRequestRow): BookingRequest {
  return {
    id: row.id,
    userId: row.user_id,
    fieldId: row.field_id,
    venueId: row.venue_id,
    requestedDate: row.requested_date,
    startTime: row.start_time,
    durationHours: Number(row.duration_hours),
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
