import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { formatDistance, haversineKm } from "../lib/distance";
import type { Coords } from "../lib/location";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { FieldSize, FieldSurface, SearchResult } from "../types/api";

import { Badge } from "./Badge";
import { Text } from "./Text";

const PHOTO_SIZE = 80;

const SURFACE_LABEL: Record<FieldSurface, string> = {
  turf: "turf",
  grass: "grass",
  concrete: "concrete",
  indoor: "indoor",
};

const SIZE_LABEL: Record<FieldSize, string> = {
  "5v5": "5v5",
  "7v7": "7v7",
  "11v11": "11v11",
  "3v3": "3v3",
  futsal: "Futsal",
};

type Props = {
  result: SearchResult;
  /** Optional — when provided alongside venue lat/lng, distance is rendered. */
  userCoords?: Coords;
  /** True when this card is the lowest-price result in the current list. */
  isBestPrice?: boolean;
  onPress: () => void;
};

/**
 * Pure presentational result card for the field search list. Distance is
 * computed inline only when both `userCoords` and venue coords are present;
 * the parent controls navigation and analytics on press.
 */
export function FieldSearchCard({ result, userCoords, isBestPrice, onPress }: Props) {
  const colors = useTheme();
  const [photoFailed, setPhotoFailed] = useState(false);

  const { field, venue } = result;
  const photoSrc = venue.photos[0];
  const showFallback = !photoSrc || photoFailed;

  const distance =
    userCoords && venue.lat !== null && venue.lng !== null
      ? formatDistance(haversineKm(userCoords, { lat: venue.lat, lng: venue.lng }))
      : null;

  const priceText =
    field.price_per_hour !== null ? `$${Math.round(field.price_per_hour)}/hr` : null;

  // Single combined a11y label so the card reads as one unit.
  const a11yLabel = [
    field.name,
    `at ${venue.name}`,
    isBestPrice ? "best price in results" : null,
    priceText ? `${priceText.replace("/hr", " per hour")}` : null,
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
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={[styles.photoWrap, { backgroundColor: colors.surfaceSecondary }]}
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
            cachePolicy="memory-disk"
            onError={() => setPhotoFailed(true)}
          />
        )}
      </View>

      <View style={styles.body}>
        <Text size="md" weight="medium" numberOfLines={1}>
          {field.name}
        </Text>
        <Text size="sm" variant="secondary" numberOfLines={1} style={styles.venue}>
          {venue.name}
        </Text>

        <View style={styles.badges}>
          <Badge label={SURFACE_LABEL[field.surface]} />
          <Badge label={SIZE_LABEL[field.size]} />
        </View>

        <View style={styles.metaRow}>
          {distance ? (
            <Text size="sm" variant="tertiary">
              {distance} away
            </Text>
          ) : (
            <View />
          )}
          <View style={styles.priceWrap}>
            {isBestPrice ? (
              <View
                style={[
                  styles.bestPriceBadge,
                  { backgroundColor: colors.brand + "1A", borderColor: colors.brand },
                ]}
              >
                <Text size="xs" weight="bold" style={{ color: colors.brand }}>
                  BEST PRICE
                </Text>
              </View>
            ) : null}
            {priceText ? (
              <Text size="md" weight="medium" style={{ color: colors.brand }}>
                {priceText}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    minHeight: 44,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
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
    justifyContent: "space-between",
  },
  venue: {
    marginTop: 2,
  },
  badges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  priceWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  bestPriceBadge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
