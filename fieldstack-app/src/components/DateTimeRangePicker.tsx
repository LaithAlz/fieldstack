import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";

import { formatEndTime } from "../lib/datetime";
import { selection } from "../lib/haptics";
import { borderRadius, fontSize, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

// Optional availability hint surfaced by callers (today: only WhenPickerSheet
// uses this without passing the callback). Inlined after the mocked
// availability source was removed in PR #138 — no other consumer left.
type AvailabilityBucket = "open" | "busy";

const DURATION_OPTIONS = [1, 1.5, 2, 2.5, 3] as const;

const TIME_SLOT_START_HOUR = 6;  // 06:00
const TIME_SLOT_END_HOUR = 23;   // 23:00
const DATE_RAIL_DAYS = 14;       // up from 7

// Grouping aligned to how people actually talk about time slots: morning
// runs 6 AM–11:30, afternoon noon–5:30, evening 6 PM–11 PM. Lets users skim
// to the period they want without scrolling through 34 chips.
type Period = "morning" | "afternoon" | "evening";

const PERIODS: { id: Period; label: string; range: [number, number] }[] = [
  { id: "morning",   label: "Morning",   range: [6, 11] },
  { id: "afternoon", label: "Afternoon", range: [12, 17] },
  { id: "evening",   label: "Evening",   range: [18, 23] },
];

type Props = {
  selectedDate: Date;
  /** "HH:mm" in 24-hour format. */
  selectedStartTime: string;
  /** Hours, e.g. 1, 1.5, 2, 2.5, 3. */
  selectedDuration: number;
  onDateChange: (date: Date) => void;
  onStartTimeChange: (time: string) => void;
  onDurationChange: (duration: number) => void;
  /**
   * Optional availability hint for each slot. When provided, slots in the
   * 'busy' bucket render a small dot and a footer disclaimer surfaces so
   * the user knows it's a hint, not a hard block. Slots stay tappable.
   */
  getAvailability?: (date: Date, startTime: string) => AvailabilityBucket;
  /**
   * Optional $/hour rate. When provided, duration chips include the running
   * total so the user doesn't have to multiply in their head (`"2hr · $190"`).
   * Best-in-class booking apps (Resy, Zocdoc, OpenTable) all surface this
   * inline rather than waiting for a separate review step.
   */
  pricePerHour?: number | null;
  /**
   * Optional per-date open/close window. Returning null means "no
   * constraint" — picker falls back to its 6 AM–11 PM default. Slots
   * outside the range render as disabled (same treatment as past slots).
   */
  getOpenHours?: (date: Date) => { openMinutes: number; closeMinutes: number } | null;
};

export function DateTimeRangePicker({
  selectedDate,
  selectedStartTime,
  selectedDuration,
  onDateChange,
  onStartTimeChange,
  onDurationChange,
  getAvailability,
  pricePerHour,
  getOpenHours,
}: Props) {
  const colors = useTheme();
  const [hint, setHint] = useState<string | null>(null);
  // Date row layout. Defaults to the horizontal pill rail; toggles to a
  // 2x7 calendar grid via the calendar icon next to the "Date" label.
  const [showCalendar, setShowCalendar] = useState(false);
  // Ticks every minute so the date rail rolls "Today" over at midnight and
  // past-slot greying doesn't go stale when the sheet sits open.
  const now = useNowTick(60_000);

  const dates = useMemo(() => getNextDays(DATE_RAIL_DAYS, now), [now]);
  const slotsByPeriod = useMemo(() => groupSlotsByPeriod(), []);
  const pastBoundaryMinutes = useMemo(
    () => pastBoundaryFor(selectedDate, now),
    [selectedDate, now]
  );

  const handleDate = (d: Date) => {
    selection();
    onDateChange(d);
    // Switching to Today with a start time that's already past: auto-advance
    // to the next valid full hour so the parent state doesn't carry a value
    // that would silently book a past slot.
    if (
      isSameDay(d, now) &&
      timeStringToMinutes(selectedStartTime) <= pastBoundaryFor(d, now)
    ) {
      const nextSlot = nextValidSlot(now);
      if (nextSlot !== null) onStartTimeChange(nextSlot);
    }
  };

  const handleStartTime = (t: string) => {
    selection();
    onStartTimeChange(t);
    if (durationExceedsDay(t, selectedDuration)) {
      setHint(durationHint());
    } else {
      setHint(null);
    }
  };

  const handleDuration = (d: number) => {
    if (durationExceedsDay(selectedStartTime, d)) {
      setHint(durationHint());
      return;
    }
    selection();
    setHint(null);
    onDurationChange(d);
  };

  return (
    <View>
      {/* ---- Date row -------------------------------------------------- */}
      <View style={styles.dateLabelRow}>
        <Text size="md" weight="medium" variant="secondary" style={styles.label}>
          Date
        </Text>
        <Pressable
          onPress={() => {
            selection();
            setShowCalendar((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            showCalendar
              ? "Switch to date list view"
              : "Switch to calendar view"
          }
          accessibilityState={{ expanded: showCalendar }}
          hitSlop={spacing.sm}
          style={({ pressed }) => [
            styles.calendarToggle,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons
            name={showCalendar ? "list-outline" : "calendar-outline"}
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
      {showCalendar ? (
        <CalendarGrid
          dates={dates}
          selectedDate={selectedDate}
          onPick={handleDate}
        />
      ) : (
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
      )}

      {/* ---- Start time, grouped --------------------------------------- */}
      <Text size="md" weight="medium" variant="secondary" style={styles.label}>
        Start time
      </Text>
      <View style={styles.periodsWrap}>
        {PERIODS.map((period) => {
          const slots = slotsByPeriod[period.id];
          // Hours hint for the selected date — null means "no constraint".
          const hours = getOpenHours?.(selectedDate) ?? null;
          const isOutsideHours = (slot: string): boolean => {
            if (!hours) return false;
            const m = timeStringToMinutes(slot);
            return m < hours.openMinutes || m >= hours.closeMinutes;
          };
          const allDisabled = slots.every(
            (s) => timeStringToMinutes(s) <= pastBoundaryMinutes || isOutsideHours(s)
          );
          if (allDisabled) return null;
          return (
            <View key={period.id} style={styles.period}>
              <Text size="sm" variant="tertiary" style={styles.periodLabel}>
                {period.label}
              </Text>
              <View style={styles.slotsGrid}>
                {slots.map((slot) => {
                  const isPast =
                    timeStringToMinutes(slot) <= pastBoundaryMinutes;
                  const closedNow = isOutsideHours(slot);
                  const busy =
                    getAvailability?.(selectedDate, slot) === "busy";
                  return (
                    <TimePill
                      key={slot}
                      label={formatTimeForDisplay(slot)}
                      selected={slot === selectedStartTime}
                      disabled={isPast || closedNow}
                      busy={busy && !closedNow}
                      onPress={() => handleStartTime(slot)}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      {/* ---- Open-alternative suggestions ------------------------------ */}
      {/* Only when the user's picked time is flagged busy: surface the next
          handful of likely-open slots so they don't have to scrub through
          chips. Mirrors Zocdoc / Hotel Tonight's "next available" pattern. */}
      {getAvailability && getAvailability(selectedDate, selectedStartTime) === "busy" ? (
        <View style={styles.suggestionsWrap}>
          <Text size="sm" weight="medium" variant="secondary" style={styles.suggestionsLabel}>
            Open soon
          </Text>
          <View style={styles.suggestionsRow}>
            {findNextOpenSlots(dates, slotsByPeriod, getAvailability, selectedDate).map(
              (s) => (
                <SuggestionChip
                  key={`${s.date.toISOString()}-${s.startTime}`}
                  label={formatSuggestionLabel(s.date, s.startTime, now)}
                  onPress={() => {
                    onDateChange(s.date);
                    onStartTimeChange(s.startTime);
                  }}
                />
              )
            )}
          </View>
        </View>
      ) : null}

      {/* ---- Duration -------------------------------------------------- */}
      <Text size="md" weight="medium" variant="secondary" style={styles.label}>
        Duration
      </Text>
      <View style={[styles.row, styles.durationRow]}>
        {DURATION_OPTIONS.map((d) => {
          const wouldExceed = durationExceedsDay(selectedStartTime, d);
          const total =
            pricePerHour !== null && pricePerHour !== undefined
              ? Math.round(pricePerHour * d)
              : null;
          return (
            <DurationChip
              key={d}
              label={
                total !== null
                  ? `${formatDuration(d)} · $${total}`
                  : formatDuration(d)
              }
              selected={d === selectedDuration}
              disabled={wouldExceed}
              onPress={() => handleDuration(d)}
            />
          );
        })}
      </View>

      {hint ? (
        <Text
          size="sm"
          variant="danger"
          style={styles.hint}
          accessibilityLiveRegion="polite"
        >
          {hint}
        </Text>
      ) : (
        <Text size="sm" variant="tertiary" style={styles.endTime}>
          Ends at {formatEndTime(selectedStartTime, selectedDuration)}
        </Text>
      )}

      {getAvailability ? (
        <View style={styles.availabilityNote}>
          <View
            style={[styles.busyDotLegend, { backgroundColor: colors.danger }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text size="xs" variant="tertiary" style={styles.availabilityNoteText}>
            Likely busy — final availability confirmed on the operator&apos;s site.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-pills
// ---------------------------------------------------------------------------

type PillBaseProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  withCheckmark?: boolean;
  /** When true, render a small dot indicating likely-busy. */
  busy?: boolean;
  accessibilityLabel?: string;
};

function PillBase({
  label,
  selected,
  onPress,
  disabled = false,
  withCheckmark = false,
  busy = false,
  accessibilityLabel,
}: PillBaseProps) {
  const colors = useTheme();
  const a11y =
    busy && !selected
      ? `${accessibilityLabel ?? label}, likely busy`
      : accessibilityLabel ?? label;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={a11y}
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
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      {busy && !selected ? (
        <View
          style={[styles.busyDot, { backgroundColor: colors.danger }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
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

function DatePill(props: Omit<PillBaseProps, "withCheckmark" | "busy">) {
  return <PillBase {...props} withCheckmark />;
}

function TimePill(props: Omit<PillBaseProps, "withCheckmark">) {
  return <PillBase {...props} />;
}

function DurationChip(props: Omit<PillBaseProps, "withCheckmark">) {
  return <PillBase {...props} />;
}

function Separator() {
  return <View style={{ width: spacing.sm }} />;
}

/**
 * Up to 3 likely-open slots starting from the user's currently selected date,
 * skipping anything `getAvailability` flags as busy. Used to suggest forward
 * alternatives when the user's pick is busy.
 */
function findNextOpenSlots(
  dates: Date[],
  slotsByPeriod: Record<Period, string[]>,
  getAvailability: (date: Date, startTime: string) => AvailabilityBucket,
  fromDate: Date,
  limit = 3
): { date: Date; startTime: string }[] {
  const allSlots: string[] = [];
  for (const p of PERIODS) allSlots.push(...slotsByPeriod[p.id]);

  const out: { date: Date; startTime: string }[] = [];
  // Start at the selected date and walk forward. We don't filter past-slots
  // here because the caller's date list already starts at today; if the
  // selected date is today, slots earlier than "now" won't be open anyway
  // (the picker already greys them) and they'd just be filtered visually.
  let started = false;
  for (const date of dates) {
    if (!started) {
      if (!isSameDay(date, fromDate)) continue;
      started = true;
    }
    for (const slot of allSlots) {
      if (getAvailability(date, slot) !== "busy") {
        out.push({ date, startTime: slot });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

function formatSuggestionLabel(date: Date, startTime: string, now: Date): string {
  const today = startOfDay(now);
  const target = startOfDay(date);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  const dayLabel =
    diffDays === 0
      ? "Today"
      : diffDays === 1
      ? "Tomorrow"
      : target.toLocaleDateString("en-US", { weekday: "short" });
  return `${dayLabel} ${formatTimeForDisplay(startTime)}`;
}

function SuggestionChip({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${label}`}
      style={({ pressed }) => [
        styles.suggestionChip,
        {
          backgroundColor: colors.surface,
          borderColor: colors.brand,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        size="sm"
        weight="medium"
        style={{ color: colors.brand }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * 2-row calendar grid showing the next 14 bookable days. Mirrors the same
 * date list the horizontal pill rail uses, just laid out as 2x7 cells so the
 * user can see the whole window at a glance instead of swiping through it.
 */
function CalendarGrid({
  dates,
  selectedDate,
  onPick,
}: {
  dates: Date[];
  selectedDate: Date;
  onPick: (date: Date) => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.calendarGrid}>
      {dates.map((d) => {
        const isSelected = isSameDay(d, selectedDate);
        const day = d.getDate();
        const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
        return (
          <Pressable
            key={d.toISOString()}
            onPress={() => onPick(d)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={d.toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
            style={({ pressed }) => [
              styles.calendarCell,
              {
                backgroundColor: isSelected ? colors.brand : colors.surface,
                borderColor: isSelected ? colors.brand : colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              size="xs"
              weight="medium"
              style={{
                color: isSelected ? "#FFFFFF" : colors.textSecondary,
              }}
            >
              {weekday}
            </Text>
            <Text
              size="lg"
              weight="bold"
              style={{
                color: isSelected ? "#FFFFFF" : colors.textPrimary,
                letterSpacing: -0.3,
              }}
            >
              {day}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers — exported so the parent screen can compute sane defaults
// ---------------------------------------------------------------------------

/**
 * Best-guess opening selection for the picker. The "next available slot"
 * defaults follow what Zocdoc / Hotel Tonight do — land the user on
 * something tappable, not on a blank state.
 *
 * Pass `getAvailability` (typically bound to a venue id) to skip slots the
 * heuristic marks as busy. Without it the function falls back to the next
 * valid full hour today.
 */
export function defaultDateTimeSelections(
  getAvailability?: (date: Date, startTime: string) => AvailabilityBucket
): {
  date: Date;
  startTime: string;
  duration: number;
} {
  const now = new Date();
  let hour = now.getHours();
  if (now.getMinutes() > 0 || now.getSeconds() > 0) hour += 1;

  // Walk forward day-by-day (up to DATE_RAIL_DAYS) looking for the earliest
  // non-busy full-hour slot inside our 6 AM–11 PM window. Without an
  // availability function, the first iteration's first slot wins.
  const isOpen = (date: Date, hh: number): boolean => {
    const time = `${pad(hh)}:00`;
    if (!getAvailability) return true;
    return getAvailability(date, time) !== "busy";
  };

  for (let offset = 0; offset < DATE_RAIL_DAYS; offset++) {
    const date = startOfDay(addDays(now, offset));
    const startHour = offset === 0 ? Math.max(TIME_SLOT_START_HOUR, hour) : TIME_SLOT_START_HOUR;
    if (startHour > TIME_SLOT_END_HOUR) continue;
    for (let h = startHour; h <= TIME_SLOT_END_HOUR; h++) {
      if (isOpen(date, h)) {
        return { date, startTime: `${pad(h)}:00`, duration: 1 };
      }
    }
  }

  // Every slot in the picker's window is "busy" — fall back to the next
  // valid hour today so the user still lands on something selectable.
  if (hour > TIME_SLOT_END_HOUR) {
    return {
      date: startOfDay(addDays(now, 1)),
      startTime: `${pad(TIME_SLOT_START_HOUR)}:00`,
      duration: 1,
    };
  }
  return {
    date: startOfDay(now),
    startTime: `${pad(Math.max(TIME_SLOT_START_HOUR, hour))}:00`,
    duration: 1,
  };
}

function getNextDays(n: number, now: Date): Date[] {
  const today = startOfDay(now);
  return Array.from({ length: n }, (_, i) => addDays(today, i));
}

/** Next valid slot ≥ now, in HH:mm. Null when past the picker's day window. */
function nextValidSlot(now: Date): string | null {
  let hour = now.getHours();
  if (now.getMinutes() > 0 || now.getSeconds() > 0) hour += 1;
  hour = Math.max(TIME_SLOT_START_HOUR, hour);
  if (hour > TIME_SLOT_END_HOUR) return null;
  return `${pad(hour)}:00`;
}

/**
 * Lightweight clock-tick: returns a Date that updates every `intervalMs`.
 * Used to refresh date-rail labels and past-slot greying without polling
 * on every render. Falsifies the "static memo" trap when the sheet stays
 * open through a minute / midnight boundary.
 */
function useNowTick(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function groupSlotsByPeriod(): Record<Period, string[]> {
  const out: Record<Period, string[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  for (const p of PERIODS) {
    for (let h = p.range[0]; h <= p.range[1]; h++) {
      out[p.id].push(`${pad(h)}:00`);
      // No half-hour slot at 23:30 (would cross midnight on any duration).
      if (h < TIME_SLOT_END_HOUR) out[p.id].push(`${pad(h)}:30`);
    }
  }
  return out;
}

/**
 * Returns the minute-of-day threshold below which slots should be greyed.
 * For "today", that's the current hour's minute count; for future dates,
 * -1 (no greying).
 */
function pastBoundaryFor(date: Date, now: Date): number {
  if (!isSameDay(date, now)) return -1;
  return now.getHours() * 60 + now.getMinutes();
}

function timeStringToMinutes(time24: string): number {
  const [h, m] = time24.split(":").map(Number);
  return h * 60 + m;
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
  return `${hours}hr`;
}

function durationExceedsDay(startTime: string, durationHours: number): boolean {
  const [h, m] = startTime.split(":").map(Number);
  const startMinutes = h * 60 + m;
  const endMinutes = startMinutes + durationHours * 60;
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
  dateLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: spacing.lg,
  },
  calendarToggle: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarGrid: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  calendarCell: {
    // 7 cells per row → (containerWidth - 6*gap) / 7. Use percent so it
    // adapts to whatever container width the picker is rendered in.
    width: "13.5%",
    aspectRatio: 0.85,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
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
  periodsWrap: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  period: {
    gap: spacing.xs,
  },
  periodLabel: {
    marginBottom: spacing.xs,
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pill: {
    minHeight: 44,
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
  busyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  suggestionsWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  suggestionsLabel: {
    marginBottom: spacing.xs,
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  suggestionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
  },
  hint: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  endTime: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  availabilityNote: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
  },
  availabilityNoteText: {
    flex: 1,
    flexShrink: 1,
  },
  busyDotLegend: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
});
