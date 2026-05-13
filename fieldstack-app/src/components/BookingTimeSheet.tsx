import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { EVENT_BOOKING_REDIRECT_CONFIRMED, track } from "../lib/analytics";
import { useBookingHistory } from "../lib/bookingHistory";
import { buildBookingUrl } from "../lib/bookingUrl";
import { addEventToCalendar } from "../lib/calendar";
import { formatDurationHours } from "../lib/datetime";
import { lightImpact } from "../lib/haptics";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Field, Venue } from "../types/api";

import { Button } from "./Button";
import { DateTimeRangePicker } from "./DateTimeRangePicker";
import { Text } from "./Text";
import { useToast } from "./Toast";

type Props = {
  visible: boolean;
  field: Field;
  venue: Venue;
  /** See BookingBottomSheet for the rationale on passing this as a prop. */
  operatorName: string;
  selectedDate: Date;
  selectedTime: string;     // "HH:mm" 24-hour
  selectedDuration: number; // hours
  onDateChange: (date: Date) => void;
  onStartTimeChange: (time: string) => void;
  onDurationChange: (duration: number) => void;
  onConfirm?: () => void;
  onDismiss: () => void;
};

/**
 * Date/time picker + confirmation sheet for the Field Detail screen. The
 * parent owns selection state so dismissing the sheet without confirming
 * preserves the user's choices (REQ-F5.3).
 *
 * Confirm + failed-URL fallback logic mirrors BookingBottomSheet — kept
 * inline here rather than hoisted to a shared helper; will consolidate
 * when a third caller exists.
 */
export function BookingTimeSheet({
  visible,
  field,
  venue,
  operatorName,
  selectedDate,
  selectedTime,
  selectedDuration,
  onDateChange,
  onStartTimeChange,
  onDurationChange,
  onConfirm,
  onDismiss,
}: Props) {
  const colors = useTheme();
  const toast = useToast();
  const { record: recordAttempt } = useBookingHistory();
  const sheetRef = useRef<BottomSheetModal>(null);
  // Taller than BookingBottomSheet because the picker eats real estate.
  const snapPoints = useMemo(() => ["88%"], []);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

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
      // Record only on a successful handoff. Failed openURL → no history entry
      // so the user isn't credited a phantom attempt.
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

  const pricePerHour = field.price_per_hour;
  const estimatedTotal =
    pricePerHour !== null
      ? Math.round(pricePerHour * selectedDuration)
      : null;

  const handleCopy = async () => {
    if (!failedUrl) return;
    try {
      await Clipboard.setStringAsync(failedUrl);
      toast.show("Link copied to clipboard.", { type: "success" });
    } catch {
      toast.show("Couldn't copy the link.", { type: "error" });
    }
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <Text size="lg" weight="bold" accessibilityRole="header" style={styles.title}>
          Pick a time
        </Text>
        <Text size="sm" variant="tertiary" style={styles.subtitle}>
          Final availability is confirmed on {operatorName}.
        </Text>

        <DateTimeRangePicker
          selectedDate={selectedDate}
          selectedStartTime={selectedTime}
          selectedDuration={selectedDuration}
          onDateChange={onDateChange}
          onStartTimeChange={onStartTimeChange}
          onDurationChange={onDurationChange}
        />

        {estimatedTotal !== null ? (
          <View style={[styles.estimate, { borderColor: colors.border }]}>
            <View style={styles.estimateRow}>
              <Text size="sm" variant="secondary">
                Estimated total
              </Text>
              <Text size="lg" weight="bold" style={{ color: colors.brand }}>
                ${estimatedTotal}
              </Text>
            </View>
            <Text size="sm" variant="tertiary" style={styles.estimateBreakdown}>
              {formatDurationHours(selectedDuration)} × ${Math.round(pricePerHour ?? 0)}/hr · paid on{" "}
              {operatorName}
            </Text>
          </View>
        ) : null}

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
            You&apos;ll be taken to{" "}
            <Text size="sm" weight="medium">
              {operatorName}
            </Text>{" "}
            to complete your booking.
          </Text>
        </View>

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
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

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

/**
 * Native confirm → write event → toast result. Kept inline rather than
 * imported into both booking sheets because the prompt copy is the same.
 * The two sheets pass slightly different "title" data (venue vs field) but
 * both surface as "Soccer at <venue>" — field-name isn't useful in a
 * calendar event title.
 */
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

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    marginTop: spacing.sm,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginBottom: spacing.lg,
  },
  estimate: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  estimateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  estimateBreakdown: {
    marginTop: spacing.xs,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  noticeIcon: {
    marginRight: spacing.sm,
  },
  noticeText: {
    flex: 1,
    flexShrink: 1,
  },
  cta: {
    marginTop: spacing.lg,
  },
});
