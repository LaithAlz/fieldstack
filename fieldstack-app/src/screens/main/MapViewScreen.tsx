import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "../../components/Text";
import { VenuePin } from "../../components/VenuePin";
import { VenuePreviewCard } from "../../components/VenuePreviewCard";
import { useFieldSearch } from "../../hooks/useFieldSearch";
import { useLocation } from "../../hooks/useLocation";
import { haversineKm } from "../../lib/distance";
import { getLastRegion, setLastRegion } from "../../lib/mapState";
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
type VenueMarker = {
  venue: SearchResult["venue"];
  fieldCount: number;
};

function groupByVenue(results: SearchResult[]): VenueMarker[] {
  const map = new Map<string, VenueMarker>();
  for (const r of results) {
    const existing = map.get(r.venue.id);
    if (existing) existing.fieldCount += 1;
    else map.set(r.venue.id, { venue: r.venue, fieldCount: 1 });
  }
  return Array.from(map.values());
}

export function MapViewScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const { coords: userCoords } = useLocation();
  const { results, setLocation } = useFieldSearch();

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
  const sheetRef = useRef<BottomSheetModal>(null);
  const mapRef = useRef<MapView>(null);

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
  const selectedMarker = selectedVenueId
    ? markers.find((m) => m.venue.id === selectedVenueId) ?? null
    : null;

  // Sheet visibility follows selectedVenueId.
  useEffect(() => {
    if (selectedMarker) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [selectedMarker]);

  const handleRegionChange = useCallback((region: Region) => {
    setLastRegion(region);
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

  const handleMarkerPress = (venueId: string) => {
    setSelectedVenueId(venueId);
    // Re-center so the pin sits above the bottom sheet (sheet snap = 180px).
    // We shift the camera target south of the pin so the pin lands in the
    // upper-middle of the visible area.
    const marker = markers.find((m) => m.venue.id === venueId);
    if (
      marker &&
      marker.venue.lat !== null &&
      marker.venue.lng !== null &&
      mapRef.current
    ) {
      const cached = getLastRegion();
      const latDelta = cached?.latitudeDelta ?? DEFAULT_DELTA;
      const lngDelta = cached?.longitudeDelta ?? DEFAULT_DELTA;
      mapRef.current.animateToRegion(
        {
          latitude: marker.venue.lat - latDelta * 0.2,
          longitude: marker.venue.lng,
          latitudeDelta: latDelta,
          longitudeDelta: lngDelta,
        },
        300
      );
    }
  };

  const handleMapPress = () => {
    setSelectedVenueId(null);
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.2}
      />
    ),
    []
  );

  const snapPoints = useMemo(() => [180], []);

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
        {markers.map((m) =>
          m.venue.lat !== null && m.venue.lng !== null ? (
            <Marker
              key={m.venue.id}
              coordinate={{ latitude: m.venue.lat, longitude: m.venue.lng }}
              onPress={(e) => {
                // Without stopPropagation the MapView's onPress also fires
                // and immediately deselects the venue we just tapped.
                e.stopPropagation();
                handleMarkerPress(m.venue.id);
              }}
              tracksViewChanges={false}
            >
              <VenuePin
                fieldCount={m.fieldCount}
                venueName={m.venue.name}
                selected={selectedVenueId === m.venue.id}
              />
            </Marker>
          ) : null
        )}
      </MapView>

      {/* List view button — top-left */}
      <View
        pointerEvents="box-none"
        style={[styles.topBar, { top: insets.top + spacing.sm }]}
      >
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

        {/* "Search this area" — fades + slides in after a meaningful pan */}
        <Animated.View
          pointerEvents={showSearchHere ? "auto" : "none"}
          style={{
            opacity: searchHereOpacity,
            transform: [{ translateY: searchHereOffset }],
          }}
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

        {/* Spacer so the icon button stays pinned at the left. */}
        <View style={{ width: 40 }} />
      </View>

      {/* Preview card sheet */}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        onChange={(i) => {
          if (i === -1) setSelectedVenueId(null);
        }}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetView style={styles.sheetContent}>
          {selectedMarker ? (
            <VenuePreviewCard
              venue={selectedMarker.venue}
              fieldCount={selectedMarker.fieldCount}
              userCoords={userCoords}
              onViewVenue={() => {
                const id = selectedMarker.venue.id;
                setSelectedVenueId(null);
                nav.navigate("VenueDetail", { venueId: id });
              }}
            />
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
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
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
});
