import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";

import { formatEndTime } from "../lib/datetime";
import { selection } from "../lib/haptics";
import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

const DURATION_OPTIONS = [1, 1.5, 2, 2.5, 3] as const;

const TIME_SLOT_START_HOUR = 6;  // 06:00
const TIME_SLOT_END_HOUR = 23;   // 23:00

type Props = {
  selectedDate: Date;
  /** "HH:mm" in 24-hour format. */
  selectedStartTime: string;
  /** Hours, e.g. 1, 1.5, 2, 2.5, 3. */
  selectedDuration: number;
  onDateChange: (date: Date) => void;
  onStartTimeChange: (time: string) => void;
  onDurationChange: (duration: number) => void;
};

export function DateTimeRangePicker({
  selectedDate,
  selectedStartTime,
  selectedDuration,
  onDateChange,
  onStartTimeChange,
  onDurationChange,
}: Props) {
  const colors = useTheme();
  const [hint, setHint] = useState<string | null>(null);

  const dates = useMemo(() => getNext7Days(), []);
  const timeSlots = useMemo(() => getTimeSlots(), []);

  const handleDate = (d: Date) => {
    selection();
    onDateChange(d);
  };

  const handleStartTime = (t: string) => {
    selection();
    onStartTimeChange(t);
    // Re-validate the duration against the new start time.
    if (durationExceedsDay(t, selectedDuration)) {
      setHint(durationHint());
    } else {
      setHint(null);
    }
  };

  const handleDuration = (d: number) => {
    if (durationExceedsDay(selectedStartTime, d)) {
      setHint(durationHint());
      return; // prevent selection per AC
    }
    selection();
    setHint(null);
    onDurationChange(d);
  };

  return (
    <View>
      {/* ---- Date row -------------------------------------------------- */}
      <Text size="md" weight="medium" variant="secondary" style={styles.label}>
        Date
      </Text>
      <FlatList
        horizontal
        data={dates}
        keyExtractor={(d) => d.toISOString()}
        renderItem={({ item }) => (
          <DatePill
            label={formatDateLabel(item)}
            selected={isSameDay(item, selectedDate)}
            onPress={() => handleDate(item)}
          />
        )}
        ItemSeparatorComponent={Separator}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      />

      {/* ---- Start time row -------------------------------------------- */}
      <Text size="md" weight="medium" variant="secondary" style={styles.label}>
        Start time
      </Text>
      <FlatList
        horizontal
        data={timeSlots}
        keyExtractor={(t) => t}
        renderItem={({ item }) => (
          <TimePill
            label={formatTimeForDisplay(item)}
            selected={item === selectedStartTime}
            onPress={() => handleStartTime(item)}
          />
        )}
        ItemSeparatorComponent={Separator}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      />

      {/* ---- Duration row ---------------------------------------------- */}
      <Text size="md" weight="medium" variant="secondary" style={styles.label}>
        Duration
      </Text>
      <View style={[styles.row, styles.durationRow]}>
        {DURATION_OPTIONS.map((d) => {
          const wouldExceed = durationExceedsDay(selectedStartTime, d);
          return (
            <DurationChip
              key={d}
              label={formatDuration(d)}
              selected={d === selectedDuration}
              disabled={wouldExceed}
              onPress={() => handleDuration(d)}
            />
          );
        })}
      </View>

      {hint ? (
        <Text size="sm" variant="danger" style={styles.hint} accessibilityLiveRegion="polite">
          {hint}
        </Text>
      ) : (
        // Plain text (no live region) — TalkBack reads on focus; announcing
        // every duration tap is chatty.
        <Text size="sm" variant="tertiary" style={styles.endTime}>
          Ends at {formatEndTime(selectedStartTime, selectedDuration)}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-pills (kept private so the file is the single import point)
// ---------------------------------------------------------------------------

type PillBaseProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  withCheckmark?: boolean;
  accessibilityLabel?: string;
};

function PillBase({
  label,
  selected,
  onPress,
  disabled = false,
  withCheckmark = false,
  accessibilityLabel,
}: PillBaseProps) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: selected ? colors.brand : colors.surface,
          borderColor: selected ? colors.brand : colors.border,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {withCheckmark && selected ? (
        <Ionicons
          name="checkmark"
          size={14}
          color="#FFFFFF"
          style={styles.checkmark}
        />
      ) : null}
      <Text
        weight={selected ? "bold" : "medium"}
        style={{
          color: selected ? "#FFFFFF" : colors.textPrimary,
          fontSize: fontSize.sm,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DatePill(props: Omit<PillBaseProps, "withCheckmark">) {
  // Per F3.1 AC: selected date uses fill + checkmark, not color alone.
  return <PillBase {...props} withCheckmark />;
}

function TimePill(props: Omit<PillBaseProps, "withCheckmark">) {
  // Bold weight on selected acts as the non-color cue (REQ-F0.1.5).
  return <PillBase {...props} />;
}

function DurationChip(props: Omit<PillBaseProps, "withCheckmark">) {
  return <PillBase {...props} />;
}

function Separator() {
  return <View style={{ width: spacing.sm }} />;
}

// ---------------------------------------------------------------------------
// Helpers — exported so the parent screen can compute sane defaults
// ---------------------------------------------------------------------------

/** Default starting state per F3.1: today, next full hour, 1hr duration. */
export function defaultDateTimeSelections(): {
  date: Date;
  startTime: string;
  duration: number;
} {
  const now = new Date();
  const date = startOfDay(now);

  // Round up to the next full hour, clamped to the picker's time window.
  let hour = now.getHours();
  if (now.getMinutes() > 0 || now.getSeconds() > 0) hour += 1;
  hour = Math.max(TIME_SLOT_START_HOUR, Math.min(TIME_SLOT_END_HOUR, hour));

  return {
    date,
    startTime: `${pad(hour)}:00`,
    duration: 1,
  };
}

function getNext7Days(): Date[] {
  const today = startOfDay(new Date());
  return Array.from({ length: 7 }, (_, i) => addDays(today, i));
}

function getTimeSlots(): string[] {
  const out: string[] = [];
  for (let h = TIME_SLOT_START_HOUR; h <= TIME_SLOT_END_HOUR; h++) {
    out.push(`${pad(h)}:00`);
    out.push(`${pad(h)}:30`);
  }
  return out;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDateLabel(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return target.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeForDisplay(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const hour12 = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour12}:${pad(m)} ${ampm}`;
}

function formatDuration(hours: number): string {
  // "1hr", "1.5hr", "2hr"…
  return `${hours}hr`;
}

function durationExceedsDay(startTime: string, durationHours: number): boolean {
  const [h, m] = startTime.split(":").map(Number);
  const startMinutes = h * 60 + m;
  const endMinutes = startMinutes + durationHours * 60;
  // > 24*60 means it crosses midnight (>= 24:00 is not a valid same-day end).
  return endMinutes > 24 * 60;
}

function durationHint(): string {
  return "Booking can't extend past midnight. Try a shorter duration or earlier start.";
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  label: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
  },
  durationRow: {
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pill: {
    minHeight: 44,                 // REQ-F0.2 — minimum touch target
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: {
    marginRight: spacing.xs,
  },
  hint: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  endTime: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
});
