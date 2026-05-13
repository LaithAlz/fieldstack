import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import ClusteredMapView from "react-native-map-clustering";
import MapView, { Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilterChipBar } from "../../components/FilterChipBar";
import { ResultCountPill } from "../../components/ResultCountPill";
import { SearchInput } from "../../components/SearchInput";
import { Text } from "../../components/Text";
import { VenueMapCard, VENUE_MAP_CARD_WIDTH } from "../../components/VenueMapCard";
import { VenuePin } from "../../components/VenuePin";
import { useFieldSearch } from "../../hooks/useFieldSearch";
import { useLocation } from "../../hooks/useLocation";
import { haversineKm } from "../../lib/distance";
import { getLastRegion, setLastRegion } from "../../lib/mapState";
import { useSavedVenues } from "../../lib/savedVenues";
import type { MainStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { SearchResult } from "../../types/api";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_GAP = 12;
const CARD_SNAP = VENUE_MAP_CARD_WIDTH + CARD_GAP;
const CARD_SIDE_PEEK = (SCREEN_WIDTH - VENUE_MAP_CARD_WIDTH) / 2;

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

export function MapViewScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const { coords: userCoords } = useLocation();
  const {
    results,
    isLoading,
    filters,
    location,
    locationError,
    setFilter,
    setLocation,
  } = useFieldSearch();

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
  // from the current camera bounds — "12 venues" should reflect what's on
  // screen, not the total result set.
  const [currentRegion, setCurrentRegion] = useState<Region>(initialRegion);
  const mapRef = useRef<MapView>(null);
  const carouselRef = useRef<FlatList<VenueMarker>>(null);
  // Set true right before a programmatic scrollToOffset on the carousel; the
  // resulting onMomentumScrollEnd reads + clears it. Without this, an animated
  // scroll-to-card can settle one sub-pixel index off and re-flip the
  // selection back to the neighbour, ping-ponging with the pin tap.
  const programmaticScrollRef = useRef(false);
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
  // "X venues" matches what's actually on screen, not the unfiltered result
  // set. The carousel intentionally keeps the full marker list so swiping
  // doesn't change cards out from under the user while they're scrolling.
  const visibleMarkers = useMemo(
    () => markers.filter((m) => isInRegion(m.venue, currentRegion)),
    [markers, currentRegion]
  );

  const selectedIndex = useMemo(
    () =>
      selectedVenueId
        ? markers.findIndex((m) => m.venue.id === selectedVenueId)
        : -1,
    [markers, selectedVenueId]
  );

  // Pin tap → scroll the carousel to that card so card + pin stay in sync.
  // Guard against scrolling before the FlatList has measured (offset === -1).
  useEffect(() => {
    if (selectedIndex < 0) return;
    programmaticScrollRef.current = true;
    carouselRef.current?.scrollToOffset({
      offset: selectedIndex * CARD_SNAP,
      animated: true,
    });
  }, [selectedIndex]);

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

  // Note: previously we default-selected the first marker on results-load
  // for visual parity with Airbnb's carousel. With clustering on at city
  // zoom most pins live inside a cluster bubble — selecting one would show
  // a card as "active" with no visible pin anchor on the map, which reads
  // as a glitch. Let the user pick by swipe / tap instead.

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
   * Smoothly pan/zoom the map onto a venue. Shared by pin-tap and the
   * carousel-swipe handler so both interactions feel equivalent. Marks
   * the resulting region change as programmatic so it doesn't trip
   * "Search this area".
   *
   * Camera target is shifted south by ~0.12 of latitudeDelta so the pin
   * lands in the upper-middle of the visible map (the ~140pt carousel
   * occupies the bottom).
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
    const cached = getLastRegion();
    const latDelta = cached?.latitudeDelta ?? DEFAULT_DELTA;
    const lngDelta = cached?.longitudeDelta ?? DEFAULT_DELTA;
    isProgrammaticPanRef.current = true;
    mapRef.current.animateToRegion(
      {
        latitude: marker.venue.lat - latDelta * 0.12,
        longitude: marker.venue.lng,
        latitudeDelta: latDelta,
        longitudeDelta: lngDelta,
      },
      300
    );
  }, [markers]);

  const handleMarkerPress = (venueId: string) => {
    setSelectedVenueId(venueId);
    panToVenue(venueId);
  };

  const handleMapPress = () => {
    setSelectedVenueId(null);
  };

  // Carousel → pin sync. When the user swipes the cards horizontally, snap
  // the selection to whichever card is now centered. Uses momentum-scroll-end
  // rather than onScroll so we don't fire mid-flick (would re-center the map
  // on every intermediate index).
  const handleCarouselMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Ignore the momentum-end from our own scrollToOffset; otherwise a sub-
      // pixel landing can flip selection back to the neighbour, ping-ponging
      // against the pin-tap effect.
      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false;
        return;
      }
      const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_SNAP);
      const venueId = markers[idx]?.venue.id;
      if (venueId && venueId !== selectedVenueId) {
        setSelectedVenueId(venueId);
        // Carousel-swipe should drive the map the same way pin-tap does:
        // re-center on the newly selected venue so the user actually sees
        // where the card they're looking at lives.
        panToVenue(venueId);
      }
    },
    [markers, selectedVenueId, panToVenue]
  );

  const handleCardPress = useCallback(
    (venueId: string) => {
      nav.navigate("VenueDetail", { venueId });
    },
    [nav]
  );

  return (
    <View style={styles.root}>
      <ClusteredMapView
        mapRef={(ref) => {
          // ClusteredMapView passes back the underlying react-native-maps ref
          // via a callback (not the standard ref prop). Stash it on our own
          // ref so animateToRegion still works.
          (mapRef as React.MutableRefObject<MapView | null>).current =
            (ref as unknown as MapView | null) ?? null;
        }}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onRegionChangeComplete={handleRegionChange}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton={false}
        clusterColor={colors.brand}
        // surface is white in light mode (vs green-700 brand: ~5:1 — passes
        // AA) and near-black in dark mode (vs green-500 brand: ~10:1). White
        // alone fails AA against the dark-mode brand at 2.15:1.
        clusterTextColor={colors.surface}
        // Bump min before clustering kicks in — single pins read fine; pairs
        // also OK; 3+ overlap-prone clusters benefit from the count circle.
        minPoints={3}
        radius={50}
        onClusterPress={() => {
          // Cluster tap → lib calls fitToCoordinates → our
          // onRegionChangeComplete fires. Flag it as programmatic so the
          // "Search this area" pill doesn't flash from a fit-induced pan.
          programmaticScrollRef.current = false;
          isProgrammaticPanRef.current = true;
        }}
      >
        {markers.map((m) => {
          if (m.venue.lat === null || m.venue.lng === null) return null;
          const isSelected = selectedVenueId === m.venue.id;
          // Treat free / zero-price fields as "no price" so the pin falls back
          // to a count circle instead of rendering "$0", which reads as a
          // missing-data glitch.
          const hasPositivePrice = m.minPrice !== null && m.minPrice > 0;
          // Encode the mode + price into the key so react-native-maps forces
          // a marker remount (and a fresh bitmap snapshot) when filters flip
          // a venue's price or count. Without this, `tracksViewChanges` stays
          // false on non-selected pins and the stale snapshot persists.
          const markerKey = `${m.venue.id}-${hasPositivePrice ? `p${m.minPrice}` : `c${m.fieldCount}`}`;
          return (
            <Marker
              key={markerKey}
              coordinate={{ latitude: m.venue.lat, longitude: m.venue.lng }}
              onPress={(e) => {
                // Without stopPropagation the MapView's onPress also fires
                // and immediately deselects the venue we just tapped.
                e.stopPropagation();
                handleMarkerPress(m.venue.id);
              }}
              // react-native-maps snapshots markers when tracksViewChanges is
              // false. Enable tracking only on the selected pin so its spring
              // animation propagates to the native marker.
              tracksViewChanges={isSelected}
            >
              {hasPositivePrice && m.minPrice !== null ? (
                <VenuePin
                  mode="price"
                  price={m.minPrice}
                  fieldCount={m.fieldCount}
                  venueName={m.venue.name}
                  selected={isSelected}
                />
              ) : (
                <VenuePin
                  mode="count"
                  fieldCount={m.fieldCount}
                  venueName={m.venue.name}
                  selected={isSelected}
                />
              )}
            </Marker>
          );
        })}
      </ClusteredMapView>

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

        <View style={styles.chipsWrap} pointerEvents="box-none">
          <FilterChipBar
            filters={filters}
            setFilter={setFilter}
            contentStyle={styles.chipsContent}
          />
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

      {/* Bottom result carousel — snap-to-card, pin↔card sync */}
      {markers.length > 0 ? (
        <View
          pointerEvents="box-none"
          style={[styles.carouselWrap, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <FlatList
            ref={carouselRef}
            data={markers}
            keyExtractor={(m) => m.venue.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            // snapToInterval (vs pagingEnabled) so each card snaps even though
            // CARD_SNAP is narrower than the screen — gives the peek-next-card
            // feel that Airbnb / Hotel Tonight use.
            snapToInterval={CARD_SNAP}
            decelerationRate="fast"
            contentContainerStyle={styles.carouselContent}
            ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
            onMomentumScrollEnd={handleCarouselMomentumEnd}
            renderItem={({ item }) => (
              <VenueMapCard
                venue={item.venue}
                fieldCount={item.fieldCount}
                minPrice={item.minPrice}
                userCoords={userCoords}
                isSaved={isSaved(item.venue.id)}
                onPress={() => handleCardPress(item.venue.id)}
                onToggleSave={() => void toggleSaved(item.venue.id)}
              />
            )}
          />
        </View>
      ) : null}
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
  carouselWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  carouselContent: {
    paddingHorizontal: CARD_SIDE_PEEK,
  },
});
