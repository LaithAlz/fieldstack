import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";

import { borderRadius, fontSize, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

/**
 * "FREE" pill for Explore cards — a foil-gradient badge (foilA → foilB,
 * `onFoil` ink) so a $0 venue reads as a small win rather than just an
 * absence of a price. Small caps, matches the mockup's `.freetag`.
 */
export function FreeBadge() {
  const colors = useTheme();
  return (
    <LinearGradient
      colors={[colors.foilA, colors.foilB]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.badge}
    >
      <Text
        style={{
          color: colors.onFoil,
          fontSize: fontSize.xs,
          fontWeight: "800",
          letterSpacing: 0.8,
        }}
      >
        FREE
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    alignSelf: "flex-start",
  },
});
