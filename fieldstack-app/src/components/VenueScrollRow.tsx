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
  /** Section header rendered above the tiles. Drop for a chromeless row. */
  title?: string;
  /** Ordered list of venue IDs (caller decides MRU / saved / etc.). */
  venueIds: readonly string[];
  /** Source of venue data used to hydrate IDs into renderable cards. */
  allVenues: readonly Venue[];
  onPressVenue: (venueId: string) => void;
  /**
   * When true and the venueIds set is non-empty but no tile is renderable
   * (e.g., saved venues outside the current location radius), the row hides
   * itself instead of collapsing silently. Defaults to true for legacy
   * behaviour; pass false to keep the heading + an empty message.
   */
  hideWhenEmpty?: boolean;
  /**
   * Prefixed to each tile's accessibilityLabel — e.g. "Recently viewed: ".
   * Lets RecentlyViewedRow keep its tile-specific SR cue when delegating.
   */
  tileAccessibilityPrefix?: string;
};

/**
 * Reusable horizontal scroll row of compact venue tiles. Both
 * `RecentlyViewedRow` (which wraps this) and Profile's "Saved" section
 * render the same tile shape — the only difference is the venue ordering
 * and the section title.
 *
 * Filters venueIds against `allVenues` so we never render a tile the user
 * can't navigate into (the list shifts with location + filters).
 */
export function VenueScrollRow({
  title,
  venueIds,
  allVenues,
  onPressVenue,
  hideWhenEmpty = true,
  tileAccessibilityPrefix = "",
}: Props) {
  const visible = useMemo(() => {
    const byId = new Map(allVenues.map((v) => [v.id, v]));
    return venueIds
      .map((id) => byId.get(id))
      .filter((v): v is Venue => Boolean(v));
  }, [venueIds, allVenues]);

  if (visible.length === 0 && hideWhenEmpty) return null;

  return (
    <View style={styles.wrap}>
      {title ? (
        <Text size="sm" variant="secondary" weight="medium" style={styles.heading}>
          {title}
        </Text>
      ) : null}
      <FlatList
        horizontal
        data={visible}
        keyExtractor={(v) => v.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
        renderItem={({ item }) => (
          <Tile
            venue={item}
            onPress={() => onPressVenue(item.id)}
            accessibilityLabel={`${tileAccessibilityPrefix}${item.name}`}
          />
        )}
      />
    </View>
  );
}

function Tile({
  venue,
  onPress,
  accessibilityLabel,
}: {
  venue: Venue;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const colors = useTheme();
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoSrc = venue.photos[0];
  const showFallback = !photoSrc || photoFailed;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
