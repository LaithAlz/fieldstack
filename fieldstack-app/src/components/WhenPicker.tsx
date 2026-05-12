import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { formatEndTime, formatTime12h } from "../lib/datetime";
import {
  preferredSlotDate,
  usePreferredSlot,
  type PreferredSlot,
} from "../lib/preferredSlot";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Button } from "./Button";
import { DateTimeRangePicker, defaultDateTimeSelections } from "./DateTimeRangePicker";
import { Text } from "./Text";

/**
 * Compact "When do you want to play?" pill rendered on the venue list. Tap
 * to open the time picker sheet; the selection persists across sessions and
 * pre-fills every booking screen the user opens after.
 */
export function WhenPill() {
  const colors = useTheme();
  const { slot, clear } = usePreferredSlot();
  const sheetRef = useRef<BottomSheetModal>(null);

  const open = () => sheetRef.current?.present();

  const label = useMemo(() => slotLabel(slot), [slot]);

  return (
    <>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={
          slot
            ? `Preferred time ${label}, tap to change`
            : "Set preferred time"
        }
        hitSlop={spacing.xs}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: slot ? colors.brand : colors.surfaceSecondary,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons
          name="time-outline"
          size={16}
          color={slot ? "#FFFFFF" : colors.textPrimary}
        />
        <Text
          size="sm"
          weight="medium"
          style={{ color: slot ? "#FFFFFF" : colors.textPrimary }}
          numberOfLines={1}
        >
          {label}
        </Text>
        {slot ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              void clear();
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear preferred time"
            hitSlop={spacing.xs}
            style={styles.clear}
          >
            <Ionicons name="close" size={14} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </Pressable>
      <WhenPickerSheet ref={sheetRef} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Internal: the bottom sheet wrapping DateTimeRangePicker
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type SheetProps = {};

const WhenPickerSheet = forwardRef<BottomSheetModal, SheetProps>((_props, ref) => {
  const colors = useTheme();
  const { slot, setSlot } = usePreferredSlot();
  const defaults = useMemo(() => defaultDateTimeSelections(), []);

  // Local picker state — committed to context only on Save.
  const [date, setDate] = useState<Date>(
    slot ? preferredSlotDate(slot) : defaults.date
  );
  const [time, setTime] = useState<string>(slot?.startTime ?? defaults.startTime);
  const [duration, setDuration] = useState<number>(slot?.duration ?? defaults.duration);

  // Resync local state if context slot changes while the sheet is closed.
  useEffect(() => {
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
    if (typeof ref === "function") return;
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
          onDateChange={setDate}
          onStartTimeChange={setTime}
          onDurationChange={setDuration}
        />

        <View style={styles.cta}>
          <Button label="Save preferred time" onPress={handleSave} />
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});
WhenPickerSheet.displayName = "WhenPickerSheet";

// ---------------------------------------------------------------------------

function slotLabel(slot: PreferredSlot | null): string {
  if (!slot) return "When do you want to play?";
  const date = preferredSlotDate(slot);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  let datePart: string;
  if (date.getTime() === today.getTime()) datePart = "Today";
  else if (date.getTime() === tomorrow.getTime()) datePart = "Tomorrow";
  else
    datePart = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  return `${datePart} · ${formatTime12h(slot.startTime)} – ${formatEndTime(slot.startTime, slot.duration)}`;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.xl,
    minHeight: 32,
    maxWidth: "100%",
  },
  clear: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs,
  },
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
