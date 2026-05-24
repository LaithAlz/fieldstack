import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { formatDistance, haversineKm } from "../lib/distance";
import type { Coords } from "../lib/location";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Venue } from "../types/api";

import { Text } from "./Text";

// Google-Maps-style bottom card — fills the parent's content width.
// Parent (MapViewScreen) controls horizontal padding.
const PHOTO_SIZE = 88;

type PreviewVenue = Pick<Venue, "id" | "name" | "photos" | "lat" | "lng">;

type Props = {
  venue: PreviewVenue;
  fieldCount: number;
  /** Lowest per-hour price across the venue's priced fields, or null. */
  minPrice: number | null;
  userCoords?: Coords;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

/**
 * Compact venue card used in the map's bottom slot (Google-Maps style:
 * one card for the currently selected pin). Distinct from the full-width
 * `VenueCard` (list) because this one carries a photo thumbnail on the
 * left, save heart on the right, and shorter copy — sharing one component
 * across both placements would compromise both.
 *
 * Pure presentational; parent owns selection state, navigation, and the
 * save toggle handler.
 */
export function VenueMapCard({
  venue,
  fieldCount,
  minPrice,
  userCoords,
  isSaved,
  onPress,
  onToggleSave,
}: Props) {
  const colors = useTheme();
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoSrc = venue.photos[0];
  const showFallback = !photoSrc || photoFailed;

  const distance =
    userCoords && venue.lat !== null && venue.lng !== null
      ? formatDistance(haversineKm(userCoords, { lat: venue.lat, lng: venue.lng }))
      : null;

  const fieldsLabel = `${fieldCount} ${fieldCount === 1 ? "field" : "fields"}`;
  const priceLabel = minPrice !== null && minPrice > 0
    ? `From $${Math.round(minPrice)}/hr`
    : null;

  const a11yLabel = [
    venue.name,
    isSaved ? "Saved" : null,
    distance ? `${distance} away` : null,
    fieldsLabel,
    priceLabel,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
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
            <Ionicons name="football" size={32} color={colors.brand} />
          </View>
        ) : (
          <Image
            source={photoSrc}
            style={styles.photo}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            onError={() => setPhotoFailed(true)}
          />
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text size="md" weight="bold" numberOfLines={1} style={styles.name}>
            {venue.name}
          </Text>
          <Pressable
            // RN Pressable doesn't bubble to a parent Pressable, so the heart
            // tap is naturally isolated from the card's onPress.
            onPress={onToggleSave}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? "Unsave venue" : "Save venue"}
            accessibilityState={{ selected: isSaved }}
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.heart,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons
              name={isSaved ? "heart" : "heart-outline"}
              size={18}
              color={isSaved ? colors.danger : colors.textSecondary}
            />
          </Pressable>
        </View>

        <Text size="sm" variant="secondary" numberOfLines={1}>
          {[distance, fieldsLabel].filter(Boolean).join(" · ")}
        </Text>

        {priceLabel ? (
          <Text
            size="sm"
            weight="medium"
            style={{ color: colors.brand, marginTop: spacing.xs }}
          >
            {priceLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    padding: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm + 2,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  photoWrap: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
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
  body: {
    flex: 1,
    justifyContent: "center",
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
  },
  heart: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
