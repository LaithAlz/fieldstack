import { StyleSheet, View } from "react-native";

import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Skeleton } from "./Skeleton";

const PHOTO_SIZE = 80;
const BADGE_HEIGHT = 18;
const BADGE_RADIUS = borderRadius.sm;

/**
 * Loading placeholder for `FieldSearchCard`. Mirrors the card's geometry so
 * the swap from skeleton → real data doesn't reflow the layout.
 */
export function FieldSearchCardSkeleton() {
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
        <View>
          <Skeleton width="65%" height={16} />
          <View style={styles.spacer} />
          <Skeleton width="45%" height={12} />
        </View>
        <View style={styles.badges}>
          <Skeleton width={48} height={BADGE_HEIGHT} borderRadius={BADGE_RADIUS} />
          <Skeleton width={40} height={BADGE_HEIGHT} borderRadius={BADGE_RADIUS} />
        </View>
        <View style={styles.metaRow}>
          <Skeleton width={64} height={12} />
          <Skeleton width={56} height={14} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    minHeight: 44,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  body: {
    flex: 1,
    justifyContent: "space-between",
  },
  spacer: {
    height: spacing.xs,
  },
  badges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
});
