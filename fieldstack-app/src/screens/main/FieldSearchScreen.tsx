import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { FieldSearchCard } from "../../components/FieldSearchCard";
import { FilterBottomSheet, type FilterOption } from "../../components/FilterBottomSheet";
import { FilterChip } from "../../components/FilterChip";
import { SearchInput } from "../../components/SearchInput";
import { Skeleton } from "../../components/Skeleton";
import { Text } from "../../components/Text";
import { useFieldSearch } from "../../hooks/useFieldSearch";
import { useLocation } from "../../hooks/useLocation";
import type { MainStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { FieldSize, FieldSurface, SearchResult } from "../../types/api";

type Nav = NativeStackNavigationProp<MainStackParamList, "FieldSearch">;

// ---------- Filter option definitions ---------------------------------------

const SURFACE_OPTIONS: FilterOption<FieldSurface>[] = [
  { id: "turf", label: "Turf" },
  { id: "grass", label: "Grass" },
  { id: "concrete", label: "Concrete" },
  { id: "indoor", label: "Indoor" },
];

const SIZE_OPTIONS: FilterOption<FieldSize>[] = [
  { id: "5v5", label: "5-a-side" },
  { id: "7v7", label: "7-a-side" },
  { id: "11v11", label: "11-a-side" },
];

// Price encoded as the upper bound to keep `priceMax` semantics on the wire.
// `"any"` is the no-filter sentinel; `"120plus"` is also a no-filter request
// today (the API doesn't accept a min) — flagged in the inline comment.
type PriceBucket = "any" | "under80" | "to120" | "120plus";

const PRICE_OPTIONS: FilterOption<PriceBucket>[] = [
  { id: "any", label: "Any price" },
  { id: "under80", label: "Under $80" },
  { id: "to120", label: "$80–$120" },
  { id: "120plus", label: "$120+" },
];

function bucketToPriceMax(bucket: PriceBucket): number | null {
  if (bucket === "under80") return 80;
  if (bucket === "to120") return 120;
  // "any" and "120plus" both clear the cap. "$120+" should ideally pair with
  // a price_min filter — backend doesn't support that yet, so it behaves as
  // "any" until the API grows the field.
  return null;
}

function priceMaxToBucket(priceMax: number | null): PriceBucket {
  if (priceMax === 80) return "under80";
  if (priceMax === 120) return "to120";
  return "any";
}

const SKELETON_COUNT = 5;
const SKELETON_HEIGHT = 96;

// ---------- Screen ----------------------------------------------------------

export function FieldSearchScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const {
    coords: userCoords,
    label: userLocationLabel,
    loading: locationLoading,
  } = useLocation();

  const {
    results,
    total,
    isLoading,
    filters,
    location,
    locationError,
    setFilter,
    clearFilters,
    setLocation,
  } = useFieldSearch();

  // Seed the search hook's location once useLocation resolves, so the first
  // fetch goes out with coords rather than waiting on a geocode the user
  // hasn't asked for.
  const seededRef = useRef(false);
  useEffect(() => {
    if (locationLoading || seededRef.current) return;
    if (location.text.length === 0) {
      setLocation(userLocationLabel, userCoords);
    }
    seededRef.current = true;
  }, [locationLoading, userLocationLabel, userCoords, location.text.length, setLocation]);

  // Filter sheet visibility — one boolean per filter group rather than a
  // tagged-union "which sheet is open" so the type-narrowed `mode` props on
  // FilterBottomSheet stay clean.
  const [surfaceOpen, setSurfaceOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const priceBucket = priceMaxToBucket(filters.priceMax);

  const activeFilterCount =
    filters.surface.length +
    filters.size.length +
    (filters.priceMax !== null ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0;

  // Result count label. Empty location text → bare count; otherwise read out
  // the location the hook has cached (which is the same string the search
  // input shows).
  const countLabel = useMemo(() => {
    const noun = total === 1 ? "field" : "fields";
    if (location.text.trim().length === 0) {
      return isLoading ? "Searching…" : `${total} ${noun}`;
    }
    return isLoading
      ? `Searching ${location.text}…`
      : `${total} ${noun} near ${location.text}`;
  }, [total, isLoading, location.text]);

  const handleCardPress = useCallback(
    (result: SearchResult) =>
      nav.navigate("FieldDetail", { fieldId: result.field.id }),
    [nav]
  );

  // Lowest price across the current result set. Used to badge the cheapest
  // card. Ties go to whichever appears first in the API's ordering.
  const bestPriceFieldId = useMemo<string | null>(() => {
    let best: { id: string; price: number } | null = null;
    for (const r of results) {
      const price = r.field.price_per_hour;
      if (price === null) continue;
      if (best === null || price < best.price) {
        best = { id: r.field.id, price };
      }
    }
    return best?.id ?? null;
  }, [results]);

  const priceLabelForChip = (() => {
    if (priceBucket === "any") return "Price";
    const opt = PRICE_OPTIONS.find((o) => o.id === priceBucket);
    return opt ? opt.label : "Price";
  })();

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      {/* ---------- Sticky top bar ---------- */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.searchWrap}>
            <SearchInput
              value={location.text}
              onChangeText={(t) => setLocation(t)}
              error={locationError?.message ?? null}
            />
          </View>
          <Pressable
            onPress={() => setSurfaceOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Filters"
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.filterIcon,
              {
                backgroundColor: hasAnyFilter
                  ? colors.brand
                  : colors.surfaceSecondary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={hasAnyFilter ? "#FFFFFF" : colors.textPrimary}
            />
          </Pressable>
        </View>

        {/* Inline filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <FilterChip
            label={filters.surface.length > 0 ? "Surface" : "Surface"}
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
            label={priceLabelForChip}
            isActive={priceBucket !== "any"}
            onPress={() => setPriceOpen(true)}
            onClear={() => setFilter("priceMax", null)}
          />
        </ScrollView>

        {/* Count + clear-all row */}
        <View style={styles.countRow}>
          <Text size="sm" variant="secondary" numberOfLines={1} style={styles.countText}>
            {countLabel}
          </Text>
          {hasAnyFilter ? (
            <Pressable
              onPress={clearFilters}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              hitSlop={spacing.sm}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text
                size="sm"
                weight="medium"
                style={{ color: colors.brand }}
              >
                Clear all filters
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ---------- List ---------- */}
      {isLoading ? (
        <ScrollView
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 96 },
          ]}
        >
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <Skeleton
              key={i}
              width="100%"
              height={SKELETON_HEIGHT}
              borderRadius={borderRadius.lg}
            />
          ))}
        </ScrollView>
      ) : results.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="search-outline"
            title={hasAnyFilter ? "No fields match your filters" : "No fields here"}
            description={
              hasAnyFilter
                ? "Try removing a filter or widening your search."
                : "Try a different area or check back soon."
            }
            actionLabel={hasAnyFilter ? "Clear filters" : "Widen radius"}
            onAction={
              hasAnyFilter
                ? clearFilters
                : () => setLocation("", undefined)
            }
          />
          {hasAnyFilter ? (
            <View style={styles.removeSuggestions}>
              <Text size="sm" variant="tertiary" style={styles.removeLabel}>
                Try removing
              </Text>
              <View style={styles.removeChips}>
                {filters.surface.map((s) => (
                  <RemoveChip
                    key={`surface-${s}`}
                    label={SURFACE_OPTIONS.find((o) => o.id === s)?.label ?? s}
                    onPress={() =>
                      // Functional form — rapid taps must read fresh state.
                      setFilter("surface", (prev) => prev.filter((x) => x !== s))
                    }
                  />
                ))}
                {filters.size.map((s) => (
                  <RemoveChip
                    key={`size-${s}`}
                    label={SIZE_OPTIONS.find((o) => o.id === s)?.label ?? s}
                    onPress={() =>
                      setFilter("size", (prev) => prev.filter((x) => x !== s))
                    }
                  />
                ))}
                {filters.priceMax !== null ? (
                  <RemoveChip
                    label={PRICE_OPTIONS.find((o) => o.id === priceBucket)?.label ?? `Under $${filters.priceMax}`}
                    onPress={() => setFilter("priceMax", null)}
                  />
                ) : null}
              </View>
              <Pressable
                onPress={() => setLocation("", undefined)}
                accessibilityRole="button"
                accessibilityLabel="Widen radius"
                style={({ pressed }) => [
                  styles.secondaryCta,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text size="md" weight="medium" style={{ color: colors.brand }}>
                  Widen radius
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => r.field.id}
          renderItem={({ item }) => (
            <FieldSearchCard
              result={item}
              userCoords={userCoords}
              isBestPrice={item.field.id === bestPriceFieldId}
              onPress={() => handleCardPress(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 96 },
          ]}
        />
      )}

      {/* ---------- Floating "Map view" button ---------- */}
      <View
        pointerEvents="box-none"
        style={[
          styles.mapButtonWrap,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <Pressable
          onPress={() => nav.navigate("MapView")}
          accessibilityRole="button"
          accessibilityLabel="Map view"
          style={({ pressed }) => [
            styles.mapButton,
            {
              backgroundColor: colors.textPrimary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons name="map-outline" size={16} color={colors.surface} />
          <Text
            size="md"
            weight="medium"
            style={{ color: colors.surface, marginLeft: spacing.xs }}
          >
            Map view
          </Text>
        </Pressable>
      </View>

      {/* ---------- Filter sheets ---------- */}
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
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tappable chip used in the empty state to clear one filter at a time. Reads
// "× Indoor" with a leading dismiss glyph so the affordance is unambiguous.

function RemoveChip({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${label} filter`}
      hitSlop={spacing.xs}
      style={({ pressed }) => [
        styles.removeChip,
        {
          backgroundColor: colors.surfaceSecondary,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons
        name="close"
        size={14}
        color={colors.textSecondary}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text size="sm" weight="medium" style={{ color: colors.textPrimary }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchWrap: {
    flex: 1,
  },
  filterIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.xs,
    gap: spacing.sm,
  },
  countText: {
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryCta: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  removeSuggestions: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    alignItems: "center",
  },
  removeLabel: {
    marginBottom: spacing.sm,
  },
  removeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  removeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 32,
  },
  mapButtonWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.xl,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
