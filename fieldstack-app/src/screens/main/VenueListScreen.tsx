import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { LocationPickerSheet } from "../../components/LocationPickerSheet";
import { LocationPill } from "../../components/LocationPill";
import { RecentlyViewedRow } from "../../components/RecentlyViewedRow";
import { SearchInput } from "../../components/SearchInput";
import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { VenueCard } from "../../components/VenueCard";
import { VenueCardSkeleton } from "../../components/VenueCardSkeleton";
import { WhenPill } from "../../components/WhenPicker";
import { useLocation } from "../../hooks/useLocation";
import { useVenues } from "../../hooks/useVenues";
import { lightImpact } from "../../lib/haptics";
import { useBookingHistory } from "../../lib/bookingHistory";
import { useRecentlyViewed } from "../../lib/recentlyViewed";
import { useSavedVenues } from "../../lib/savedVenues";
import {
  getCurrentCoords,
  openLocationSettings,
  requestPermission,
} from "../../lib/location";
import type { MainStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { VenueWithFields } from "../../types/api";

type Nav = NativeStackNavigationProp<MainStackParamList, "VenueList">;

export function VenueListScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const toast = useToast();
  const sheetRef = useRef<BottomSheetModal>(null);

  const {
    coords,
    label,
    permissionStatus,
    setManualLocation,
  } = useLocation();
  const { venues, loading, refreshing, error, refresh: refetchVenues } = useVenues({ coords });

  // Tactile feedback when the user triggers a refresh — matches standard
  // iOS/Android pull-to-refresh feel. Respects Reduce Motion via lightImpact.
  const refresh = useCallback(async () => {
    lightImpact();
    await refetchVenues();
  }, [refetchVenues]);
  const { saved: savedIds } = useSavedVenues();
  const { venueWasRecentlyAttempted } = useBookingHistory();
  const { recent: recentIds } = useRecentlyViewed();
  const [nameQuery, setNameQuery] = useState("");

  const filteredVenues = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const base = q ? venues.filter((v) => v.name.toLowerCase().includes(q)) : venues;
    // Saved venues float to the top while keeping the API's relative ordering.
    if (savedIds.size === 0) return base;
    const saved = base.filter((v) => savedIds.has(v.id));
    const rest = base.filter((v) => !savedIds.has(v.id));
    return [...saved, ...rest];
  }, [venues, nameQuery, savedIds]);


  // Surface refetch failures as a toast — keep existing data on screen.
  useEffect(() => {
    if (!error || loading) return;
    toast.show("Couldn't refresh venues. Showing last results.", { type: "error" });
  }, [error, loading, toast]);

  const handleCardPress = useCallback(
    (venue: VenueWithFields) => navigation.navigate("VenueDetail", { venueId: venue.id }),
    [navigation]
  );

  const openPicker = useCallback(() => sheetRef.current?.present(), []);
  const closePicker = useCallback(() => sheetRef.current?.dismiss(), []);

  const handleSelectPreset = useCallback(
    (next: { lat: number; lng: number }, nextLabel: string) => {
      setManualLocation(next, nextLabel);
      closePicker();
    },
    [closePicker, setManualLocation]
  );

  const handleUseMyLocation = useCallback(async () => {
    const fresh = await getCurrentCoords();
    if (fresh) {
      setManualLocation(fresh, "Near you");
      closePicker();
    } else {
      toast.show("Couldn't read your location.", { type: "error" });
    }
  }, [closePicker, setManualLocation, toast]);

  const handleRequestPermission = useCallback(async () => {
    const status = await requestPermission();
    if (status === "granted") {
      await handleUseMyLocation();
    } else {
      // Denied — direct the user to system settings since we won't re-prompt.
      void openLocationSettings();
      closePicker();
    }
  }, [closePicker, handleUseMyLocation]);

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <LocationPill
          label={label}
          permissionStatus={permissionStatus}
          onPress={openPicker}
        />
        <View style={styles.titleRow}>
          <Text
            size="xxl"
            weight="bold"
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.title}
          >
            Venues
          </Text>
          <Pressable
            onPress={() => navigation.navigate("MapView")}
            accessibilityRole="button"
            accessibilityLabel="Map view"
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.mapButton,
              {
                backgroundColor: colors.surfaceSecondary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="map-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <WhenPill />
        <SearchInput
          value={nameQuery}
          onChangeText={setNameQuery}
          placeholder="Search venues by name"
          accessibilityLabel="Search venues"
          accessibilityHint="Type a venue name to filter the list"
        />
        <Pressable
          onPress={() => navigation.navigate("FieldSearch")}
          accessibilityRole="button"
          accessibilityLabel="Filter by surface, size, or price"
          hitSlop={spacing.xs}
          style={({ pressed }) => [
            styles.filterLink,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons name="options-outline" size={16} color={colors.brand} />
          <Text size="sm" weight="medium" style={{ color: colors.brand }}>
            Filter by surface, size, or price
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ListSkeleton />
      ) : error && venues.length === 0 ? (
        // Initial-load failure — retry button instead of just leaving the
        // empty state's "Change area" action, since the network is the issue
        // rather than the location.
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load venues"
          description="Check your connection and try again."
          actionLabel="Try again"
          // refetchVenues skips the haptic that the pull-to-refresh wrapper
          // adds — button taps use `selection()` elsewhere; chaining a
          // light-impact on a retry button would feel off-pattern.
          onAction={refetchVenues}
        />
      ) : (
        <FlatList<VenueWithFields>
          data={filteredVenues}
          keyExtractor={(v) => v.id}
          contentContainerStyle={[
            styles.list,
            // Pad the bottom so the last card doesn't hug the home indicator.
            { paddingBottom: insets.bottom + spacing.xl },
            filteredVenues.length === 0 && styles.listEmpty,
          ]}
          ListHeaderComponent={
            nameQuery.trim().length === 0 && recentIds.length > 0 ? (
              <RecentlyViewedRow
                recentIds={recentIds}
                allVenues={venues}
                onPressVenue={(id) =>
                  navigation.navigate("VenueDetail", { venueId: id })
                }
              />
            ) : null
          }
          renderItem={({ item }) => (
            <VenueCard
              venue={item}
              userCoords={coords}
              isSaved={savedIds.has(item.id)}
              recentlyAttempted={venueWasRecentlyAttempted(item.id)}
              onPress={() => handleCardPress(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListEmptyComponent={
            nameQuery.trim().length > 0 ? (
              <EmptyState
                icon="search-outline"
                title={`No venues match "${nameQuery.trim()}"`}
                description="Try a different name or clear the search."
                actionLabel="Clear search"
                onAction={() => setNameQuery("")}
              />
            ) : (
              <EmptyState
                icon={permissionStatus === "denied" ? "lock-closed-outline" : "location-outline"}
                title={
                  permissionStatus === "denied"
                    ? "Location is off"
                    : coords
                      ? "Nothing nearby"
                      : "Pick an area to start"
                }
                description={
                  permissionStatus === "denied"
                    ? "Enable location in Settings to see fields near you, or pick a neighbourhood manually."
                    : coords
                      ? "We didn't find any fields in this area. Try another neighbourhood."
                      : "We need a location to show you fields. Pick a neighbourhood or share your location."
                }
                actionLabel={
                  permissionStatus === "denied"
                    ? "Open settings"
                    : coords
                      ? "Change area"
                      : "Pick an area"
                }
                onAction={
                  permissionStatus === "denied"
                    ? () => void openLocationSettings()
                    : openPicker
                }
              />
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <LocationPickerSheet
        ref={sheetRef}
        permissionStatus={permissionStatus}
        onSelect={handleSelectPreset}
        onUseMyLocation={handleUseMyLocation}
        onRequestPermission={handleRequestPermission}
      />
    </View>
  );
}

function ListSkeleton() {
  return (
    <View
      accessibilityLabel="Loading venues"
      accessibilityLiveRegion="polite"
      style={[styles.list, { paddingTop: spacing.md, gap: spacing.md }]}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <VenueCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    flexShrink: 1,
    letterSpacing: -0.5,
  },
  mapButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  filterLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: 0,
  },
  listEmpty: {
    flexGrow: 1,
  },
});
