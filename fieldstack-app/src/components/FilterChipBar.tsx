import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import {
  bucketToPriceMax,
  PRICE_OPTIONS,
  priceMaxToBucket,
  SIZE_OPTIONS,
  SURFACE_OPTIONS,
} from "../lib/filters";
import { spacing } from "../theme/tokens";
import type { FieldSearchFilters, SetFilter } from "../hooks/useFieldSearch";

import { FilterBottomSheet } from "./FilterBottomSheet";
import { FilterChip } from "./FilterChip";

type Props = {
  filters: FieldSearchFilters;
  setFilter: SetFilter;
  /** Optional extra styling for the horizontal scroll wrapper. */
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Self-contained Surface / Size / Price filter chip row + the three picker
 * sheets that go with it. Drop into any screen that owns filter state and the
 * shared `useFieldSearch` hook — both FieldSearchScreen and MapViewScreen
 * render this without duplicating the picker plumbing.
 *
 * The sheets are mounted inside this component so each render-site doesn't
 * need to wire `surfaceOpen` / `sizeOpen` / `priceOpen` state by hand.
 */
export function FilterChipBar({ filters, setFilter, contentStyle }: Props) {
  const [surfaceOpen, setSurfaceOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const priceBucket = useMemo(
    () => priceMaxToBucket(filters.priceMax),
    [filters.priceMax]
  );

  const priceLabel =
    PRICE_OPTIONS.find((o) => o.id === priceBucket)?.label ?? "Price";

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.chips, contentStyle]}
      >
        <FilterChip
          label="Surface"
          isActive={filters.surface.length > 0}
          count={filters.surface.length}
          onPress={() => setSurfaceOpen(true)}
          onClear={() => setFilter("surface", [])}
        />
        <FilterChip
          label="Size"
          isActive={filters.size.length > 0}
          count={filters.size.length}
          onPress={() => setSizeOpen(true)}
          onClear={() => setFilter("size", [])}
        />
        <FilterChip
          label={priceBucket === "any" ? "Price" : priceLabel}
          isActive={priceBucket !== "any"}
          onPress={() => setPriceOpen(true)}
          onClear={() => setFilter("priceMax", null)}
        />
      </ScrollView>

      <FilterBottomSheet
        visible={surfaceOpen}
        title="Surface"
        mode="multi"
        options={SURFACE_OPTIONS}
        selected={filters.surface}
        onSelect={(next) => setFilter("surface", next)}
        onDismiss={() => setSurfaceOpen(false)}
      />
      <FilterBottomSheet
        visible={sizeOpen}
        title="Size"
        mode="multi"
        options={SIZE_OPTIONS}
        selected={filters.size}
        onSelect={(next) => setFilter("size", next)}
        onDismiss={() => setSizeOpen(false)}
      />
      <FilterBottomSheet
        visible={priceOpen}
        title="Price"
        mode="single"
        options={PRICE_OPTIONS}
        selected={priceBucket}
        onSelect={(next) => setFilter("priceMax", bucketToPriceMax(next ?? "any"))}
        onDismiss={() => setPriceOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
