import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { EVENT_BOOKING_REDIRECT_CONFIRMED, track } from "../lib/analytics";
import { useBookingHistory } from "../lib/bookingHistory";
import { buildBookingUrl } from "../lib/bookingUrl";
import { addEventToCalendar } from "../lib/calendar";
import { formatDurationHours, formatEndTime, formatTime12h } from "../lib/datetime";
import { lightImpact } from "../lib/haptics";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Field, FieldSize, FieldSurface, Venue } from "../types/api";

import { Button } from "./Button";
import { Text } from "./Text";
import { useToast } from "./Toast";

const SURFACE_LABEL: Record<FieldSurface, string> = {
  turf: "Turf",
  grass: "Grass",
  concrete: "Concrete",
  indoor: "Indoor",
};

const SIZE_LABEL: Record<FieldSize, string> = {
  "5v5": "5-a-side",
  "7v7": "7-a-side",
  "11v11": "11-a-side",
};

type Props = {
  visible: boolean;
  field: Field;
  venue: Venue;
  /**
   * Operator name. Deviation from the AC (which lists only `field`/`venue`
   * as data props): our `Venue` type doesn't embed the operator, and adding
   * a per-venue operator fetch would couple this sheet to network. Caller
   * passes the name it already has from the venue's parent screen.
   */
  operatorName: string;
  selectedDate: Date;
  selectedTime: string;     // "HH:mm" 24-hour
  selectedDuration: number; // hours
  /** Called after the user taps Confirm — useful for parent-side cleanup. */
  onConfirm?: () => void;
  /** Called whenever the sheet closes (Confirm, gesture pull-down, backdrop tap). */
  onDismiss: () => void;
};

/**
 * Pre-redirect confirmation sheet. The user picks a field on the parent
 * screen, then this sheet confirms what they're about to book and warns
 * them they'll leave the app. Confirm fires a light haptic, logs the
 * `booking_redirect_confirmed` event, and opens the operator's URL via
 * expo-linking. If openURL rejects, the Confirm button swaps to a
 * "Copy link" fallback so the user isn't dead-ended.
 */
export function BookingBottomSheet({
  visible,
  field,
  venue,
  operatorName,
  selectedDate,
  selectedTime,
  selectedDuration,
  onConfirm,
  onDismiss,
}: Props) {
  const colors = useTheme();
  const toast = useToast();
  const { record: recordAttempt } = useBookingHistory();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["62%"], []);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // Sync the imperative sheet with the controlled `visible` prop.
  useEffect(() => {
    if (visible) {
      setFailedUrl(null);
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const handleSheetChange = useCallback(
    (index: number) => {
      // index === -1 means the sheet has fully closed (gesture, backdrop, etc.)
      if (index === -1) onDismiss();
    },
    [onDismiss]
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    []
  );

  const handleConfirm = async () => {
    lightImpact();
    track(EVENT_BOOKING_REDIRECT_CONFIRMED, {
      field_id: field.id,
      venue_id: venue.id,
      operator_id: venue.operator_id,
    });

    const url = buildBookingUrl(field, selectedDate, selectedTime, selectedDuration);
    if (!url) {
      toast.show("This field doesn't have a booking link yet.", { type: "error" });
      return;
    }

    try {
      await Linking.openURL(url);
      void recordAttempt({
        fieldId: field.id,
        venueId: venue.id,
        date: toIsoDate(selectedDate),
        startTime: selectedTime,
        duration: selectedDuration,
      });
      onConfirm?.();
      promptAddToCalendar({
        venueName: venue.name,
        venueAddress: venue.address,
        operatorName,
        startDate: combineDateAndTime(selectedDate, selectedTime),
        durationHours: selectedDuration,
        onResult: (msg, type) => toast.show(msg, { type }),
      });
    } catch {
      setFailedUrl(url);
      toast.show("Couldn't open the booking page.", { type: "error" });
    }
  };

  const handleCopy = async () => {
    if (!failedUrl) return;
    try {
      await Clipboard.setStringAsync(failedUrl);
      toast.show("Link copied to clipboard.", { type: "success" });
    } catch {
      toast.show("Couldn't copy the link.", { type: "error" });
    }
  };

  const dateText = formatDateLong(selectedDate);
  const timeText = formatTime12h(selectedTime);
  const endTimeText = formatEndTime(selectedTime, selectedDuration);
  const durationText = formatDurationHours(selectedDuration);
  const fieldDescriptor = `${field.name} · ${SURFACE_LABEL[field.surface]} · ${SIZE_LABEL[field.size]}`;
  const pricePerHour = field.price_per_hour;
  const estimatedTotal =
    pricePerHour !== null ? Math.round(pricePerHour * selectedDuration) : null;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      <BottomSheetView style={styles.content}>
        <Text size="lg" weight="bold" accessibilityRole="header" style={styles.title}>
          Confirm your booking
        </Text>

        <View style={[styles.notice, { backgroundColor: colors.surfaceSecondary }]}>
          <Ionicons
            name="open-outline"
            size={18}
            color={colors.textSecondary}
            style={styles.noticeIcon}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text size="sm" variant="secondary" style={styles.noticeText}>
            You'll be taken to{" "}
            <Text size="sm" weight="medium">
              {operatorName}
            </Text>{" "}
            to complete your booking.
          </Text>
        </View>

        <View style={styles.summary}>
          <SummaryRow label="Field" value={fieldDescriptor} />
          <SummaryRow label="Venue" value={venue.name} />
          <SummaryRow label="When" value={`${dateText} · ${timeText} – ${endTimeText}`} />
          <SummaryRow label="Duration" value={durationText} />
          {pricePerHour !== null && estimatedTotal !== null ? (
            <SummaryRow
              label="Estimated total"
              value={`$${estimatedTotal} · ${durationText} × $${Math.round(pricePerHour)}/hr`}
              emphasize
            />
          ) : null}
        </View>

        <Text size="sm" variant="tertiary" style={styles.disclaimerNote}>
          Final availability and price are confirmed on {operatorName}.
        </Text>

        <View style={styles.cta}>
          {failedUrl ? (
            <Button
              label="Copy link"
              variant="secondary"
              onPress={handleCopy}
              accessibilityHint="Copies the booking URL to your clipboard"
            />
          ) : (
            <Button
              label={`Continue on ${operatorName}`}
              onPress={handleConfirm}
              accessibilityHint={`Opens ${operatorName} in your browser`}
            />
          )}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

// ---------------------------------------------------------------------------
// Internal summary row
// ---------------------------------------------------------------------------

function SummaryRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text size="sm" variant="tertiary">
        {label}
      </Text>
      <Text
        size={emphasize ? "md" : "sm"}
        weight={emphasize ? "bold" : "medium"}
        style={[styles.rowValue, emphasize && { color: colors.brand }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Date helper — kept inline because only one caller; the time helpers live
// in lib/datetime.ts where they're shared with DateTimeRangePicker.
// ---------------------------------------------------------------------------

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function combineDateAndTime(date: Date, time24: string): Date {
  const [h, m] = time24.split(":").map(Number);
  const out = new Date(date);
  out.setHours(h, m, 0, 0);
  return out;
}

type PromptArgs = {
  venueName: string;
  venueAddress: string | null | undefined;
  operatorName: string;
  startDate: Date;
  durationHours: number;
  onResult: (message: string, type: "success" | "error" | "info") => void;
};

function promptAddToCalendar(args: PromptArgs) {
  Alert.alert(
    "Add to your calendar?",
    "We'll save the slot you just opened on the operator's site so it doesn't slip your mind.",
    [
      { text: "Not now", style: "cancel" },
      {
        text: "Add",
        onPress: async () => {
          try {
            const ok = await addEventToCalendar({
              title: `Soccer at ${args.venueName}`,
              startDate: args.startDate,
              durationHours: args.durationHours,
              location: args.venueAddress ?? undefined,
              notes: `Booked through ${args.operatorName} · added from FieldStack`,
            });
            if (ok) {
              args.onResult("Added to your calendar.", "success");
            } else {
              args.onResult(
                "Calendar access denied. Enable it in Settings to add events.",
                "error"
              );
            }
          } catch {
            args.onResult("Couldn't add to your calendar.", "error");
          }
        },
      },
    ]
  );
}

function formatDateLong(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return target.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    letterSpacing: -0.3,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  noticeIcon: {
    marginRight: spacing.sm,
  },
  noticeText: {
    flex: 1,
    flexShrink: 1,
  },
  summary: {
    marginBottom: spacing.md,
  },
  disclaimerNote: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: "right",
  },
  cta: {
    marginTop: spacing.sm,
  },
});
