/**
 * Compact toolbar replacing the old per-attribute FilterChipBar.
 *
 *   [ Filters (N) ]   [ ⇅ Sort: <label> ]
 *
 * Filters opens the combined FiltersSheet; Sort opens the single-select
 * sort picker via the existing FilterBottomSheet flow (unchanged from
 * useFilterControls). Both buttons are right-anchored — there's no full-width
 * scroll row anymore, so the rest of the screen breathes.
 */

import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { selection } from "../lib/haptics";
import { sortLabel } from "../lib/filters";
import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { FieldSearchFilters } from "../hooks/useFieldSearch";

import { Text } from "./Text";

type Props = {
  filters: FieldSearchFilters;
  onOpenFilters: () => void;
  onOpenSort: () => void;
};

export function FilterToolbar({ filters, onOpenFilters, onOpenSort }: Props) {
  const colors = useTheme();

  // Count of active filter categories (not options). Surface=[turf,grass]
  // is one active category, not two. Matches the "N filters applied"
  // mental model.
  const activeCount =
    (filters.surface.length > 0 ? 1 : 0) +
    (filters.size.length > 0 ? 1 : 0) +
    (filters.venueType.length > 0 ? 1 : 0) +
    (filters.priceMax !== null ? 1 : 0);
  const filtersActive = activeCount > 0;
  const sortActive = filters.sort !== "distance";

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          selection();
          onOpenFilters();
        }}
        accessibilityRole="button"
        accessibilityLabel={
          activeCount > 0 ? `Filters, ${activeCount} active` : "Filters"
        }
        hitSlop={spacing.xs}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: colors.surface,
            borderColor: filtersActive ? colors.brand : colors.border,
            borderWidth: filtersActive ? 1.5 : StyleSheet.hairlineWidth,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Ionicons
          name="options-outline"
          size={18}
          color={filtersActive ? colors.brand : colors.textPrimary}
        />
        <Text
          style={[
            styles.label,
            { color: filtersActive ? colors.brand : colors.textPrimary },
          ]}
        >
          {activeCount > 0 ? `Filters · ${activeCount}` : "Filters"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          selection();
          onOpenSort();
        }}
        accessibilityRole="button"
        accessibilityLabel={
          sortActive ? `Sort: ${sortLabel(filters.sort)}` : "Sort"
        }
        hitSlop={spacing.xs}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Ionicons
          name="swap-vertical"
          size={18}
          color={sortActive ? colors.brand : colors.textPrimary}
        />
        <Text
          style={[
            styles.label,
            { color: sortActive ? colors.brand : colors.textPrimary },
          ]}
          numberOfLines={1}
        >
          {sortActive ? sortLabel(filters.sort) : "Sort"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.sm,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: borderRadius.md,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    marginLeft: 4,
  },
});
