import { StyleSheet, View } from "react-native";

import { fontSize, fontWeight } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

const PIN_SIZE = 32;
const PIN_SIZE_SELECTED = 40;

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
 * in `react-native-maps`'s `<Marker>` (or whatever map primitive it uses)
 * and supplies the coordinates + press handler.
 */
export function VenuePin({ fieldCount, venueName, selected = false }: Props) {
  const colors = useTheme();
  const size = selected ? PIN_SIZE_SELECTED : PIN_SIZE;
  const labelSuffix = fieldCount === 1 ? "1 field" : `${fieldCount} fields`;

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={`${venueName}, ${labelSuffix}`}
      accessibilityState={{ selected }}
      style={[
        styles.pin,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.brand,
          borderColor: selected ? colors.surface : "transparent",
          borderWidth: selected ? 3 : 0,
          // Drop shadow lifts the pin off the map so it stays readable on
          // satellite/dark map styles.
          shadowOpacity: selected ? 0.25 : 0.18,
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
        {fieldCount}
      </Text>
    </View>
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
