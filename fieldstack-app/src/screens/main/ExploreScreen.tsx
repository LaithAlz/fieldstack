/**
 * Explore — the sheet-over-map rebuild. One screen replaces the old
 * VenueList / FieldSearch / MapView trio: the map is the permanent canvas,
 * a draggable bottom sheet carries the venue list, and the top pill + chip
 * row own search and filtering. `useFieldSearch`'s 75km field search is now
 * the single data source for both the pins and the sheet list.
 */

import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetScrollView,
  type BottomSheetFlatListMethods,
  type BottomSheetModal,
} from "@gorhom/bottom-sheet";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import MapView, { Circle, Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { ExploreCard, type ExploreVenueGroup } from "../../components/ExploreCard";
import { ExploreCardSkeleton } from "../../components/ExploreCardSkeleton";
import { FiltersSheet } from "../../components/FiltersSheet";
import { LocationPickerSheet } from "../../components/LocationPickerSheet";
import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { VenuePin } from "../../components/VenuePin";
import { useFieldSearch } from "../../hooks/useFieldSearch";
import { useLocation } from "../../hooks/useLocation";
import {
  EVENT_EXPLORE_CHIP_TOGGLED,
  EVENT_EXPLORE_SHEET_SNAPPED,
  track,
} from "../../lib/analytics";
import { haversineKm } from "../../lib/distance";
import { isFreeVenue } from "../../lib/filters";
import { selection } from "../../lib/haptics";
import {
  getCurrentCoords,
  openLocationSettings,
  requestPermission,
} from "../../lib/location";
import { getLastRegion, setLastRegion } from "../../lib/mapState";
import { isOpenNow } from "../../lib/venueHours";
import type { MainStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { Field, SearchResult } from "../../types/api";

type Nav = NativeStackNavigationProp<MainStackParamList, "Explore">;

const DEFAULT_DELTA = 0.15; // ~16km — comfortable starting zoom for a city
// Fixed pool size: Marker children of MapView must NEVER mount/unmount under
// Expo Go 54 Fabric interop — see VenueMarkerSlot below. Kept at parity with
// the old MapViewScreen; raising it needs on-device profiling this change
// couldn't do, so the cap stays put for this PR.
const MAX_MARKERS = 50;
// Minimum camera-center movement before a settled pan triggers a refetch —
// see the identical constant in the old MapViewScreen for the reasoning
// (75km search radius means micro-pans can't change the result set).
const REFETCH_PAN_THRESHOLD_KM = 1.5;
const SNAP_POINTS = ["22%", "55%", "92%"];
// ExploreCard's approximate row height (84pt photo + padding) plus the list
// separator — good enough for scrollToIndex's estimate; onScrollToIndexFailed
// covers the rest.
const ROW_HEIGHT = 132;

// ---------------------------------------------------------------------------
// Pure grouping — one row/pin per venue, even when a venue has multiple
// matching fields. Feeds both the map markers and the sheet's card list so
// they never drift out of sync with each other.
// ---------------------------------------------------------------------------

function groupByVenue(results: SearchResult[]): ExploreVenueGroup[] {
  const map = new Map<string, ExploreVenueGroup>();
  for (const r of results) {
    const existing = map.get(r.venue.id);
    if (existing) {
      existing.fields.push(r.field);
    } else {
      map.set(r.venue.id, { venue: r.venue, fields: [r.field] });
    }
  }
  return Array.from(map.values());
}

function minPriceOf(fields: Field[]): number | null {
  const priced = fields
    .map((f) => f.price_per_hour)
    .filter((p): p is number => p !== null);
  return priced.length > 0 ? Math.min(...priced) : null;
}

// ---------------------------------------------------------------------------
// Map markers
// ---------------------------------------------------------------------------

// tracksViewChanges is permanently false — any flip triggers a shadow-tree
// commit that corrupts AIRMap's subview index under the Fabric interop layer
// (see the old MapViewScreen for the full crash history). group=null means
// the slot is inactive: rendered at null-island with opacity 0, but still
// MOUNTED (never removed) so the fixed-size Marker pool never changes length.
type VenueMarkerSlotProps = {
  group: ExploreVenueGroup | null;
  onPress: (venueId: string) => void;
};

const VenueMarkerSlot = memo(function VenueMarkerSlot({
  group,
  onPress,
}: VenueMarkerSlotProps) {
  const coordinate = useMemo(
    () =>
      group
        ? { latitude: group.venue.lat!, longitude: group.venue.lng! }
        : { latitude: 0, longitude: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group?.venue.lat, group?.venue.lng]
  );

  const minPrice = group ? minPriceOf(group.fields) : null;
  const free = group ? isFreeVenue(group.venue.venue_type, minPrice) : false;

  return (
    <Marker
      coordinate={coordinate}
      opacity={group ? 1 : 0}
      onPress={
        group
          ? (e) => {
              e.stopPropagation();
              onPress(group.venue.id);
            }
          : undefined
      }
      tracksViewChanges={false}
    >
      {group && free ? (
        <VenuePin mode="free" fieldCount={group.fields.length} venueName={group.venue.name} />
      ) : group && minPrice !== null ? (
        <VenuePin
          mode="price"
          price={minPrice}
          fieldCount={group.fields.length}
          venueName={group.venue.name}
        />
      ) : (
        <VenuePin
          mode="count"
          fieldCount={group?.fields.length ?? 0}
          venueName={group?.venue.name ?? ""}
        />
      )}
    </Marker>
  );
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function ExploreScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const nav = useNavigation<Nav>();
  const toast = useToast();

  const { coords: userCoords, permissionStatus, coordsFetchFailed } = useLocation();
  const {
    results,
    total,
    isLoading,
    error,
    filters,
    location,
    staleFromCache,
    setFilter,
    clearFilters,
    setLocation,
  } = useFieldSearch();

  // ---- Explore-only local state -----------------------------------------
  const [openNowOn, setOpenNowOn] = useState(false);
  const [freeOnlyOn, setFreeOnlyOn] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const pickerRef = useRef<BottomSheetModal>(null);
  const listRef = useRef<BottomSheetFlatListMethods>(null);
  const mapRef = useRef<MapView>(null);

  const openPicker = useCallback(() => pickerRef.current?.present(), []);
  const closePicker = useCallback(() => pickerRef.current?.dismiss(), []);

  const handleSelectCity = useCallback(
    (coords: { lat: number; lng: number }, label: string) => {
      setLocation(label, coords);
      closePicker();
    },
    [closePicker, setLocation]
  );

  const handleUseMyLocation = useCallback(async () => {
    const fresh = await getCurrentCoords();
    if (fresh) {
      setLocation("Near you", fresh);
      closePicker();
    } else {
      toast.show("Couldn't read your location.", { type: "error" });
      closePicker();
    }
  }, [closePicker, setLocation, toast]);

  const handleRequestPermission = useCallback(async () => {
    const status = await requestPermission();
    if (status === "granted") {
      await handleUseMyLocation();
    } else {
      void openLocationSettings();
      closePicker();
    }
  }, [closePicker, handleUseMyLocation]);

  // ---- Map camera ----------------------------------------------------------
  const initialRegion = useMemo<Region>(() => {
    const cached = getLastRegion();
    if (cached) return cached;
    return {
      latitude: userCoords.lat,
      longitude: userCoords.lng,
      latitudeDelta: DEFAULT_DELTA,
      longitudeDelta: DEFAULT_DELTA,
    };
    // Calculated once at mount — re-running on userCoords change would jerk
    // the camera while the user is interacting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [currentRegion, setCurrentRegion] = useState<Region>(
    () => getLastRegion() ?? initialRegion
  );
  const currentRegionRef = useRef(currentRegion);
  useEffect(() => {
    currentRegionRef.current = currentRegion;
  }, [currentRegion]);

  const isProgrammaticPanRef = useRef(false);
  const locationTextRef = useRef(location.text);
  locationTextRef.current = location.text;
  const lastFetchCenterRef = useRef<{ lat: number; lng: number } | null>(null);

  // Successful geocode / city pick → fly the map to the new coords.
  useEffect(() => {
    if (location.lat === null || location.lng === null) return;
    lastFetchCenterRef.current = { lat: location.lat, lng: location.lng };
    if (!mapRef.current) return;
    const cached = getLastRegion();
    const latDelta = cached?.latitudeDelta ?? DEFAULT_DELTA;
    const lngDelta = cached?.longitudeDelta ?? DEFAULT_DELTA;
    isProgrammaticPanRef.current = true;
    mapRef.current.animateToRegion(
      {
        latitude: location.lat,
        longitude: location.lng,
        latitudeDelta: latDelta,
        longitudeDelta: lngDelta,
      },
      400
    );
  }, [location.lat, location.lng]);

  // Auto-refetch whenever the user settles the camera on a new region —
  // same pan-to-refetch behavior as the old MapViewScreen.
  const handleRegionChange = useCallback(
    (region: Region) => {
      setLastRegion(region);
      setCurrentRegion(region);
      if (isProgrammaticPanRef.current) {
        isProgrammaticPanRef.current = false;
        return;
      }
      const center = { lat: region.latitude, lng: region.longitude };
      const last = lastFetchCenterRef.current;
      if (last && haversineKm(last, center) < REFETCH_PAN_THRESHOLD_KM) return;
      setLocation(locationTextRef.current, center);
    },
    [setLocation]
  );

  // ---- Results → venue groups, with Explore's client-side chip filters ----
  // "Open now" and "Free" aren't server query params — they filter the
  // already-fetched page, same as any other client-side refinement.
  const filteredResults = useMemo(() => {
    if (!openNowOn && !freeOnlyOn) return results;
    const now = new Date();
    return results.filter((r) => {
      if (openNowOn && !isOpenNow(undefined, now)) return false;
      if (freeOnlyOn && !isFreeVenue(r.venue.venue_type, r.field.price_per_hour)) return false;
      return true;
    });
  }, [results, openNowOn, freeOnlyOn]);

  const groups = useMemo(() => groupByVenue(filteredResults), [filteredResults]);

  // Fixed-size slot array — see VenueMarkerSlot for why this must stay a
  // constant length regardless of how many venues are loaded.
  const { markerSlots, placeableCount } = useMemo(() => {
    const valid = groups.filter((g) => g.venue.lat !== null && g.venue.lng !== null);
    const pool: (ExploreVenueGroup | null)[] = new Array(MAX_MARKERS).fill(null);
    for (let i = 0; i < Math.min(valid.length, MAX_MARKERS); i++) {
      pool[i] = valid[i]!;
    }
    return { markerSlots: pool, placeableCount: valid.length };
  }, [groups]);
  const overflowCount = Math.max(0, placeableCount - MAX_MARKERS);

  const selectedGroup = useMemo(
    () => (selectedVenueId ? groups.find((g) => g.venue.id === selectedVenueId) ?? null : null),
    [groups, selectedVenueId]
  );
  const selectedCoord = useMemo(
    () =>
      selectedGroup && selectedGroup.venue.lat !== null && selectedGroup.venue.lng !== null
        ? { latitude: selectedGroup.venue.lat, longitude: selectedGroup.venue.lng }
        : { latitude: 0, longitude: 0 },
    [selectedGroup]
  );

  const panToVenue = useCallback(
    (venueId: string) => {
      const group = groups.find((g) => g.venue.id === venueId);
      if (!group || group.venue.lat === null || group.venue.lng === null || !mapRef.current) {
        return;
      }
      const cached = getLastRegion();
      const latDelta = cached?.latitudeDelta ?? DEFAULT_DELTA;
      const lngDelta = cached?.longitudeDelta ?? DEFAULT_DELTA;
      isProgrammaticPanRef.current = true;
      mapRef.current.animateToRegion(
        {
          // Shift south so the pin lands above the sheet rather than under it.
          latitude: group.venue.lat - latDelta * 0.22,
          longitude: group.venue.lng,
          latitudeDelta: latDelta,
          longitudeDelta: lngDelta,
        },
        300
      );
    },
    [groups]
  );

  // Tapping a pin selects it, pans the map, and scrolls the sheet so the
  // venue's card is at the top of the list — simplest correct behavior.
  const handleMarkerPress = useCallback(
    (venueId: string) => {
      selection();
      setSelectedVenueId(venueId);
      panToVenue(venueId);
      const index = groups.findIndex((g) => g.venue.id === venueId);
      if (index >= 0) {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
      }
    },
    [panToVenue, groups]
  );

  const handleMapPress = useCallback(() => setSelectedVenueId(null), []);

  const handleCardPress = useCallback(
    (venueId: string) => {
      setSelectedVenueId(venueId);
      nav.navigate("VenueDetail", { venueId });
    },
    [nav]
  );

  // ---- Chips ---------------------------------------------------------------
  const toggleOpenNow = useCallback(() => {
    selection();
    setOpenNowOn((prev) => {
      const next = !prev;
      track(EVENT_EXPLORE_CHIP_TOGGLED, { chip: "open_now", active: next });
      return next;
    });
  }, []);

  const toggleFreeOnly = useCallback(() => {
    selection();
    setFreeOnlyOn((prev) => {
      const next = !prev;
      track(EVENT_EXPLORE_CHIP_TOGGLED, { chip: "free", active: next });
      return next;
    });
  }, []);

  const openFiltersFromChip = useCallback((chip: "surface" | "size" | "price") => {
    selection();
    track(EVENT_EXPLORE_CHIP_TOGGLED, { chip, active: true });
    setFiltersOpen(true);
  }, []);

  const hasAnyFilter =
    filters.surface.length > 0 ||
    filters.size.length > 0 ||
    filters.venueType.length > 0 ||
    filters.priceMax !== null ||
    openNowOn ||
    freeOnlyOn;

  const clearAllFilters = useCallback(() => {
    clearFilters();
    setOpenNowOn(false);
    setFreeOnlyOn(false);
  }, [clearFilters]);

  // ---- Sheet -----------------------------------------------------------------
  const handleSheetChange = useCallback((index: number) => {
    track(EVENT_EXPLORE_SHEET_SNAPPED, { index });
  }, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<ExploreVenueGroup> | null | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: true,
      });
    },
    []
  );

  const renderCard = useCallback(
    ({ item }: { item: ExploreVenueGroup }) => (
      <ExploreCard group={item} userCoords={userCoords} onPress={() => handleCardPress(item.venue.id)} />
    ),
    [userCoords, handleCardPress]
  );

  // Counts come from the (chip-filtered) results, per-field — matches the
  // "N fields near you" / "M free to play" header copy exactly.
  const fieldsNearYouCount = filteredResults.length;
  const freeFieldsCount = useMemo(
    () =>
      filteredResults.filter((r) => isFreeVenue(r.venue.venue_type, r.field.price_per_hour))
        .length,
    [filteredResults]
  );

  const denied = permissionStatus === "denied";
  const areaLabel = location.text || "this area";

  const showSkeleton = isLoading && groups.length === 0;
  const showEmpty = !isLoading && groups.length === 0;

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onRegionChangeComplete={handleRegionChange}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {markerSlots.map((g, i) => (
          <VenueMarkerSlot key={`slot-${i}`} group={g} onPress={handleMarkerPress} />
        ))}

        {/* Selection halo — always mounted, see VenueMarkerSlot for why. */}
        <Circle
          center={selectedCoord}
          radius={selectedGroup ? 90 : 0.1}
          fillColor={selectedGroup ? colors.brand + "33" : "transparent"}
          strokeColor={selectedGroup ? colors.brand : "transparent"}
          strokeWidth={selectedGroup ? 3 : 0}
        />
        <Marker
          coordinate={selectedCoord}
          opacity={selectedGroup ? 1 : 0}
          tracksViewChanges={false}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={999}
          pointerEvents="none"
        >
          <VenuePin mode="selected" venueName="" />
        </Marker>
      </MapView>

      {/* Top overlay: floating search pill + chips row */}
      <View pointerEvents="box-none" style={[styles.topOverlay, { top: insets.top + spacing.sm }]}>
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={
            denied
              ? "Set location. Tap to enable location access."
              : `Fields near ${areaLabel}. Tap to change area.`
          }
          style={({ pressed }) => [
            styles.searchPill,
            {
              backgroundColor: denied ? colors.brand + "1F" : colors.surfaceElevated,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons
            name={denied ? "warning-outline" : "search"}
            size={18}
            color={colors.brand}
          />
          <Text
            size="md"
            weight="medium"
            numberOfLines={1}
            style={[styles.searchPillText, { color: denied ? colors.brand : colors.textPrimary }]}
          >
            {denied ? "Set location" : `Fields near ${areaLabel}`}
          </Text>
        </Pressable>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          <ExploreChip label="Open now" active={openNowOn} onPress={toggleOpenNow} />
          <ExploreChip label="Free" active={freeOnlyOn} onPress={toggleFreeOnly} />
          <ExploreChip
            label="Surface"
            active={filters.surface.length > 0}
            onPress={() => openFiltersFromChip("surface")}
          />
          <ExploreChip
            label="Size"
            active={filters.size.length > 0}
            onPress={() => openFiltersFromChip("size")}
          />
          <ExploreChip
            label="Price"
            active={filters.priceMax !== null}
            onPress={() => openFiltersFromChip("price")}
          />
        </ScrollView>

        {overflowCount > 0 ? (
          <View
            style={[styles.banner, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            accessibilityLiveRegion="polite"
          >
            <Text size="xs" variant="secondary">
              Showing {MAX_MARKERS} of {placeableCount} venues. Move the map to see others.
            </Text>
          </View>
        ) : null}

        {permissionStatus === "granted" && coordsFetchFailed ? (
          <View
            style={[styles.banner, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            accessibilityLiveRegion="polite"
          >
            <Text size="sm" variant="secondary">
              Couldn&apos;t read your location. Showing results near downtown Toronto.
            </Text>
          </View>
        ) : null}
      </View>

      {/* Recenter-on-me control, docked above the sheet's lowest snap point. */}
      <Pressable
        onPress={() => void handleUseMyLocation()}
        accessibilityRole="button"
        accessibilityLabel="Recenter on my location"
        hitSlop={spacing.sm}
        style={({ pressed }) => [
          styles.recenterBtn,
          {
            bottom: winHeight * 0.22 + spacing.md,
            backgroundColor: colors.surfaceElevated,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons name="locate" size={22} color={colors.brand} />
      </Pressable>

      {/* OpenStreetMap attribution — ODbL license requires visible credit
          for OSM-derived venue data. */}
      <Pressable
        onPress={() => Linking.openURL("https://www.openstreetmap.org/copyright")}
        accessibilityRole="link"
        accessibilityLabel="OpenStreetMap copyright"
        style={[
          styles.attribution,
          { bottom: winHeight * 0.22 + 4, backgroundColor: colors.surfaceElevated },
        ]}
      >
        <Text size="xs" variant="secondary">
          © OpenStreetMap
        </Text>
      </Pressable>

      {/* Bottom sheet — always present at (at least) the lowest snap point. */}
      <BottomSheet
        index={0}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        onChange={handleSheetChange}
        backgroundStyle={{ backgroundColor: colors.surfaceElevated }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <View style={styles.sheetHeader}>
          <Text size="md" weight="bold">
            {fieldsNearYouCount} {fieldsNearYouCount === 1 ? "field" : "fields"} near you
          </Text>
          <Text size="sm" variant="secondary">
            {freeFieldsCount} free to play
          </Text>
        </View>

        {staleFromCache ? (
          <View
            style={[
              styles.offlineBanner,
              { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
            ]}
            accessibilityLiveRegion="polite"
          >
            <Ionicons name="cloud-offline-outline" size={16} color={colors.textSecondary} />
            <Text size="sm" variant="secondary" style={styles.offlineBannerText}>
              Showing saved results since we couldn&apos;t reach the server.
            </Text>
          </View>
        ) : null}

        {showSkeleton ? (
          <BottomSheetScrollView
            accessibilityLabel="Loading fields"
            accessibilityLiveRegion="polite"
            contentContainerStyle={[styles.listContent, { gap: spacing.md }]}
          >
            {Array.from({ length: 5 }, (_, i) => (
              <ExploreCardSkeleton key={i} />
            ))}
          </BottomSheetScrollView>
        ) : showEmpty ? (
          <BottomSheetScrollView contentContainerStyle={styles.emptyContent}>
            <EmptyState
              icon={error ? "cloud-offline-outline" : "search-outline"}
              title={
                hasAnyFilter
                  ? "No fields match your filters"
                  : error
                    ? "Couldn't load fields"
                    : "No fields here"
              }
              description={
                hasAnyFilter
                  ? "Try removing a filter or widening your search."
                  : error
                    ? "Check your connection and try again."
                    : "Pan the map or pick another area."
              }
              actionLabel={hasAnyFilter ? "Clear filters" : undefined}
              onAction={hasAnyFilter ? clearAllFilters : undefined}
            />
          </BottomSheetScrollView>
        ) : (
          <BottomSheetFlatList
            ref={listRef}
            data={groups}
            keyExtractor={(g) => g.venue.id}
            renderItem={renderCard}
            getItemLayout={getItemLayout}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + spacing.xl },
            ]}
          />
        )}
      </BottomSheet>

      <LocationPickerSheet
        ref={pickerRef}
        permissionStatus={permissionStatus}
        onSelect={handleSelectCity}
        onUseMyLocation={handleUseMyLocation}
        onRequestPermission={handleRequestPermission}
        searchValue={location.text}
        onSearchChange={(text) => setLocation(text)}
        onSearchSubmit={closePicker}
      />

      <FiltersSheet
        visible={filtersOpen}
        filters={filters}
        setFilter={setFilter}
        clearAll={clearAllFilters}
        resultCount={total}
        isLoading={isLoading}
        onClose={() => setFiltersOpen(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chip — active fill is textPrimary-on-light / chalk-on-dark (both of which
// `colors.textPrimary` already resolves to per palette.ts), matching the
// mockup's `.fzchip.on`. This is deliberately NOT the shared `Chip.tsx`
// component, whose active state fills brand-orange — a different treatment
// than this screen's chips call for.
// ---------------------------------------------------------------------------

function ExploreChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.textPrimary : colors.surfaceElevated,
          borderColor: active ? colors.textPrimary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        size="sm"
        weight="medium"
        numberOfLines={1}
        style={{ color: active ? colors.surface : colors.textPrimary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  searchPill: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.pill,
    gap: spacing.sm,
    alignSelf: "flex-start",
    maxWidth: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchPillText: {
    flexShrink: 1,
  },
  chipsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  recenterBtn: {
    position: "absolute",
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  attribution: {
    position: "absolute",
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  offlineBannerText: {
    flex: 1,
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  emptyContent: {
    flexGrow: 1,
  },
});
