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
import { StyleSheet, View } from "react-native";

import { EVENT_BOOKING_REDIRECT_CONFIRMED, track } from "../lib/analytics";
import { mockedAvailability } from "../lib/availability";
import { useBookingHistory } from "../lib/bookingHistory";
import { buildBookingUrl } from "../lib/bookingUrl";
import {
  combineDateAndTime,
  promptAddToCalendarOnReturn,
} from "../lib/calendar";
import { formatDurationHours, formatEndTime, formatTime12h } from "../lib/datetime";
import { lightImpact } from "../lib/haptics";
import { getDayHours } from "../lib/venueHours";
import { scheduleBookingReminder } from "../lib/notifications";
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

  const getAvailability = useCallback(
    (d: Date, t: string) => mockedAvailability(venue.id, d, t),
    [venue.id]
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
      scheduleBookingReminder({
        venueName: venue.name,
        startDate: combineDateAndTime(selectedDate, selectedTime),
      }).catch((err) => {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[notifications] scheduleBookingReminder failed", err);
        }
      });
      onConfirm?.();
      // Deferred until app returns to foreground — see promptAddToCalendarOnReturn
      promptAddToCalendarOnReturn({
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
          getAvailability={getAvailability}
          pricePerHour={field.price_per_hour}
          getOpenHours={(d) => getDayHours(venue.hours, d)}
        />

        {/* Consolidated summary card — what the user is about to book, with
            running total and operator handoff baked in. Last on-app moment
            to catch a wrong tap before the external redirect. */}
        <View style={[styles.summary, { borderColor: colors.border }]}>
          <Text size="md" weight="bold" style={styles.summaryDate}>
            {formatFullDate(selectedDate)}
          </Text>
          <Text size="sm" variant="secondary" style={styles.summaryTime}>
            {formatTime12h(selectedTime)} – {formatEndTime(selectedTime, selectedDuration)}
            {" · "}
            {formatDurationHours(selectedDuration)}
          </Text>
          {estimatedTotal !== null ? (
            <View style={styles.summaryTotalRow}>
              <Text size="sm" variant="secondary">
                Estimated total
              </Text>
              <Text size="lg" weight="bold" style={{ color: colors.brand }}>
                ${estimatedTotal}
              </Text>
            </View>
          ) : null}
          <View style={styles.summaryNoticeRow}>
            <Ionicons
              name="open-outline"
              size={14}
              color={colors.textTertiary}
              style={styles.summaryNoticeIcon}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <Text size="xs" variant="tertiary" style={styles.summaryNoticeText}>
              {estimatedTotal !== null
                ? `Paid on ${operatorName}`
                : `Booking continues on ${operatorName}`}
            </Text>
          </View>
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

function formatFullDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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
  summary: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summaryDate: {
    letterSpacing: -0.2,
  },
  summaryTime: {
    marginTop: 2,
  },
  summaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  summaryNoticeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  summaryNoticeIcon: {
    marginRight: spacing.xs,
  },
  summaryNoticeText: {
    flex: 1,
    flexShrink: 1,
  },
  cta: {
    marginTop: spacing.lg,
  },
});
