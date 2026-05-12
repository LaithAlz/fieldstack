import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Venue } from "../types/api";

import { Text } from "./Text";

const TILE_WIDTH = 132;
const TILE_PHOTO_HEIGHT = 88;

type Props = {
  /** Most-recent first list of venue IDs from the persistence layer. */
  recentIds: readonly string[];
  /** Current visible venues — used to hydrate IDs into renderable cards. */
  allVenues: readonly Venue[];
  onPressVenue: (venueId: string) => void;
};

/**
 * Horizontal scroll row of small "recently viewed" venue tiles, rendered at
 * the top of the venue list. Only shows venues that are also in the current
 * `allVenues` set so we don't display a tile we can't navigate into (the
 * list shifts with location + filters).
 */
export function RecentlyViewedRow({
  recentIds,
  allVenues,
  onPressVenue,
}: Props) {
  const visible = useMemo(() => {
    const byId = new Map(allVenues.map((v) => [v.id, v]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((v): v is Venue => Boolean(v));
  }, [recentIds, allVenues]);

  if (visible.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text size="sm" variant="secondary" weight="medium" style={styles.heading}>
        Recently viewed
      </Text>
      <FlatList
        horizontal
        data={visible}
        keyExtractor={(v) => v.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
        renderItem={({ item }) => (
          <Tile venue={item} onPress={() => onPressVenue(item.id)} />
        )}
      />
    </View>
  );
}

function Tile({ venue, onPress }: { venue: Venue; onPress: () => void }) {
  const colors = useTheme();
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoSrc = venue.photos[0];
  const showFallback = !photoSrc || photoFailed;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Recently viewed: ${venue.name}`}
      style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.photoWrap,
          { backgroundColor: colors.surfaceSecondary },
        ]}
      >
        {showFallback ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.fallback, { backgroundColor: colors.brand + "14" }]}
          >
            <Ionicons name="football" size={28} color={colors.brand} />
          </View>
        ) : (
          <Image
            source={photoSrc}
            style={styles.photo}
            contentFit="cover"
            transition={150}
            onError={() => setPhotoFailed(true)}
          />
        )}
      </View>
      <Text size="sm" weight="medium" numberOfLines={2} style={styles.name}>
        {venue.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    // Negate parent contentContainerStyle's horizontal padding so the row
    // can bleed to the screen edges and handle its own gutters.
    marginHorizontal: -spacing.lg,
  },
  heading: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: {
    paddingHorizontal: spacing.lg,
  },
  tile: {
    width: TILE_WIDTH,
  },
  photoWrap: {
    width: TILE_WIDTH,
    height: TILE_PHOTO_HEIGHT,
    borderRadius: borderRadius.md,
    overflow: "hidden",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    marginTop: spacing.xs,
  },
});
