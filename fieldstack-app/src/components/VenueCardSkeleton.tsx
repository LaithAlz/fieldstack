import { StyleSheet, View } from "react-native";

import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Skeleton } from "./Skeleton";

const PHOTO_HEIGHT = 148;
const BADGE_HEIGHT = 18;
const BADGE_RADIUS = borderRadius.sm;

/**
 * Loading placeholder for `VenueCard`. Mirrors the card's geometry — same
 * full-bleed photo block, body layout, and badge row — so when the real card
 * hydrates, the eye doesn't have to reparse a different layout. Pulse comes
 * from the underlying `Skeleton` primitive.
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
      <Skeleton width="100%" height={PHOTO_HEIGHT} borderRadius={0} />
      <View style={styles.body}>
        <Skeleton width="60%" height={18} />
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
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  body: {
    padding: spacing.md,
    gap: spacing.xs + 2,
  },
  badges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: 2,
  },
});
