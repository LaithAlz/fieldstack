import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type AmenityMeta = { icon: IconName; label: string };

/**
 * Known amenities → their icon + display label. Keys match the strings the
 * seed script writes to `venues.amenities`. Unknown keys fall through to a
 * humanized version of the key with a generic check-circle icon.
 */
const AMENITY_MAP: Record<string, AmenityMeta> = {
  parking: { icon: "car-outline", label: "Parking" },
  change_rooms: { icon: "shirt-outline", label: "Change rooms" },
  changerooms: { icon: "shirt-outline", label: "Change rooms" },
  lights: { icon: "bulb-outline", label: "Lighting" },
  lighting: { icon: "bulb-outline", label: "Lighting" },
  washrooms: { icon: "water-outline", label: "Washrooms" },
  indoor: { icon: "home-outline", label: "Indoor" },
  concessions: { icon: "fast-food-outline", label: "Concessions" },
  wifi: { icon: "wifi", label: "Wi-Fi" },
  seating: { icon: "people-outline", label: "Seating" },
  track: { icon: "trail-sign-outline", label: "Track" },
};

type Props = {
  /** Amenity key from `venues.amenities[]`. */
  amenity: string;
};

export function AmenityChip({ amenity }: Props) {
  const colors = useTheme();
  const { icon, label } = lookup(amenity);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}
    >
      <Ionicons
        name={icon}
        size={14}
        color={colors.textSecondary}
        style={styles.icon}
        // Decorative — label already announces the meaning.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text size="sm" weight="medium" variant="secondary">
        {label}
      </Text>
    </View>
  );
}

function lookup(key: string): AmenityMeta {
  const normalized = key.toLowerCase();
  return (
    AMENITY_MAP[normalized] ?? {
      icon: "checkmark-circle-outline",
      label: humanize(key),
    }
  );
}

function humanize(key: string): string {
  if (!key) return "";
  const spaced = key.replace(/_/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
    alignSelf: "flex-start",
  },
  icon: {
    marginRight: spacing.xs + 2,
  },
});
