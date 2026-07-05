import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { EVENT_BOOKING_REQUEST_SUBMITTED, track } from "../lib/analytics";
import { insertBookingRequest } from "../lib/bookingRequests";
import { formatSlotRange } from "../lib/datetime";
import { preferredSlotDate, type PreferredSlot } from "../lib/preferredSlot";
import { priceDisplayFor } from "../lib/priceDisplay";
import { borderRadius, fontFamily, fontSize, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Field, Venue } from "../types/api";

import { Button } from "./Button";
import { defaultDateTimeSelections } from "./DateTimeRangePicker";
import { FreeBadge } from "./FreeBadge";
import { Text } from "./Text";

const MAX_NOTE = 500;

type BookingRequestSheetProps = {
  venue: Pick<Venue, "id" | "name" | "venue_type">;
  /** Null before the caller has picked a field (e.g. venue with >1 bookable field). */
  field: Pick<Field, "id" | "name" | "price_per_hour" | "booking_url"> | null;
  /** The app-wide preferred slot. Null falls back to the same "next available slot" default WhenPickerSheet opens on. */
  slot: PreferredSlot | null;
  /** Null when, somehow, this opened for a guest — submit stays disabled defensively (callers gate presenting on sign-in already). */
  userId: string | null;
  /** Opens the screen's existing WhenPickerSheet (with venue-hours clamping already wired there). */
  onEditSlot: () => void;
  /** "Book on operator's site instead" — the existing redirect. Never traps the user here. */
  onBookOnOperatorSite: () => void;
};

/**
 * The in-app booking request flow's sheet (#in_app_booking flag). Shows the
 * venue/field and the slot to request (preferred slot pre-filled; tap
 * "Change" to edit via the screen's existing WhenPickerSheet), an optional
 * note to the operator, and a price line. Submitting inserts a row via
 * lib/bookingRequests.ts (same direct-to-Supabase pattern as reviews) and
 * shows a success state in place rather than dismissing immediately, so the
 * "usually replies within a day" expectation actually gets read.
 *
 * The secondary action always stays available — a user who'd rather just
 * use the operator's own site never gets stuck here.
 */
export const BookingRequestSheet = forwardRef<BottomSheetModal, BookingRequestSheetProps>(
  function BookingRequestSheet(
    { venue, field, slot, userId, onEditSlot, onBookOnOperatorSite },
    ref
  ) {
    const colors = useTheme();
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [phase, setPhase] = useState<"form" | "success">("form");

    // Same "land on something tappable" default as WhenPickerSheet, for the
    // (rare) case a user opens this before ever setting a preferred slot.
    const defaults = useMemo(() => defaultDateTimeSelections(), []);
    const effectiveSlot: PreferredSlot = slot ?? {
      date: toIsoDate(defaults.date),
      startTime: defaults.startTime,
      duration: defaults.duration,
    };

    const snapPoints = useMemo(() => ["65%"], []);
    const renderBackdrop = useCallback(
      (backdropProps: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...backdropProps}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
        />
      ),
      []
    );

    // Reset on dismiss (not unmount, which never happens for a modal that
    // lives for the screen's lifetime) so reopening for the next field always
    // starts on a clean form instead of a stale note or a stuck success state.
    const handleDismiss = () => {
      setNote("");
      setBusy(false);
      setError(null);
      setPhase("form");
    };

    const handleSubmit = async () => {
      if (!field || !userId || busy) return;
      setBusy(true);
      setError(null);
      const trimmedNote = note.trim();
      const { error: err } = await insertBookingRequest({
        userId,
        fieldId: field.id,
        venueId: venue.id,
        requestedDate: effectiveSlot.date,
        startTime: effectiveSlot.startTime,
        durationHours: effectiveSlot.duration,
        note: trimmedNote.length > 0 ? trimmedNote : null,
      });
      if (err) {
        setBusy(false);
        setError("Couldn't send your request. Try again.");
        return;
      }
      track(EVENT_BOOKING_REQUEST_SUBMITTED, {
        venue_id: venue.id,
        field_id: field.id,
        has_note: trimmedNote.length > 0,
      });
      setBusy(false);
      setPhase("success");
    };

    const display = field ? priceDisplayFor(venue.venue_type, field) : null;
    const slotLabel = formatSlotRange(
      preferredSlotDate(effectiveSlot),
      effectiveSlot.startTime,
      effectiveSlot.duration
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        onDismiss={handleDismiss}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          {phase === "success" ? (
            <View style={styles.success}>
              <Text
                size="lg"
                weight="bold"
                font="display"
                accessibilityRole="header"
                style={styles.successTitle}
              >
                Request sent
              </Text>
              <Text size="md" variant="secondary" style={styles.successBody}>
                The operator usually replies within a day.
              </Text>
            </View>
          ) : (
            <>
              <Text
                size="lg"
                weight="bold"
                font="display"
                accessibilityRole="header"
                style={styles.title}
              >
                {field?.name ?? "Request to book"}
              </Text>
              <Text size="sm" variant="secondary" numberOfLines={1} style={styles.subtitle}>
                {venue.name}
              </Text>

              <Pressable
                onPress={onEditSlot}
                accessibilityRole="button"
                accessibilityLabel={`Time ${slotLabel}. Tap to change.`}
                style={({ pressed }) => [
                  styles.slotRow,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceSecondary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <View style={styles.slotBody}>
                  <Text size="xs" variant="secondary" weight="medium" style={styles.slotLabel}>
                    WHEN
                  </Text>
                  <Text size="md" weight="bold" numberOfLines={1}>
                    {slotLabel}
                  </Text>
                </View>
                <Text size="sm" weight="medium" style={{ color: colors.brand }}>
                  Change
                </Text>
              </Pressable>

              <View style={styles.priceRow}>
                {display?.kind === "free" ? (
                  <FreeBadge />
                ) : display?.kind === "priced" ? (
                  <Text
                    font="display"
                    size="lg"
                    style={{ color: colors.brand, letterSpacing: 0.3 }}
                  >
                    {`$${Math.round(display.amount)}/hr`}
                  </Text>
                ) : (
                  <Text size="sm" variant="secondary">
                    Rate confirmed by the operator
                  </Text>
                )}
              </View>

              <Text size="sm" variant="secondary" weight="medium" style={styles.noteLabel}>
                Note to the operator (optional)
              </Text>
              <TextInput
                value={note}
                onChangeText={(t) => setNote(t.slice(0, MAX_NOTE))}
                placeholder="Anything the operator should know?"
                placeholderTextColor={colors.textTertiary}
                multiline
                accessibilityLabel="Note to the operator"
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    color: colors.textPrimary,
                    borderColor: colors.border,
                  },
                ]}
              />

              {error ? (
                <Text
                  size="sm"
                  variant="danger"
                  accessibilityLiveRegion="polite"
                  style={styles.error}
                >
                  {error}
                </Text>
              ) : null}

              <View style={styles.actions}>
                <Button
                  label="Send request"
                  onPress={() => void handleSubmit()}
                  loading={busy}
                  disabled={busy || !field || !userId}
                />
                <Button
                  label="Book on operator's site instead"
                  onPress={onBookOnOperatorSite}
                  variant="secondary"
                />
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);
BookingRequestSheet.displayName = "BookingRequestSheet";

// ---------------------------------------------------------------------------

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    marginTop: spacing.sm,
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
  },
  slotBody: {
    flex: 1,
  },
  slotLabel: {
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  priceRow: {
    marginBottom: spacing.lg,
  },
  noteLabel: {
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 88,
    textAlignVertical: "top",
  },
  error: {
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  success: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: "center",
  },
  successTitle: {
    marginBottom: spacing.xs,
  },
  successBody: {
    textAlign: "center",
  },
});
