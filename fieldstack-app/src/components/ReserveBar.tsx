import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Button } from "./Button";
import { Text } from "./Text";

type Props = {
  /** Left-side price context — condensed price text, <FreeBadge/>, or a "Rates on site" label. */
  priceLabel: ReactNode;
  /** "Field A · Today · 7 PM – 8:30 PM" once a preferred slot is set. */
  subline?: string | null;
  /** Tapping the price block opens the slot picker. Omit when there's no field to book yet. */
  onPress?: () => void;
  actionLabel: string;
  onActionPress: () => void;
  /**
   * True while `onActionPress`'s booking redirect is in flight. Shows the
   * primary action's spinner and disables it — without this, a fast double
   * tap fires `openOperatorBooking` twice, which logs two booking-history
   * rows and schedules two reminders for what was one tap's worth of intent.
   */
  loading?: boolean;
};

/**
 * Sticky "Airbnb reserve bar": price context (with a tap-to-set preferred-
 * slot subline) on the left, one unmissable primary action on the right.
 * Shared by VenueDetail (venue-level — the cheapest bookable field) and
 * FieldDetail (a single field) so the pattern, and its safe-area handling,
 * stays identical everywhere it appears.
 */
export function ReserveBar({
  priceLabel,
  subline,
  onPress,
  actionLabel,
  onActionPress,
  loading = false,
}: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.surfaceElevated,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + spacing.sm,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={
          onPress ? (subline ? `Preferred time ${subline}. Tap to change.` : "Set a preferred time") : undefined
        }
        style={({ pressed }) => [styles.priceBlock, { opacity: onPress && pressed ? 0.7 : 1 }]}
      >
        {priceLabel}
        {subline ? (
          <Text size="xs" variant="secondary" numberOfLines={1} style={styles.subline}>
            {subline}
          </Text>
        ) : null}
      </Pressable>
      <Button
        label={actionLabel}
        onPress={onActionPress}
        loading={loading}
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  priceBlock: {
    flex: 1,
    minHeight: 44, // REQ-F0.2 — minimum touch target, even for a bare FreeBadge with no subline
    justifyContent: "center",
    borderRadius: borderRadius.md,
  },
  subline: {
    marginTop: 2,
  },
  action: {
    paddingHorizontal: spacing.xl,
  },
});
