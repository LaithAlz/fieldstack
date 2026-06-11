import { StyleSheet, View } from "react-native";

import { useTheme } from "../theme/useTheme";

type Props = {
  /** Number of alternating mow bands across the parent's height. */
  bands?: number;
  /** Band opacity. Keep faint — this is texture, not pattern. */
  intensity?: number;
};

/**
 * Mowed-pitch stripes — alternating faint bands of brand green, like a
 * freshly cut field seen from the stands. Absolutely fills its parent and
 * ignores touches; purely atmospheric, so it's hidden from accessibility.
 *
 * Place as the first child of a relatively-positioned container:
 *
 *   <View style={styles.header}>
 *     <PitchStripes />
 *     ...content...
 *   </View>
 */
export function PitchStripes({ bands = 6, intensity = 0.05 }: Props) {
  const colors = useTheme();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.wrap]}
    >
      {Array.from({ length: bands }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            backgroundColor: i % 2 === 0 ? colors.brand : "transparent",
            opacity: intensity,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
});
