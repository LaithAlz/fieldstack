import { StyleSheet, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { fontSize, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

const PIN_ICON_SIZE = 32;
const PRICE_HEIGHT = 30;
const SELECTED_SIZE = 46;
const FREE_DOT_SIZE = 14;
// REQ-F0.2 — minimum touch target. The dot itself stays its small visual
// size; only the invisible hit area around it grows.
const FREE_HIT_AREA_SIZE = 44;

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

type FreeProps = {
  mode: "free";
  /** Used only for the screen-reader label. */
  fieldCount?: number;
};

type SelectedProps = {
  mode: "selected";
};

type Props = {
  venueName: string;
} & (CountProps | PriceProps | FreeProps | SelectedProps);

/**
 * Map pin — four modes:
 *   - `count`: brand teardrop pin (Ionicons location-sharp). No number;
 *     field count lives in the bottom card after tapping. Fallback for a
 *     venue whose pricing is simply unknown (not free, not priced — see
 *     `isFreeVenue` in lib/filters).
 *   - `price`: condensed-numeral pill reading "From $N" — the lowest price
 *     at the venue.
 *   - `free`: a small solid dot in the success-green family, ringed so it
 *     lifts off the map — for venues `isFreeVenue` calls FREE.
 *   - `selected`: a bold, brand-FILLED disc with a white centre — the
 *     unmistakable "this one" marker. Rendered by a single dedicated
 *     selection marker that's always mounted and only moved/faded, so its
 *     content never changes and `tracksViewChanges={false}` stays safe.
 *
 * The base price/free/count pins are intentionally static (no selected
 * styling of their own): repainting a custom-view marker would require
 * flipping tracksViewChanges, which crashes under the Expo Go 54 Fabric
 * interop. The separate filled `selected` marker sits on top of the chosen
 * pin instead — this is why it can't show the venue's own price digits (its
 * content must never vary per-selection under a frozen-snapshot marker).
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
    const label = `From $${Math.round(props.price)}`;
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
            backgroundColor: colors.surfaceElevated,
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

  if (props.mode === "free") {
    const a11y = [
      props.venueName,
      "Free to play",
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
        style={styles.freeHitArea}
      >
        <View
          style={[
            styles.freeDot,
            {
              backgroundColor: colors.success,
              borderColor: colors.surfaceElevated,
            },
          ]}
        />
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
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    shadowOpacity: 0.22,
    elevation: 4,
  },
  // Transparent 44x44 hit area, dot bottom-centered inside it. Markers
  // anchor at bottom-center by default (see VenueMarkerSlot) — centering the
  // dot vertically in a taller box would shift the visible dot away from the
  // pin's actual map coordinate, so it's pinned to the bottom edge instead:
  // same visual position as the old bare 14x14 dot, just a bigger invisible
  // pressable frame around it.
  freeHitArea: {
    width: FREE_HIT_AREA_SIZE,
    height: FREE_HIT_AREA_SIZE,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  freeDot: {
    width: FREE_DOT_SIZE,
    height: FREE_DOT_SIZE,
    borderRadius: FREE_DOT_SIZE / 2,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.25,
    elevation: 3,
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
