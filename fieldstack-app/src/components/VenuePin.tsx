import { StyleSheet, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

const PIN_ICON_SIZE = 32;
const PRICE_HEIGHT = 30;

type CountProps = {
  mode: "count";
  fieldCount: number;
};

type PriceProps = {
  mode: "price";
  /** Per-hour price in whole dollars. */
  price: number;
  /** Used only for the screen-reader label. */
  fieldCount?: number;
};

type Props = {
  venueName: string;
} & (CountProps | PriceProps);

/**
 * Map pin — two modes:
 *   - `count`: green teardrop pin (Ionicons location-sharp). No number;
 *     field count lives in the bottom card after tapping.
 *   - `price`: white pill showing "$X" (lowest price at the venue).
 *
 * No `selected` prop — pin appearance is static. Selection feedback comes
 * from the bottom card sliding up, which avoids any need to re-snapshot
 * the marker (the root cause of the pin-glitch/disappear bug).
 */
export function VenuePin(props: Props) {
  const colors = useTheme();

  if (props.mode === "price") {
    const label = `$${Math.round(props.price)}`;
    const a11y = [
      props.venueName,
      label + " per hour",
      props.fieldCount
        ? `${props.fieldCount} ${props.fieldCount === 1 ? "field" : "fields"}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <View
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={[
          styles.pricePill,
          {
            height: PRICE_HEIGHT,
            paddingHorizontal: spacing.sm + 2,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.bold,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={`${props.venueName}, ${props.fieldCount === 1 ? "1 field" : `${props.fieldCount} fields`}`}
      style={styles.pinWrapper}
    >
      <Ionicons
        name="location-sharp"
        size={PIN_ICON_SIZE}
        color={colors.brand}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrapper: {
    alignItems: "center",
    justifyContent: "center",
    // Shadow sits behind the icon — gives it a slight lift off the map.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.25,
    elevation: 4,
  },
  pricePill: {
    minWidth: 48,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    shadowOpacity: 0.22,
    elevation: 4,
  },
});
