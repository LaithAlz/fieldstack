import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

import { fontSize, fontWeight } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

const PIN_SIZE = 32;
const PIN_SIZE_SELECTED = 40;
const SCALE_RATIO = PIN_SIZE_SELECTED / PIN_SIZE;

type Props = {
  /** Field count rendered inside the pin. */
  fieldCount: number;
  /** Venue name — used for the screen-reader label only. */
  venueName: string;
  /** Larger size + outer border when true. Defaults to false. */
  selected?: boolean;
};

/**
 * Map marker visual for a venue. Pure presentational — the parent wraps it
 * in `react-native-maps`'s `<Marker>`. Selection animates the scale with a
 * spring rather than jumping sizes, so the active pin reads as alive.
 */
export function VenuePin({ fieldCount, venueName, selected = false }: Props) {
  const colors = useTheme();
  const scale = useRef(new Animated.Value(selected ? SCALE_RATIO : 1)).current;
  const labelSuffix = fieldCount === 1 ? "1 field" : `${fieldCount} fields`;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: selected ? SCALE_RATIO : 1,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  }, [selected, scale]);

  return (
    <Animated.View
      accessibilityRole="button"
      accessibilityLabel={`${venueName}, ${labelSuffix}`}
      accessibilityState={{ selected }}
      style={[
        styles.pin,
        {
          width: PIN_SIZE,
          height: PIN_SIZE,
          borderRadius: PIN_SIZE / 2,
          backgroundColor: colors.brand,
          borderColor: selected ? colors.surface : "transparent",
          borderWidth: selected ? 3 : 0,
          shadowOpacity: selected ? 0.3 : 0.18,
          transform: [{ scale }],
        },
      ]}
    >
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
        }}
      >
        {fieldCount}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pin: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
});
