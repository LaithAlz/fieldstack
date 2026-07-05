import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  preferredSlotDate,
  usePreferredSlot,
  type PreferredSlot,
} from "../lib/preferredSlot";
import { spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Button } from "./Button";
import { DateTimeRangePicker, defaultDateTimeSelections } from "./DateTimeRangePicker";
import { Text } from "./Text";

// ---------------------------------------------------------------------------
// The bottom sheet wrapping DateTimeRangePicker
// ---------------------------------------------------------------------------

type WhenPickerSheetProps = {
  /**
   * Per-date open/close window, typically `(date) => getDayHours(venue.hours,
   * date)`. Forwarded straight to DateTimeRangePicker's own `getOpenHours`
   * prop — first real caller, wired from VenueDetail/FieldDetail's reserve
   * bars. Profile's "preferred time" card (not scoped to one venue) omits it.
   */
  getOpenHours?: (date: Date) => { openMinutes: number; closeMinutes: number } | null;
};

export const WhenPickerSheet = forwardRef<BottomSheetModal, WhenPickerSheetProps>(
  function WhenPickerSheet({ getOpenHours }, ref) {
    const colors = useTheme();
    const { slot, setSlot } = usePreferredSlot();
    const defaults = useMemo(() => defaultDateTimeSelections(), []);

    // Local picker state — committed to context only on Save.
    const [date, setDate] = useState<Date>(
      slot ? preferredSlotDate(slot) : defaults.date
    );
    const [time, setTime] = useState<string>(slot?.startTime ?? defaults.startTime);
    const [duration, setDuration] = useState<number>(slot?.duration ?? defaults.duration);

    // Track whether the user has started interacting with the form so an
    // external slot change doesn't clobber in-progress edits.
    const isEditing = useRef(false);

    // Resync local state if context slot changes while the sheet is closed.
    useEffect(() => {
      if (isEditing.current) return;
      if (slot) {
        setDate(preferredSlotDate(slot));
        setTime(slot.startTime);
        setDuration(slot.duration);
      }
    }, [slot]);

    const snapPoints = useMemo(() => ["80%"], []);

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

    const handleSave = async () => {
      const next: PreferredSlot = {
        date: toIsoDate(date),
        startTime: time,
        duration,
      };
      await setSlot(next);
      isEditing.current = false;
      // Support both forwarded ref shapes. Function refs are called with the
      // current instance; object refs we read off .current.
      if (typeof ref === "function") {
        // Caller's responsibility to keep its own ref for dismiss — nothing
        // sensible we can do without our own internal ref. Every current
        // caller (VenueDetail/FieldDetail's reserve bars) uses an object ref,
        // so this branch is just the safety net for a hypothetical one that
        // doesn't.
        return;
      }
      ref?.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          <Text size="lg" weight="bold" accessibilityRole="header" style={styles.title}>
            When do you want to play?
          </Text>
          <Text size="sm" variant="tertiary" style={styles.subtitle}>
            We&apos;ll pre-fill this on every field you open.
          </Text>

          <DateTimeRangePicker
            selectedDate={date}
            selectedStartTime={time}
            selectedDuration={duration}
            onDateChange={(d) => { isEditing.current = true; setDate(d); }}
            onStartTimeChange={(t) => { isEditing.current = true; setTime(t); }}
            onDurationChange={(dur) => { isEditing.current = true; setDuration(dur); }}
            getOpenHours={getOpenHours}
          />

          <View style={styles.cta}>
            <Button label="Save preferred time" onPress={handleSave} />
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);
WhenPickerSheet.displayName = "WhenPickerSheet";

// ---------------------------------------------------------------------------

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const styles = StyleSheet.create({
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    marginTop: spacing.sm,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginBottom: spacing.md,
  },
  cta: {
    marginTop: spacing.lg,
  },
});
