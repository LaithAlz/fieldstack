import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { LocationPickerSheet } from "../../components/LocationPickerSheet";
import { LocationPill } from "../../components/LocationPill";
import { Skeleton } from "../../components/Skeleton";
import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { VenueCard } from "../../components/VenueCard";
import { useLocation } from "../../hooks/useLocation";
import { useVenues } from "../../hooks/useVenues";
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
  const { venues, loading, refreshing, error, refresh } = useVenues({ coords });

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
          <Text size="xxl" weight="bold" accessibilityRole="header" style={styles.title}>
            Venues
          </Text>
          <Pressable
            onPress={() => navigation.navigate("FieldSearch")}
            accessibilityRole="button"
            accessibilityLabel="Search fields"
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.searchButton,
              {
                backgroundColor: colors.surfaceSecondary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="search" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
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
          onAction={refresh}
        />
      ) : (
        <FlatList<VenueWithFields>
          data={venues}
          keyExtractor={(v) => v.id}
          contentContainerStyle={[
            styles.list,
            // Pad the bottom so the last card doesn't hug the home indicator.
            { paddingBottom: insets.bottom + spacing.xl },
            venues.length === 0 && styles.listEmpty,
          ]}
          renderItem={({ item }) => (
            <VenueCard
              venue={item}
              userCoords={coords}
              onPress={() => handleCardPress(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListEmptyComponent={
            <EmptyState
              icon="location-outline"
              title="Nothing nearby"
              description={
                coords
                  ? "We didn't find any fields in this area. Try another neighbourhood or search by field type."
                  : "Share your location or pick a neighbourhood to see fields near you."
              }
              actionLabel={coords ? "Change area" : "Pick an area"}
              onAction={openPicker}
            />
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
    <View style={[styles.list, { paddingTop: spacing.md }]}>
      {Array.from({ length: 5 }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width={96} height={96} borderRadius={borderRadius.md} />
          <View style={styles.skeletonBody}>
            <Skeleton width="70%" height={18} />
            <Skeleton width="50%" height={14} />
            <Skeleton width="40%" height={14} />
          </View>
        </View>
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
    letterSpacing: -0.5,
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: 0,
  },
  listEmpty: {
    flexGrow: 1,
  },
  skeletonRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  skeletonBody: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.sm,
  },
});
