import { StyleSheet, View } from "react-native";

import { borderRadius, spacing } from "../theme/tokens";

import { Skeleton } from "./Skeleton";

const HERO_HEIGHT = 220;
const AMENITY_CHIP_HEIGHT = 28;
const AMENITY_CHIP_RADIUS = borderRadius.xl;
const FIELD_CARD_HEIGHT = 132;

/**
 * Loading placeholder for `VenueDetailScreen`. Mirrors the loaded layout —
 * hero photo strip, title + address, amenity chip row, the "Pick a time"
 * section header + picker block, and two field cards. Same vertical
 * rhythm as the real screen so hydration is a swap, not a reflow.
 */
export function VenueDetailSkeleton() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Skeleton width="100%" height={HERO_HEIGHT} borderRadius={0} />
      <View style={styles.body}>
        <Skeleton width="70%" height={28} />
        <View style={styles.tightGap} />
        <Skeleton width="55%" height={14} />
        <View style={styles.tightGap} />
        <Skeleton width="35%" height={14} />

        {/* Amenity chips row */}
        <View style={styles.amenities}>
          <Skeleton width={72} height={AMENITY_CHIP_HEIGHT} borderRadius={AMENITY_CHIP_RADIUS} />
          <Skeleton width={88} height={AMENITY_CHIP_HEIGHT} borderRadius={AMENITY_CHIP_RADIUS} />
          <Skeleton width={64} height={AMENITY_CHIP_HEIGHT} borderRadius={AMENITY_CHIP_RADIUS} />
        </View>

        {/* "Pick a time" section header */}
        <View style={styles.section}>
          <Skeleton width={120} height={22} />
        </View>
        <Skeleton width="100%" height={88} borderRadius={borderRadius.md} />

        {/* "Available fields" section header */}
        <View style={styles.section}>
          <Skeleton width={160} height={22} />
        </View>
        <Skeleton width="100%" height={FIELD_CARD_HEIGHT} borderRadius={borderRadius.lg} />
        <View style={styles.fieldGap} />
        <Skeleton width="100%" height={FIELD_CARD_HEIGHT} borderRadius={borderRadius.lg} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    gap: 0,
  },
  tightGap: {
    height: spacing.xs,
  },
  amenities: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  fieldGap: {
    height: spacing.md,
  },
});
