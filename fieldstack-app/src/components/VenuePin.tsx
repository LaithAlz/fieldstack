import { StyleSheet, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { fontSize, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

const PIN_ICON_SIZE = 32;
const PRICE_HEIGHT = 30;
const SELECTED_SIZE = 46;

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

type SelectedProps = {
  mode: "selected";
};

type Props = {
  venueName: string;
} & (CountProps | PriceProps | SelectedProps);

/**
 * Map pin — three modes:
 *   - `count`: brand teardrop pin (Ionicons location-sharp). No number;
 *     field count lives in the bottom card after tapping.
 *   - `price`: paper pill showing "$X" (lowest price at the venue).
 *   - `selected`: a bold, brand-FILLED disc with a white centre — the
 *     unmistakable "this one" marker. Rendered by a single dedicated
 *     selection marker that's always mounted and only moved/faded, so its
 *     content never changes and `tracksViewChanges={false}` stays safe.
 *
 * The base price/count pins are intentionally static (no selected styling
 * of their own): repainting a custom-view marker would require flipping
 * tracksViewChanges, which crashes under the Expo Go 54 Fabric interop. The
 * separate filled `selected` marker sits on top of the chosen pin instead.
 */
export function VenuePin(props: Props) {
  const colors = useTheme();

  if (props.mode === "selected") {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.selected,
          {
            width: SELECTED_SIZE,
            height: SELECTED_SIZE,
            borderRadius: SELECTED_SIZE / 2,
            backgroundColor: colors.brand,
            borderColor: colors.onBrand,
          },
        ]}
      >
        <Ionicons name="football" size={22} color={colors.onBrand} />
      </View>
    );
  }

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
          font="display"
          style={{
            color: colors.textPrimary,
            fontSize: fontSize.md,
            letterSpacing: 0.3,
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
  selected: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    shadowOpacity: 0.35,
    elevation: 8,
  },
});
