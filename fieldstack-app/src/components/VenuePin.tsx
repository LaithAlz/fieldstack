import { StyleSheet, View } from "react-native";

import { fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

const COUNT_SIZE = 32;
const COUNT_SIZE_SELECTED = 40;
const PRICE_HEIGHT = 30;
const PRICE_HEIGHT_SELECTED = 36;

type CountProps = {
  mode: "count";
  fieldCount: number;
};

type PriceProps = {
  mode: "price";
  /** Per-hour price in whole dollars. */
  price: number;
  /** Optional field count — used only for the screen-reader label. */
  fieldCount?: number;
};

type CommonProps = {
  /** Used in the SR label only. */
  venueName: string;
  selected?: boolean;
};

type Props = CommonProps & (CountProps | PriceProps);

/**
 * Map pin with two render modes:
 *   - `count`: small circle showing the number of fields at the venue
 *   - `price`: pill showing "$X" (lowest-priced field at the venue)
 *
 * Selection feedback is a direct size + border/shadow change — NOT a transform
 * animation. Animating transform.scale on a Marker's content races with
 * react-native-maps's tracksViewChanges snapshot logic: while the spring runs,
 * the native marker can re-snapshot mid-frame and end up drawing at the
 * transformed origin, which manifests as the pin briefly vanishing or
 * jumping to the corner of the screen on tap.
 */
export function VenuePin(props: Props) {
  const colors = useTheme();
  const selected = props.selected ?? false;

  if (props.mode === "price") {
    const label = `$${Math.round(props.price)}`;
    const a11y = [
      props.venueName,
      label + " per hour",
      props.fieldCount ? `${props.fieldCount} ${props.fieldCount === 1 ? "field" : "fields"}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <View
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ selected }}
        style={[
          styles.pricePill,
          {
            height: selected ? PRICE_HEIGHT_SELECTED : PRICE_HEIGHT,
            paddingHorizontal: selected ? spacing.md : spacing.sm + 2,
            backgroundColor: selected ? colors.textPrimary : colors.surface,
            borderColor: selected ? colors.textPrimary : colors.border,
            shadowOpacity: selected ? 0.3 : 0.22,
          },
        ]}
      >
        <Text
          style={{
            color: selected ? colors.surface : colors.textPrimary,
            fontSize: selected ? fontSize.md : fontSize.sm,
            fontWeight: fontWeight.bold,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    );
  }

  const labelSuffix =
    props.fieldCount === 1 ? "1 field" : `${props.fieldCount} fields`;
  const size = selected ? COUNT_SIZE_SELECTED : COUNT_SIZE;
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={`${props.venueName}, ${labelSuffix}`}
      accessibilityState={{ selected }}
      style={[
        styles.countPin,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.brand,
          borderColor: selected ? colors.surface : "transparent",
          borderWidth: selected ? 3 : 0,
          shadowOpacity: selected ? 0.3 : 0.18,
        },
      ]}
    >
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: selected ? fontSize.md : fontSize.sm,
          fontWeight: fontWeight.bold,
        }}
      >
        {props.fieldCount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  countPin: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
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
    elevation: 4,
  },
});
