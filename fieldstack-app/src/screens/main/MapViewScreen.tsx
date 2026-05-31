import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
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
import { getLastRegion, setLastRegion } from "../../lib/mapState";
import { useSavedVenues } from "../../lib/savedVenues";
import type { MainStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { SearchResult } from "../../types/api";

type Nav = NativeStackNavigationProp<MainStackParamList, "MapView">;

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
 * Renders a single venue's <Marker>.
 *
 * tracksViewChanges={false} always — pins never re-snapshot during panning.
 * Pin appearance is static (no selection state), so the key only changes
 * when price or fieldCount changes — never on tap/deselect — eliminating
 * the remount-on-deselect flash. Selection feedback is the bottom card only.
 */
type VenueMarkerProps = {
  marker: VenueMarker;
  onPress: (venueId: string) => void;
};

const VenueMarker = memo(function VenueMarker({
  marker,
  onPress,
}: VenueMarkerProps) {
  const coordinate = useMemo(
    () => ({ latitude: marker.venue.lat ?? 0, longitude: marker.venue.lng ?? 0 }),
    [marker.venue.lat, marker.venue.lng]
  );

  if (marker.venue.lat === null || marker.venue.lng === null) return null;

  const hasPositivePrice = marker.minPrice !== null && marker.minPrice > 0;

  return (
    <Marker
      coordinate={coordinate}
      onPress={(e) => {
        e.stopPropagation();
        onPress(marker.venue.id);
      }}
      tracksViewChanges={false}
    >
      {hasPositivePrice && marker.minPrice !== null ? (
        <VenuePin
          mode="price"
          price={marker.minPrice}
          fieldCount={marker.fieldCount}
          venueName={marker.venue.name}
        />
      ) : (
        <VenuePin
          mode="count"
          fieldCount={marker.fieldCount}
          venueName={marker.venue.name}
        />
      )}
    </Marker>
  );
});

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
  // resulting onRegionChangeComplete. Prevents pin-tap / geocode pans from
  // triggering an auto-refetch (the user didn't pan, we did).
  const isProgrammaticPanRef = useRef(false);

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
  // Mark the pan as programmatic so it doesn't trip the auto-refetch.
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
  }, [location.lat, location.lng]);

  // Google-Maps pattern: no auto-select. Card stays hidden until the user
  // taps a pin. Tapping empty map clears selection and slides the card away.

  // Auto-refetch whenever the user settles the camera on a new region.
  // `onRegionChangeComplete` only fires when the pan ends, so we don't
  // hammer the API mid-drag — and useFieldSearch's 300ms debounce
  // coalesces rapid pans into one fetch.
  //
  // Reintroduce a "Search this area" button with a much larger threshold
  // (~3-city pan, ~50km) once the dataset grows enough that auto-refetch
  // on every pan becomes wasteful.
  const handleRegionChange = useCallback(
    (region: Region) => {
      setLastRegion(region);
      setCurrentRegion(region);
      if (isProgrammaticPanRef.current) {
        isProgrammaticPanRef.current = false;
        return;
      }
      setLocation("", { lat: region.latitude, lng: region.longitude });
    },
    [setLocation]
  );

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
          // Key only encodes content (price/count), not selection — pins
          // have no selected state so tapping never triggers a remount.
          const key = `${m.venue.id}-${m.fieldCount}-${m.minPrice ?? "x"}`;
          return (
            <VenueMarker
              key={key}
              marker={m}
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

      </View>

      {/* No results — descriptive only; auto-refetch on pan handles the
          "recover" action (the user just pans toward a city with venues).
          No CTA button because tapping it would be tautological. */}
      {!isLoading && markers.length === 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.emptyOverlay,
            { paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          <View
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
                  ? "Try clearing a filter or panning toward Oakville, Hamilton, or Milton."
                  : "Pan toward Oakville, Hamilton, or Milton to see venues."
              }
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

      {/* OpenStreetMap attribution — ODbL license requires visible credit
          for OSM-derived data (we got our venue list from Overpass).
          Tapping opens the OSM copyright page. Bottom-left, above Apple's
          own Maps attribution and the home indicator. Hidden when the
          bottom card is up so it's not double-stacked. */}
      {!selectedMarker ? (
        <Pressable
          onPress={() => Linking.openURL("https://www.openstreetmap.org/copyright")}
          accessibilityRole="link"
          accessibilityLabel="OpenStreetMap copyright"
          style={[
            styles.attribution,
            { bottom: insets.bottom + 4, backgroundColor: colors.surface },
          ]}
        >
          <Text size="xs" variant="secondary">
            © OpenStreetMap
          </Text>
        </Pressable>
      ) : null}

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
  cardWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
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
