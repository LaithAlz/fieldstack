import { useMemo, useState } from "react";

import type { SearchSort } from "../api/search";
import {
  FilterBottomSheet,
  type FilterSheetConfig,
} from "../components/FilterBottomSheet";
import {
  bucketToPriceMax,
  PRICE_OPTIONS,
  priceMaxToBucket,
  type PriceBucket,
  SIZE_OPTIONS,
  SORT_OPTIONS,
  SURFACE_OPTIONS,
  VENUE_TYPE_OPTIONS,
} from "../lib/filters";
import type { FieldSize, FieldSurface, VenueType } from "../types/api";

import type { FieldSearchFilters, SetFilter } from "./useFieldSearch";

type Which = "surface" | "size" | "venueType" | "price" | "sort";

type Config =
  | FilterSheetConfig<FieldSurface>
  | FilterSheetConfig<FieldSize>
  | FilterSheetConfig<VenueType>
  | FilterSheetConfig<PriceBucket>
  | FilterSheetConfig<SearchSort>;

/**
 * Glues the filter chip row to a single shared bottom-sheet picker. Returns
 * the props the chips need and the sheet element to mount at the screen root.
 *
 * Why one shared sheet: stacking BottomSheetModals caused @gorhom/bottom-sheet
 * v5's `present()` to silently no-op. Funneling pickers through one modal
 * that swaps its content matches the working `BookingTimeSheet` pattern.
 */
export function useFilterControls(
  filters: FieldSearchFilters,
  setFilter: SetFilter
): {
  chipsProps: {
    filters: FieldSearchFilters;
    setFilter: SetFilter;
    onOpenSurface: () => void;
    onOpenSize: () => void;
    onOpenVenueType: () => void;
    onOpenPrice: () => void;
    onOpenSort: () => void;
  };
  sheets: React.ReactElement;
} {
  const [which, setWhich] = useState<Which | null>(null);

  const priceBucket = useMemo(
    () => priceMaxToBucket(filters.priceMax),
    [filters.priceMax]
  );

  const config = useMemo<Config | null>(() => {
    if (which === "surface") {
      return {
        title: "Surface",
        mode: "multi",
        options: SURFACE_OPTIONS,
        selected: filters.surface,
        onApply: (next) => setFilter("surface", next),
      };
    }
    if (which === "size") {
      return {
        title: "Size",
        mode: "multi",
        options: SIZE_OPTIONS,
        selected: filters.size,
        onApply: (next) => setFilter("size", next),
      };
    }
    if (which === "venueType") {
      return {
        title: "Venue type",
        mode: "multi",
        options: VENUE_TYPE_OPTIONS,
        selected: filters.venueType,
        onApply: (next) => setFilter("venueType", next),
      };
    }
    if (which === "price") {
      return {
        title: "Price",
        mode: "single",
        options: PRICE_OPTIONS,
        selected: priceBucket,
        onApply: (next) => setFilter("priceMax", bucketToPriceMax(next ?? "any")),
      };
    }
    if (which === "sort") {
      return {
        title: "Sort by",
        mode: "single",
        options: SORT_OPTIONS,
        selected: filters.sort,
        // Sort always has a value — coerce a "clear" tap back to "distance".
        onApply: (next) => setFilter("sort", next ?? "distance"),
      };
    }
    return null;
  }, [
    which,
    filters.surface,
    filters.size,
    filters.venueType,
    filters.sort,
    priceBucket,
    setFilter,
  ]);

  // The single shared sheet. Cast through `as unknown as ...` because each
  // branch of the config union uses a different type parameter — FilterBottomSheet
  // narrows internally via the mode discriminant.
  const sheets = (
    <FilterBottomSheet
      config={config as unknown as FilterSheetConfig<string>}
      onClose={() => setWhich(null)}
    />
  );

  return {
    chipsProps: {
      filters,
      setFilter,
      onOpenSurface: () => setWhich("surface"),
      onOpenSize: () => setWhich("size"),
      onOpenVenueType: () => setWhich("venueType"),
      onOpenPrice: () => setWhich("price"),
      onOpenSort: () => setWhich("sort"),
    },
    sheets,
  };
}
