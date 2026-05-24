/**
 * Combined Filters sheet — Surface / Size / Type / Price stacked in one
 * scrollable bottom sheet (~80% height). Replaces the per-attribute chips.
 *
 * UX choices:
 *   - Toggles apply immediately to the live filter state (results refetch
 *     behind the sheet). The user gets instant feedback; the count in the
 *     footer reflects the current state without an extra preview API call.
 *   - "Show N venues" primary button just dismisses — the filtering has
 *     already happened. The label makes the action feel concrete.
 *   - "Clear all" resets every section in one tap.
 *   - Pan-down + backdrop close also dismiss (no revert; live-apply means
 *     there's nothing staged to discard).
 *
 * Sort is intentionally not in here. It lives as its own button alongside
 * the Filters button (matches Airbnb's separation).
 */

import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
// TouchableOpacity from react-native-gesture-handler (not react-native) —
// the only touch component that reliably fires inside BottomSheetFooter.
// Plain Pressable/Button taps get eaten by gorhom's internal gesture
// handler scope, which is why "Show N venues" wasn't dismissing.
import { TouchableOpacity } from "react-native-gesture-handler";

import { selection as selectionHaptic } from "../lib/haptics";
import {
  bucketToPriceMax,
  PRICE_OPTIONS,
  priceMaxToBucket,
  type PriceBucket,
  SIZE_OPTIONS,
  SURFACE_OPTIONS,
  VENUE_TYPE_OPTIONS,
} from "../lib/filters";
import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type {
  FieldSearchFilters,
  SetFilter,
} from "../hooks/useFieldSearch";
import type { FieldSize, FieldSurface, VenueType } from "../types/api";

import { Text } from "./Text";

type Props = {
  /** True opens the sheet; false closes. */
  visible: boolean;
  filters: FieldSearchFilters;
  setFilter: SetFilter;
  clearAll: () => void;
  /** Result count to display in the footer button. */
  resultCount: number;
  isLoading: boolean;
  onClose: () => void;
};

export function FiltersSheet({
  visible,
  filters,
  setFilter,
  clearAll,
  resultCount,
  isLoading,
  onClose,
}: Props) {
  const colors = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  // 80% leaves the map / list slightly visible at the top — keeps spatial
  // context, matches the chosen sheet style.
  const snapPoints = useMemo(() => ["80%"], []);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose]
  );

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...backdropProps}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    []
  );

  const handleClearAll = () => {
    selectionHaptic();
    clearAll();
  };

  // Imperative close via the sheet ref. State-driven close (flipping the
  // `visible` prop) was unreliable inside BottomSheetFooter — the prop
  // round-trip got lost, and the sheet just sat there. Closing through
  // the ref animates to index -1 directly; our handleSheetChange then
  // calls onClose() to sync the parent state.
  const handleShow = useCallback(() => {
    sheetRef.current?.close();
  }, []);

  const priceBucket = priceMaxToBucket(filters.priceMax);

  // BottomSheetFooter renders OUTSIDE the scrollable area so the Apply
  // button stays pinned at the bottom of the sheet. Putting the button
  // as a plain View after BottomSheetScrollView pushed it off-screen at
  // the 80% snap point — the scroll view consumed all remaining space.
  const label = isLoading
    ? "Loading…"
    : resultCount === 1
      ? "Show 1 venue"
      : `Show ${resultCount} venues`;
  const renderFooter = useCallback(
    (footerProps: BottomSheetFooterProps) => (
      <BottomSheetFooter
        {...footerProps}
        bottomInset={0}
        style={{
          ...styles.footer,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <TouchableOpacity
          onPress={handleShow}
          accessibilityRole="button"
          accessibilityLabel={label}
          activeOpacity={0.85}
          style={[styles.applyBtn, { backgroundColor: colors.brand }]}
        >
          <Text style={styles.applyLabel}>{label}</Text>
        </TouchableOpacity>
      </BottomSheetFooter>
    ),
    [colors.border, colors.surface, colors.brand, label, handleShow]
  );

  return (
    <View
      pointerEvents={visible ? "auto" : "box-none"}
      style={StyleSheet.absoluteFill}
    >
      <BottomSheet
        ref={sheetRef}
        index={visible ? 0 : -1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onChange={handleSheetChange}
        backdropComponent={renderBackdrop}
        footerComponent={renderFooter}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            hitSlop={spacing.sm}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text size="lg" weight="bold" accessibilityRole="header">
            Filters
          </Text>
          <Pressable
            onPress={handleClearAll}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
            hitSlop={spacing.sm}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text
              style={{
                color: colors.brand,
                fontSize: fontSize.md,
                fontWeight: fontWeight.medium,
              }}
            >
              Clear all
            </Text>
          </Pressable>
        </View>

        <BottomSheetScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Section title="Surface">
            <ChipGroup<FieldSurface>
              options={SURFACE_OPTIONS}
              selected={filters.surface}
              onToggle={(id) =>
                setFilter("surface", (prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
            />
          </Section>

          <Section title="Size">
            <ChipGroup<FieldSize>
              options={SIZE_OPTIONS}
              selected={filters.size}
              onToggle={(id) =>
                setFilter("size", (prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
            />
          </Section>

          <Section title="Venue type">
            <ChipGroup<VenueType>
              options={VENUE_TYPE_OPTIONS}
              selected={filters.venueType}
              onToggle={(id) =>
                setFilter("venueType", (prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
            />
          </Section>

          <Section title="Price">
            <ChipGroup<PriceBucket>
              options={PRICE_OPTIONS}
              selected={[priceBucket]}
              singleSelect
              onToggle={(id) => {
                // Single-select semantics: tapping the active bucket clears,
                // tapping a different bucket selects it.
                setFilter(
                  "priceMax",
                  bucketToPriceMax(priceBucket === id ? "any" : id)
                );
              }}
            />
          </Section>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section + ChipGroup
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text size="md" weight="bold" accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

type ChipGroupProps<T extends string> = {
  options: { id: T; label: string }[];
  selected: T[];
  /** When true, behaves as single-select (radio); otherwise multi-select. */
  singleSelect?: boolean;
  onToggle: (id: T) => void;
};

function ChipGroup<T extends string>({
  options,
  selected,
  singleSelect = false,
  onToggle,
}: ChipGroupProps<T>) {
  const colors = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const active = selected.includes(opt.id);
        return (
          <Pressable
            key={opt.id}
            onPress={() => {
              selectionHaptic();
              onToggle(opt.id);
            }}
            accessibilityRole={singleSelect ? "radio" : "checkbox"}
            accessibilityState={{ checked: active, selected: active }}
            accessibilityLabel={opt.label}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active ? colors.brand : colors.surface,
                borderColor: active ? colors.brand : colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: active ? "#FFFFFF" : colors.textPrimary,
                fontSize: fontSize.md,
                fontWeight: fontWeight.medium,
              }}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    minHeight: 48,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: spacing.lg,
    // Leave room for the sticky BottomSheetFooter (~Button height + padding
    // + inset). Without this the last filter section sits behind the
    // "Show N venues" button.
    paddingBottom: 96,
  },
  section: {
    paddingVertical: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  applyBtn: {
    minHeight: 48,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  applyLabel: {
    color: "#FFFFFF",
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
});
