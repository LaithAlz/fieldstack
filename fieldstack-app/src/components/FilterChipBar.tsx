import { useMemo } from "react";
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { PRICE_OPTIONS, priceMaxToBucket, sortLabel } from "../lib/filters";
import { spacing } from "../theme/tokens";
import type { FieldSearchFilters, SetFilter } from "../hooks/useFieldSearch";

import { FilterChip } from "./FilterChip";

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
 * Surface / Size / Price filter chip row. Pure UI — the picker sheets live
 * separately so they can be mounted at the screen root (see
 * `useFilterControls`). That hook is the canonical way to consume this
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
  const priceBucket = useMemo(
    () => priceMaxToBucket(filters.priceMax),
    [filters.priceMax]
  );

  const priceLabel =
    PRICE_OPTIONS.find((o) => o.id === priceBucket)?.label ?? "Price";

  return (
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
      <FilterChip
        label={filters.sort === "distance" ? "Sort" : sortLabel(filters.sort)}
        isActive={filters.sort !== "distance"}
        onPress={onOpenSort}
        onClear={() => setFilter("sort", "distance")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
