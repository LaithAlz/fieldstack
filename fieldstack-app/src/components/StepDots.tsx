import { StyleSheet, View } from "react-native";

import { spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

type Props = {
  total: number;
  current: number; // 1-indexed
};

/**
 * Compact progress indicator: filled dot for the active step, dim dots for
 * the rest. Hidden from screen readers since the step count is repeated in
 * each screen's accessibility label.
 */
export function StepDots({ total, current }: Props) {
  const colors = useTheme();
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: total }, (_, i) => {
        const isActive = i + 1 === current;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: isActive ? colors.brand : colors.border,
                width: isActive ? 20 : 6,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
