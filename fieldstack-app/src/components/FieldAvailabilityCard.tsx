import { Pressable, StyleSheet, View } from "react-native";

import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Field, FieldSize, FieldSurface } from "../types/api";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { Text } from "./Text";

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
  "3v3": "3-a-side",
  futsal: "Futsal",
};

type Props = {
  field: Field;
  /** Currently-selected date from the parent's date picker. */
  selectedDate: Date;
  /** Currently-selected start time, "HH:mm". */
  selectedTime: string;
  /** Tap on the card body — parent navigates to Field Detail. */
  onCardPress: () => void;
  /** Tap on the Book button — parent opens the BookingBottomSheet. */
  onBookPress: () => void;
};

/**
 * Two distinct tap zones: the body is a Pressable that navigates to the
 * Field Detail screen; the Book button is a sibling (not nested) so its
 * tap can never bubble up as a card-press. Both targets clear 44pt.
 */
export function FieldAvailabilityCard({
  field,
  selectedDate,
  selectedTime,
  onCardPress,
  onBookPress,
}: Props) {
  const colors = useTheme();
  const priceText = formatPrice(field.price_per_hour);
  const dateText = formatDateShort(selectedDate);
  const timeText = formatTime(selectedTime);

  const cardA11y = `${field.name}, ${SURFACE_LABEL[field.surface]}, ${SIZE_LABEL[field.size]}, ${priceText}`;
  const bookA11yHint = `Open booking for ${dateText} at ${timeText}`;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Pressable
        onPress={onCardPress}
        accessibilityRole="button"
        accessibilityLabel={cardA11y}
        accessibilityHint="Open field details"
        style={({ pressed }) => [styles.body, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text size="md" weight="medium">
          {field.name}
        </Text>
        <View style={styles.badges}>
          <Badge label={SURFACE_LABEL[field.surface]} />
          <Badge label={SIZE_LABEL[field.size]} />
        </View>
        <Text size="md" weight="medium" variant="secondary">
          {priceText}
        </Text>
      </Pressable>

      <View style={styles.action}>
        <Button
          label="Book"
          onPress={onBookPress}
          accessibilityHint={bookA11yHint}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inline formatters — minimal duplicates of helpers in DateTimeRangePicker.
// Will move to lib/datetime.ts once a third caller appears (F5.3 likely).
// ---------------------------------------------------------------------------

function formatPrice(pricePerHour: number | null): string {
  if (pricePerHour === null) return "Price varies";
  return `$${Math.round(pricePerHour)}/hr`;
}

function formatTime(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const hour12 = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  if (m === 0) return `${hour12} ${ampm}`;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDateShort(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return target.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  body: {
    flex: 1,
    gap: spacing.xs + 2,
    minHeight: 44,
    justifyContent: "center",
  },
  badges: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  action: {
    minWidth: 96,
  },
});
