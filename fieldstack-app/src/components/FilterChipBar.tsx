import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { PRICE_OPTIONS, priceMaxToBucket, sortLabel } from "../lib/filters";
import { selection } from "../lib/haptics";
import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { FieldSearchFilters, SetFilter } from "../hooks/useFieldSearch";

import { FilterChip } from "./FilterChip";
import { Text } from "./Text";

type Props = {
  filters: FieldSearchFilters;
  setFilter: SetFilter;
  onOpenSurface: () => void;
  onOpenSize: () => void;
  onOpenPrice: () => void;
  onOpenSort: () => void;
  /** Optional extra styling for the horizontal scroll wrapper. */
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Filter chips (Surface / Size / Price) on the left, Sort control on the
 * right separated by a vertical divider. Sort is intentionally a different
 * visual treatment — a small icon button with a leading "swap" glyph — so it
 * doesn't read as another filter pill. The chips scroll horizontally
 * underneath; Sort stays anchored on the right.
 *
 * Picker sheets live separately so they can be mounted at the screen root
 * (see `useFilterControls`). That hook is the canonical way to consume this
 * component: it returns these props plus the sheets element to render.
 */
export function FilterChipBar({
  filters,
  setFilter,
  onOpenSurface,
  onOpenSize,
  onOpenPrice,
  onOpenSort,
  contentStyle,
}: Props) {
  const colors = useTheme();
  const priceBucket = useMemo(
    () => priceMaxToBucket(filters.priceMax),
    [filters.priceMax]
  );

  const priceLabel =
    PRICE_OPTIONS.find((o) => o.id === priceBucket)?.label ?? "Price";

  const sortActive = filters.sort !== "distance";

  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // delaysContentTouches defaults to true on iOS — that holds taps for
        // ~150ms while the ScrollView decides "pan or tap", and the Pressable's
        // tap resolution gets eaten inside that window. Disable so chip taps
        // fire instantly. Horizontal pans still work via the ScrollView's own
        // pan recognizer running in parallel.
        //
        // Cast through `as any` — the prop is iOS-specific and works at
        // runtime, but it's missing from RN 0.81's TS types.
        {...({ delaysContentTouches: false } as any)}
        style={styles.scroll}
        contentContainerStyle={[styles.chips, contentStyle]}
      >
        <FilterChip
          label="Surface"
          isActive={filters.surface.length > 0}
          count={filters.surface.length}
          onPress={onOpenSurface}
          onClear={() => setFilter("surface", [])}
        />
        <FilterChip
          label="Size"
          isActive={filters.size.length > 0}
          count={filters.size.length}
          onPress={onOpenSize}
          onClear={() => setFilter("size", [])}
        />
        <FilterChip
          label={priceBucket === "any" ? "Price" : priceLabel}
          isActive={priceBucket !== "any"}
          onPress={onOpenPrice}
          onClear={() => setFilter("priceMax", null)}
        />
      </ScrollView>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

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
          styles.sortBtn,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
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
          numberOfLines={1}
          style={[
            styles.sortLabel,
            { color: sortActive ? colors.brand : colors.textPrimary },
          ]}
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
    alignItems: "center",
  },
  scroll: {
    flex: 1,
  },
  chips: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    marginHorizontal: spacing.sm,
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sortLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    marginLeft: 4,
  },
});
