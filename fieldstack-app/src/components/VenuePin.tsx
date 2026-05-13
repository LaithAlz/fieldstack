import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

import { fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

const COUNT_SIZE = 32;
const COUNT_SIZE_SELECTED = 40;
const COUNT_SCALE = COUNT_SIZE_SELECTED / COUNT_SIZE;

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
 * The price pill is the Airbnb-style affordance; the count circle remains as
 * a fallback for venues whose fields have no price. Selection grows both via
 * a spring animation so the active pin reads as alive on the native marker.
 */
export function VenuePin(props: Props) {
  const colors = useTheme();
  const selected = props.selected ?? false;
  const scale = useRef(new Animated.Value(selected ? COUNT_SCALE : 1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: selected ? COUNT_SCALE : 1,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  }, [selected, scale]);

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
      <Animated.View
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ selected }}
        style={[
          styles.pricePill,
          {
            backgroundColor: selected ? colors.textPrimary : colors.surface,
            borderColor: selected ? colors.textPrimary : colors.border,
            transform: [{ scale }],
          },
        ]}
      >
        <Text
          style={{
            color: selected ? colors.surface : colors.textPrimary,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.bold,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    );
  }

  const labelSuffix =
    props.fieldCount === 1 ? "1 field" : `${props.fieldCount} fields`;
  return (
    <Animated.View
      accessibilityRole="button"
      accessibilityLabel={`${props.venueName}, ${labelSuffix}`}
      accessibilityState={{ selected }}
      style={[
        styles.countPin,
        {
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
        {props.fieldCount}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  countPin: {
    width: COUNT_SIZE,
    height: COUNT_SIZE,
    borderRadius: COUNT_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  pricePill: {
    minWidth: 48,
    height: 30,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
});
