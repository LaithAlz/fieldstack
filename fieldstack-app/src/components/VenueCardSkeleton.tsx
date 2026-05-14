import { StyleSheet, View } from "react-native";

import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Skeleton } from "./Skeleton";

const PHOTO_SIZE = 96;
const BADGE_HEIGHT = 18;
const BADGE_RADIUS = borderRadius.sm;

/**
 * Loading placeholder for `VenueCard`. Mirrors the card's geometry — same
 * photo size, border, spacing, body layout — so when the real card hydrates,
 * the eye doesn't have to reparse a different layout. Pulse comes from the
 * underlying `Skeleton` primitive.
 */
export function VenueCardSkeleton() {
  const colors = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Skeleton width={PHOTO_SIZE} height={PHOTO_SIZE} borderRadius={borderRadius.md} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Skeleton width="60%" height={18} />
          <Skeleton width={56} height={14} />
        </View>
        <Skeleton width="80%" height={14} />
        <View style={styles.badges}>
          <Skeleton width={48} height={BADGE_HEIGHT} borderRadius={BADGE_RADIUS} />
          <Skeleton width={56} height={BADGE_HEIGHT} borderRadius={BADGE_RADIUS} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.xs + 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  badges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: 2,
  },
});
