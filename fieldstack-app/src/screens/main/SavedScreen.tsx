import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { Text } from "../../components/Text";
import { VenueCard } from "../../components/VenueCard";
import { VenueCardSkeleton } from "../../components/VenueCardSkeleton";
import { useLocation } from "../../hooks/useLocation";
import { useVenues } from "../../hooks/useVenues";
import { useBookingHistory } from "../../lib/bookingHistory";
import { useSavedVenues } from "../../lib/savedVenues";
import type { SavedStackParamList } from "../../navigation/MainNavigator";
import { spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { VenueWithFields } from "../../types/api";

type Nav = NativeStackNavigationProp<SavedStackParamList, "SavedList">;

/**
 * Saved tab — flat list of venues the user has hearted, fetched by exact id
 * (`/venues?ids=…`) so every save shows regardless of the active location.
 * Reuses the standard VenueCard so rows look identical to the Explore list,
 * with the heart live so unsaving happens in place.
 */
export function SavedScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { coords } = useLocation();
  const { saved: savedIds, toggle } = useSavedVenues();
  const ids = useMemo(() => Array.from(savedIds), [savedIds]);
  const { venues: savedVenues, loading, error, refresh } = useVenues({ coords, ids });
  const { venueWasRecentlyAttempted } = useBookingHistory();

  return (
    <View
      style={[styles.root, { backgroundColor: colors.surface, paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Text size="xxxl" weight="bold" font="display" accessibilityRole="header" style={styles.title}>
          Saved
        </Text>
        <Text size="sm" variant="secondary">
          {savedIds.size === 0
            ? "Heart a venue to keep it here."
            : `${savedIds.size} ${savedIds.size === 1 ? "venue" : "venues"} saved.`}
        </Text>
      </View>

      {loading ? (
        <ScrollView
          accessibilityLabel="Loading saved venues"
          accessibilityLiveRegion="polite"
          contentContainerStyle={[styles.list, { paddingTop: spacing.md, gap: spacing.md }]}
        >
          {Array.from({ length: 4 }, (_, i) => (
            <VenueCardSkeleton key={i} />
          ))}
        </ScrollView>
      ) : error && savedVenues.length === 0 ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load venues"
          description="Check your connection."
          actionLabel="Try again"
          onAction={() => void refresh()}
        />
      ) : (
        <FlatList<VenueWithFields>
          data={savedVenues}
          keyExtractor={(v) => v.id}
          initialNumToRender={6}
          windowSize={5}
          maxToRenderPerBatch={8}
          removeClippedSubviews
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + spacing.xl },
            savedVenues.length === 0 && styles.listEmpty,
          ]}
          renderItem={({ item }) => (
            <VenueCard
              venue={item}
              userCoords={coords}
              isSaved={savedIds.has(item.id)}
              recentlyAttempted={venueWasRecentlyAttempted(item.id)}
              onPress={() => navigation.navigate("VenueDetail", { venueId: item.id })}
              onToggleSave={() => void toggle(item.id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              title={savedIds.size > 0 ? "Those venues are gone" : "No saved venues yet"}
              description={
                savedIds.size > 0
                  ? "The venues you saved are no longer listed."
                  : "Tap the heart on any venue to save it for later."
              }
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
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
    gap: spacing.xs,
  },
  title: {
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  listEmpty: {
    flexGrow: 1,
  },
});
