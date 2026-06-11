import { StyleSheet, View } from "react-native";

import { useTheme } from "../theme/useTheme";

type Props = {
  /** Vertical lines across the width. */
  cols?: number;
  /** Horizontal lines across the height. */
  rows?: number;
  /** Line opacity. Keep faint — this is texture, not pattern. */
  intensity?: number;
  /** Line color. Defaults to the theme's hero paper; pass brand on light surfaces. */
  color?: string;
};

/**
 * Goal-net texture — a faint grid of hairlines, like looking through the
 * back of the net. Absolutely fills its parent and ignores touches; purely
 * atmospheric, so it's hidden from accessibility.
 *
 * Place as the first child of a relatively-positioned container:
 *
 *   <View style={styles.hero}>
 *     <GoalNet />
 *     ...content...
 *   </View>
 */
export function GoalNet({ cols = 12, rows = 7, intensity = 0.08, color }: Props) {
  const colors = useTheme();
  const line = color ?? colors.onHero;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.wrap, { opacity: intensity }]}
    >
      {Array.from({ length: cols }, (_, i) => (
        <View
          key={`c${i}`}
          style={[
            styles.vLine,
            { left: `${((i + 1) * 100) / (cols + 1)}%`, backgroundColor: line },
          ]}
        />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={`r${i}`}
          style={[
            styles.hLine,
            { top: `${((i + 1) * 100) / (rows + 1)}%`, backgroundColor: line },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
  vLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  hLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
