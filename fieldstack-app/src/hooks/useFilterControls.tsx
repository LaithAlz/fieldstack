import { useMemo, useState } from "react";

import type { SearchSort } from "../api/search";
import {
  FilterBottomSheet,
  type FilterSheetConfig,
} from "../components/FilterBottomSheet";
import { FiltersSheet } from "../components/FiltersSheet";
import { SORT_OPTIONS } from "../lib/filters";

import type { FieldSearchFilters, SetFilter } from "./useFieldSearch";

/**
 * Glues the new FilterToolbar (one Filters button + one Sort button) to
 * two sheets:
 *
 *   - FiltersSheet: combined Surface/Size/Type/Price picker (~80% height).
 *     Lives behind the "Filters" button.
 *   - FilterBottomSheet: the existing single-attribute picker, used only
 *     for Sort now (single-select, instant-apply).
 *
 * The hook returns the props each button needs plus the sheets element to
 * mount at the screen root.
 */

type SortConfig = FilterSheetConfig<SearchSort>;

export function useFilterControls(
  filters: FieldSearchFilters,
  setFilter: SetFilter,
  /** Live result count for the FiltersSheet footer ("Show N venues"). */
  resultCount: number,
  isLoading: boolean,
  /** Resets every filter attribute to its default. */
  clearAll: () => void
): {
  toolbarProps: {
    filters: FieldSearchFilters;
    onOpenFilters: () => void;
    onOpenSort: () => void;
  };
  sheets: React.ReactElement;
} {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const sortConfig = useMemo<SortConfig | null>(() => {
    if (!sortOpen) return null;
    return {
      title: "Sort by",
      mode: "single",
      options: SORT_OPTIONS,
      selected: filters.sort,
      onApply: (next) => setFilter("sort", next ?? "distance"),
    };
  }, [sortOpen, filters.sort, setFilter]);

  const sheets = (
    <>
      <FiltersSheet
        visible={filtersOpen}
        filters={filters}
        setFilter={setFilter}
        clearAll={clearAll}
        resultCount={resultCount}
        isLoading={isLoading}
        onClose={() => setFiltersOpen(false)}
      />
      <FilterBottomSheet
        config={sortConfig as unknown as FilterSheetConfig<string>}
        onClose={() => setSortOpen(false)}
      />
    </>
  );

  return {
    toolbarProps: {
      filters,
      onOpenFilters: () => setFiltersOpen(true),
      onOpenSort: () => setSortOpen(true),
    },
    sheets,
  };
}
