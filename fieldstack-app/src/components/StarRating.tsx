import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { selection } from "../lib/haptics";
import { spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

const STARS = [1, 2, 3, 4, 5] as const;

type DisplayProps = {
  /** Average rating (may be fractional). Renders half-stars at .25–.74. */
  value: number;
  size?: number;
  interactive?: false;
};

type InteractiveProps = {
  value: number;
  size?: number;
  interactive: true;
  onChange: (next: number) => void;
};

type Props = DisplayProps | InteractiveProps;

/**
 * 5-star widget. Display mode renders a row of solid / half / outline stars
 * based on the fractional `value`. Interactive mode renders 5 tappable
 * Pressables that call `onChange(1..5)`.
 *
 * Half-stars use Ionicons' `star-half` glyph; values between .25 and .74 of
 * a unit round to half. Below .25 stays empty, .75+ rounds up to full.
 */
export function StarRating(props: Props) {
  const colors = useTheme();
  const size = props.size ?? 18;
  const interactive = props.interactive === true;

  if (interactive) {
    const onChange = props.onChange;
    return (
      <View
        style={styles.row}
        accessibilityRole="radiogroup"
        accessibilityLabel={`Rating, ${props.value} of 5`}
      >
        {STARS.map((n) => {
          const filled = n <= props.value;
          return (
            <Pressable
              key={n}
              onPress={() => {
                selection();
                onChange(n);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: filled }}
              accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
              hitSlop={spacing.xs}
              style={({ pressed }) => [
                styles.star,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons
                name={filled ? "star" : "star-outline"}
                size={size + 6}
                color={colors.brand}
              />
            </Pressable>
          );
        })}
      </View>
    );
  }

  // Display mode — derive glyph per position from the fractional value.
  return (
    <View
      style={styles.row}
      accessibilityLabel={`Rated ${props.value.toFixed(1)} out of 5`}
    >
      {STARS.map((n) => {
        const diff = props.value - (n - 1);
        let glyph: "star" | "star-half" | "star-outline";
        if (diff >= 0.75) glyph = "star";
        else if (diff >= 0.25) glyph = "star-half";
        else glyph = "star-outline";
        return (
          <Ionicons
            key={n}
            name={glyph}
            size={size}
            color={colors.brand}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
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
    gap: 2,
  },
  star: {
    padding: spacing.xs,
  },
});
