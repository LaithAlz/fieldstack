import { StyleSheet, View } from "react-native";

import { borderRadius, spacing } from "../theme/tokens";

import { Skeleton } from "./Skeleton";

const HERO_HEIGHT = 220;
const BADGE_HEIGHT = 22;
const BADGE_RADIUS = borderRadius.sm;
const SPEC_ROW_HEIGHT = 44;

/**
 * Loading placeholder for `FieldDetailScreen`. Matches the loaded shape: hero
 * photo, field name, surface/size badge pair, venue link row, price chip, and
 * the four-row "Field specs" card.
 */
export function FieldDetailSkeleton() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Skeleton width="100%" height={HERO_HEIGHT} borderRadius={0} />
      <View style={styles.body}>
        <Skeleton width="70%" height={28} />

        {/* Surface + size badges */}
        <View style={styles.badges}>
          <Skeleton width={60} height={BADGE_HEIGHT} borderRadius={BADGE_RADIUS} />
          <Skeleton width={48} height={BADGE_HEIGHT} borderRadius={BADGE_RADIUS} />
        </View>

        {/* Venue link row */}
        <View style={styles.venueLink}>
          <Skeleton width="55%" height={16} />
          <Skeleton width={16} height={16} borderRadius={borderRadius.sm} />
        </View>

        {/* Price */}
        <View style={styles.price}>
          <Skeleton width={120} height={36} />
        </View>

        {/* Field specs section header + card */}
        <View style={styles.section}>
          <Skeleton width={120} height={22} />
        </View>
        <View style={styles.specs}>
          <Skeleton width="100%" height={SPEC_ROW_HEIGHT} />
          <Skeleton width="100%" height={SPEC_ROW_HEIGHT} />
          <Skeleton width="100%" height={SPEC_ROW_HEIGHT} />
          <Skeleton width="100%" height={SPEC_ROW_HEIGHT} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
  },
  badges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  venueLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  price: {
    marginTop: spacing.lg,
  },
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  specs: {
    gap: spacing.xs,
  },
});
