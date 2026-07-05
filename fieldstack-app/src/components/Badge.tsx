import { StyleSheet, View } from "react-native";

import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

export type BadgeVariant = "neutral" | "brand" | "success" | "amber" | "tertiary";

type Props = {
  label: string;
  variant?: BadgeVariant;
};

/**
 * Compact pill for surface, size, amenity, or status labels. Uses tinted
 * backgrounds so multiple badges in a row stay legible without heavy borders.
 */
export function Badge({ label, variant = "neutral" }: Props) {
  const colors = useTheme();

  const tintMap = {
    neutral: { bg: colors.surfaceSecondary, fg: colors.textSecondary },
    // ~16% opacity tint of brand/success/amber on the surface — works in
    // both schemes.
    brand: { bg: colors.brand + "29", fg: colors.brand },
    success: { bg: colors.success + "29", fg: colors.success },
    amber: { bg: colors.amber + "29", fg: colors.amber },
    // Muted/inactive status (declined, cancelled) — no tint, just secondary
    // ink on the neutral surface so it visually recedes vs. the live states.
    tertiary: { bg: colors.surfaceSecondary, fg: colors.textTertiary },
  } as const;

  const { bg, fg } = tintMap[variant];

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text
        style={{
          color: fg,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.medium,
          textTransform: "uppercase",
          letterSpacing: 0.7,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    alignSelf: "flex-start",
  },
});
