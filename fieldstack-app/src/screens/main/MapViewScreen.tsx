import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { FilterToolbar } from "../../components/FilterToolbar";
import { ResultCountPill } from "../../components/ResultCountPill";
import { SearchInput } from "../../components/SearchInput";
import { Text } from "../../components/Text";
import { VenueMapCard } from "../../components/VenueMapCard";
import { VenuePin } from "../../components/VenuePin";
import { useFieldSearch } from "../../hooks/useFieldSearch";
import { useFilterControls } from "../../hooks/useFilterControls";
import { useLocation } from "../../hooks/useLocation";
import { haversineKm } from "../../lib/distance";
import { getLastRegion, setLastRegion } from "../../lib/mapState";
import { useSavedVenues } from "../../lib/savedVenues";
import type { MainStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { SearchResult } from "../../types/api";

type Nav = NativeStackNavigationProp<MainStackParamList, "MapView">;

const PAN_REFETCH_THRESHOLD_KM = 5;
const DEFAULT_DELTA = 0.15; // ~16km — comfortable starting zoom for a city
const DEFAULT_TORONTO: Region = {
  latitude: 43.6709,
  longitude: -79.3863,
  latitudeDelta: DEFAULT_DELTA,
  longitudeDelta: DEFAULT_DELTA,
};

// One pin per venue, even when the venue has multiple matching fields.
// `minPrice` is the lowest per-hour price across that venue's priced fields,
// or null when no field at the venue has a price.
type VenueMarker = {
  venue: SearchResult["venue"];
  fieldCount: number;
  minPrice: number | null;
};

function groupByVenue(results: SearchResult[]): VenueMarker[] {
  const map = new Map<string, VenueMarker>();
  for (const r of results) {
    const price = r.field.price_per_hour;
    const existing = map.get(r.venue.id);
    if (existing) {
      existing.fieldCount += 1;
      if (price !== null) {
        existing.minPrice =
          existing.minPrice === null ? price : Math.min(existing.minPrice, price);
      }
    } else {
      map.set(r.venue.id, {
        venue: r.venue,
        fieldCount: 1,
        minPrice: price,
      });
    }
  }
  return Array.from(map.values());
}

/**
 * True when the venue's lat/lng sits inside the camera's visible region
 * (center ± half of each delta). Treats a venue with no coords as not
 * visible — they can't render as a pin anyway.
 */
function isInRegion(venue: SearchResult["venue"], region: Region): boolean {
  if (venue.lat === null || venue.lng === null) return false;
  const latMin = region.latitude - region.latitudeDelta / 2;
  const latMax = region.latitude + region.latitudeDelta / 2;
  const lngMin = region.longitude - region.longitudeDelta / 2;
  const lngMax = region.longitude + region.longitudeDelta / 2;
  return (
    venue.lat >= latMin &&
    venue.lat <= latMax &&
    venue.lng >= lngMin &&
    venue.lng <= lngMax
  );
}

/**
 * Wraps a single venue's `<Marker>` with the "track once" pattern:
 *
 * - On mount, render with `tracksViewChanges={true}` so the native marker
 *   captures a fresh snapshot of the React-tree-rendered VenuePin.
 * - After a short delay, flip tracking off so subsequent panning/zooming
 *   doesn't trigger re-snapshots — those constant re-snapshots show up as
 *   the "glitchy disappear/reappear" pins on iOS.
 * - When the pin becomes selected (or its content changes via price/count),
 *   tracking re-enables briefly so the new visual is captured.
 *
 * Wrapped in React.memo with a value-based comparison so parent re-renders
 * (selection change on a sibling marker, filter chip taps, region pans)
 * don't reach down into every Marker. Without this, every parent re-render
 * passes a fresh `coordinate` object and a fresh `marker` reference to
 * the native side; the cluster lib re-evaluates which pins to cluster,
 * tracksViewChanges flips on, and the resulting snapshot race can briefly
 * draw a Marker at its container's local (0,0) — the "ghost pin in the
 * top-left corner" bug.
 */
type VenueMarkerProps = {
  marker: VenueMarker;
  isSelected: boolean;
  onPress: (venueId: string) => void;
};

const VenueMarker = memo(
  function VenueMarker({ marker, isSelected, onPress }: VenueMarkerProps) {
    const hasPositivePrice = marker.minPrice !== null && marker.minPrice > 0;
    const [tracking, setTracking] = useState(true);

    // Re-enable tracking briefly whenever the visual content changes (selection
    // flip, or price/count update from a filter). 250ms is enough for the
    // native snapshot to capture the new appearance before we turn it off.
    useEffect(() => {
      setTracking(true);
      const id = setTimeout(() => setTracking(false), 250);
      return () => clearTimeout(id);
    }, [isSelected, hasPositivePrice, marker.minPrice, marker.fieldCount]);

    // Stable coordinate object — a fresh `{ latitude, longitude }` literal on
    // every render makes the native Marker treat the location as "changed"
    // even when the numbers are identical, retriggering layout work that
    // races with tracksViewChanges.
    const coordinate = useMemo(
      () => ({ latitude: marker.venue.lat ?? 0, longitude: marker.venue.lng ?? 0 }),
      [marker.venue.lat, marker.venue.lng]
    );

    if (marker.venue.lat === null || marker.venue.lng === null) return null;

    return (
      <Marker
        coordinate={coordinate}
        onPress={(e) => {
          // Without stopPropagation the MapView's onPress also fires and
          // immediately deselects the venue we just tapped.
          e.stopPropagation();
          onPress(marker.venue.id);
        }}
        tracksViewChanges={tracking}
      >
        {hasPositivePrice && marker.minPrice !== null ? (
          <VenuePin
            mode="price"
            price={marker.minPrice}
            fieldCount={marker.fieldCount}
            venueName={marker.venue.name}
            selected={isSelected}
          />
        ) : (
          <VenuePin
            mode="count"
            fieldCount={marker.fieldCount}
            venueName={marker.venue.name}
            selected={isSelected}
          />
        )}
      </Marker>
    );
  },
  // Value-based skip. groupByVenue allocates new `marker` objects on every
  // search result change even when the underlying values are the same — we
  // only want a re-render when something *visible* changed.
  (prev, next) =>
    prev.isSelected === next.isSelected &&
    prev.onPress === next.onPress &&
    prev.marker.venue.id === next.marker.venue.id &&
    prev.marker.venue.lat === next.marker.venue.lat &&
    prev.marker.venue.lng === next.marker.venue.lng &&
    prev.marker.venue.name === next.marker.venue.name &&
    prev.marker.fieldCount === next.marker.fieldCount &&
    prev.marker.minPrice === next.marker.minPrice
);

export function MapViewScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const { coords: userCoords } = useLocation();
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
  const { toolbarProps, sheets } = useFilterControls(
    filters,
    setFilter,
    total,
    isLoading,
    clearFilters
  );

  // Initial region: prior session position if we have one, else user coords,
  // else downtown Toronto.
  const initialRegion = useMemo<Region>(() => {
    const cached = getLastRegion();
    if (cached) return cached;
    if (userCoords) {
      return {
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      };
    }
    return DEFAULT_TORONTO;
    // Calculated once at mount — re-running on userCoords change would jerk
    // the camera while the user is interacting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Last center we actually ran a search against. Used to decide when to show
  // the "Search this area" button.
  const lastSearchCenterRef = useRef<{ lat: number; lng: number }>({
    lat: initialRegion.latitude,
    lng: initialRegion.longitude,
  });

  const [showSearchHere, setShowSearchHere] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  // Tracked alongside the persisted ref so React can derive `visibleMarkers`
  // from the current camera bounds — "X venues" should reflect what's in
  // the visible region, not the total result set.
  //
  // Seed from getLastRegion() if available so a returning user sees the
  // correct count on first paint instead of a "0 venues" flash before the
  // map's first onRegionChangeComplete fires.
  const [currentRegion, setCurrentRegion] = useState<Region>(
    () => getLastRegion() ?? initialRegion
  );
  const mapRef = useRef<MapView>(null);
  const { isSaved, toggle: toggleSaved } = useSavedVenues();
  // Set true right before a programmatic animateToRegion; cleared by the
  // resulting onRegionChangeComplete. Prevents the pin-tap re-center from
  // tripping the "Search this area" pill via the distance threshold check.
  const isProgrammaticPanRef = useRef(false);

  // Drives the fade/slide-in for the "Search this area" pill.
  const searchHereOpacity = useRef(new Animated.Value(0)).current;
  const searchHereOffset = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(searchHereOpacity, {
        toValue: showSearchHere ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(searchHereOffset, {
        toValue: showSearchHere ? 0 : -8,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [showSearchHere, searchHereOpacity, searchHereOffset]);

  const markers = useMemo(() => groupByVenue(results), [results]);

  // Markers within the current camera bounds. Drives the ResultCountPill so
  // "X venues" reflects the visible region rather than the full result set.
  const visibleMarkers = useMemo(
    () => markers.filter((m) => isInRegion(m.venue, currentRegion)),
    [markers, currentRegion]
  );

  // Currently selected venue's marker, if any. Drives the single bottom card.
  const selectedMarker = useMemo(
    () =>
      selectedVenueId
        ? markers.find((m) => m.venue.id === selectedVenueId) ?? null
        : null,
    [markers, selectedVenueId]
  );

  // Successful geocode → fly the map to the new coords. Without this the
  // search bar would update location state but the camera would sit still,
  // which feels broken (typing "Mississauga" should pan the map there).
  // Mark the pan as programmatic so it doesn't trip "Search this area".
  useEffect(() => {
    if (location.lat === null || location.lng === null) return;
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
    lastSearchCenterRef.current = { lat: location.lat, lng: location.lng };
  }, [location.lat, location.lng]);

  // Google-Maps pattern: no auto-select. Card stays hidden until the user
  // taps a pin. Tapping empty map clears selection and slides the card away.

  const handleRegionChange = useCallback((region: Region) => {
    setLastRegion(region);
    setCurrentRegion(region);
    // Skip the pan-distance check when the camera just moved because of a
    // programmatic re-center (pin tap). The user didn't pan.
    if (isProgrammaticPanRef.current) {
      isProgrammaticPanRef.current = false;
      return;
    }
    const dist = haversineKm(
      { lat: region.latitude, lng: region.longitude },
      { lat: lastSearchCenterRef.current.lat, lng: lastSearchCenterRef.current.lng }
    );
    setShowSearchHere(dist > PAN_REFETCH_THRESHOLD_KM);
  }, []);

  const handleSearchHere = () => {
    const region = getLastRegion();
    if (!region) return;
    lastSearchCenterRef.current = { lat: region.latitude, lng: region.longitude };
    setShowSearchHere(false);
    // Re-anchor the search at the new center. Empty text leaves the existing
    // location label in place — the user explicitly panned, so we just need
    // the new coords on the wire.
    setLocation("", { lat: region.latitude, lng: region.longitude });
  };

  /**
   * Smoothly pan the map onto a venue when its pin is tapped. Marks the
   * resulting region change as programmatic so it doesn't trip "Search this
   * area".
   *
   * Camera target is shifted south by ~0.18 of latitudeDelta so the pin
   * lands in the upper portion of the visible map — the bottom card
   * occupies roughly that much of the screen.
   */
  const panToVenue = useCallback((venueId: string) => {
    const marker = markers.find((m) => m.venue.id === venueId);
    if (
      !marker ||
      marker.venue.lat === null ||
      marker.venue.lng === null ||
      !mapRef.current
    ) {
      return;
    }
    if (isInRegion(marker.venue, currentRegion)) return;

    const cached = getLastRegion();
    const latDelta = cached?.latitudeDelta ?? DEFAULT_DELTA;
    const lngDelta = cached?.longitudeDelta ?? DEFAULT_DELTA;
    isProgrammaticPanRef.current = true;
    mapRef.current.animateToRegion(
      {
        latitude: marker.venue.lat - latDelta * 0.18,
        longitude: marker.venue.lng,
        latitudeDelta: latDelta,
        longitudeDelta: lngDelta,
      },
      300
    );
  }, [markers, currentRegion]);

  // Stable callback — VenueMarker is memoized on prop equality, so a fresh
  // function identity on every render would force every marker to re-render
  // and undo the memo. `panToVenue` is already useCallback'd.
  const handleMarkerPress = useCallback(
    (venueId: string) => {
      setSelectedVenueId(venueId);
      panToVenue(venueId);
    },
    [panToVenue]
  );

  const handleMapPress = () => {
    setSelectedVenueId(null);
  };

  const handleCardPress = useCallback(
    (venueId: string) => {
      nav.navigate("VenueDetail", { venueId });
    },
    [nav]
  );

  // Slide the bottom card up when a venue is selected, down when cleared.
  // Translate range: 0 = card visible, +320 = card hidden well below screen.
  // 320 generously over-hides — the Google-Maps card is taller than the old
  // carousel card and the insets.bottom safe area adds another ~34pt.
  const cardOffset = useRef(new Animated.Value(320)).current;
  useEffect(() => {
    Animated.spring(cardOffset, {
      toValue: selectedMarker ? 0 : 320,
      useNativeDriver: true,
      friction: 9,
      tension: 90,
    }).start();
  }, [selectedMarker, cardOffset]);

  return (
    <View style={styles.root}>
      {/* Plain MapView (no clustering). At our current scope (~tens of
          venues) clustering buys nothing and react-native-map-clustering's
          full child re-evaluation on every state change was the source of
          the pin flicker. Re-introduce clustering only if results exceed
          ~50 visible markers. */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onRegionChangeComplete={handleRegionChange}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {markers.map((m) => {
          if (m.venue.lat === null || m.venue.lng === null) return null;
          return (
            <VenueMarker
              key={m.venue.id}
              marker={m}
              isSelected={selectedVenueId === m.venue.id}
              onPress={handleMarkerPress}
            />
          );
        })}
      </MapView>

      {/* Top overlay: search bar (with list-view icon) + filter chips */}
      <View
        pointerEvents="box-none"
        style={[styles.topOverlay, { top: insets.top + spacing.sm }]}
      >
        <View style={styles.searchRow} pointerEvents="box-none">
          <View style={styles.searchWrap} pointerEvents="auto">
            <SearchInput
              value={location.text}
              onChangeText={(t) => setLocation(t)}
              error={locationError?.message ?? null}
              placeholder="Search city, neighbourhood, or postal"
            />
          </View>
          <Pressable
            onPress={() => nav.goBack()}
            accessibilityRole="button"
            accessibilityLabel="List view"
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: colors.surface,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="list" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* `auto` (not `box-none`) so the buttons reliably receive taps —
            same iOS bug as the prior chip row. The 44pt band blocks map
            gestures only directly under the buttons. */}
        <View style={styles.chipsWrap} pointerEvents="auto">
          <FilterToolbar {...toolbarProps} />
        </View>

        {/* Result count — live-updates as filters / pan apply */}
        <View
          pointerEvents="none"
          style={styles.countRow}
        >
          <ResultCountPill
            count={visibleMarkers.length}
            noun="venue"
            loading={isLoading}
          />
        </View>

        {/* "Search this area" — fades + slides in after a meaningful pan */}
        <Animated.View
          pointerEvents={showSearchHere ? "auto" : "none"}
          style={[
            styles.searchHereWrap,
            {
              opacity: searchHereOpacity,
              transform: [{ translateY: searchHereOffset }],
            },
          ]}
        >
          <Pressable
            onPress={handleSearchHere}
            accessibilityRole="button"
            accessibilityLabel="Search this area"
            accessibilityElementsHidden={!showSearchHere}
            importantForAccessibility={showSearchHere ? "yes" : "no-hide-descendants"}
            style={({ pressed }) => [
              styles.searchHere,
              {
                backgroundColor: colors.surface,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Ionicons
              name="refresh"
              size={16}
              color={colors.textPrimary}
              style={{ marginRight: spacing.xs }}
            />
            <Text size="sm" weight="medium">
              Search this area
            </Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* No results — guide the user back to something useful instead of
          leaving them on an empty map. Active filter clear or "Search this
          area" both move forward; matches the FieldSearchScreen empty
          treatment so behavior reads as one product, not two. */}
      {!isLoading && markers.length === 0 ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.emptyOverlay,
            { paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          <View
            pointerEvents="auto"
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <EmptyState
              icon="map-outline"
              title={
                filters.surface.length > 0 ||
                filters.size.length > 0 ||
                filters.venueType.length > 0 ||
                filters.priceMax !== null
                  ? "No fields match your filters here"
                  : "No fields in this area"
              }
              description={
                filters.surface.length > 0 ||
                filters.size.length > 0 ||
                filters.venueType.length > 0 ||
                filters.priceMax !== null
                  ? "Try clearing a filter or panning to a wider area."
                  : "Try panning to a different neighbourhood or widening your search."
              }
              actionLabel="Search this area"
              onAction={handleSearchHere}
            />
          </View>
        </View>
      ) : null}

      {/* Bottom card — Google Maps style. One card for the selected venue,
          slides up from below the screen on pin tap. Always mounted (so the
          animation works in both directions); offscreen when nothing is
          selected. */}
      <Animated.View
        pointerEvents={selectedMarker ? "box-none" : "none"}
        style={[
          styles.cardWrap,
          {
            // No wrapper padding — the card itself carries the
            // bottom inset so its white surface goes flush to the screen
            // edge with no map showing through underneath.
            transform: [{ translateY: cardOffset }],
          },
        ]}
      >
        {selectedMarker ? (
          <View pointerEvents="auto">
            <VenueMapCard
              venue={selectedMarker.venue}
              fieldCount={selectedMarker.fieldCount}
              minPrice={selectedMarker.minPrice}
              userCoords={userCoords}
              isSaved={isSaved(selectedMarker.venue.id)}
              onPress={() => handleCardPress(selectedMarker.venue.id)}
              onToggleSave={() => void toggleSaved(selectedMarker.venue.id)}
            />
          </View>
        ) : null}
      </Animated.View>

      {sheets}
    </View>
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
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  searchWrap: {
    flex: 1,
    // Lift the input off the map base layer so it reads on light + dark
    // satellite tiles. Matches the list-icon's existing shadow weight so
    // they sit together as a single floating row.
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chipsWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  chipsContent: {
    paddingVertical: 0,
  },
  countRow: {
    alignItems: "center",
    marginTop: spacing.md,
  },
  searchHereWrap: {
    alignItems: "center",
    marginTop: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  searchHere: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  emptyOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  emptyCard: {
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 360,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
