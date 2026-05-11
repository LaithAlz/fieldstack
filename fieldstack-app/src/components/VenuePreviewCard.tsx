import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { formatDistance, haversineKm } from "../lib/distance";
import type { Coords } from "../lib/location";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Venue } from "../types/api";

import { Button } from "./Button";
import { Text } from "./Text";

const PHOTO_SIZE = 72;

// Strict minimum the card actually reads — lets callers pass either a full
// Venue or the Pick subset that comes back on SearchResult.
type PreviewVenue = Pick<Venue, "id" | "name" | "photos" | "lat" | "lng">;

type Props = {
  venue: PreviewVenue;
  fieldCount: number;
  userCoords?: Coords;
  onViewVenue: () => void;
};

/**
 * Compact preview shown above a map pin once it's tapped. Pure
 * presentational — the parent owns the venue selection and navigates on
 * the "View venue" button.
 */
export function VenuePreviewCard({
  venue,
  fieldCount,
  userCoords,
  onViewVenue,
}: Props) {
  const colors = useTheme();
  const [photoFailed, setPhotoFailed] = useState(false);

  const photoSrc = venue.photos[0];
  const showFallback = !photoSrc || photoFailed;

  const distance =
    userCoords && venue.lat !== null && venue.lng !== null
      ? formatDistance(haversineKm(userCoords, { lat: venue.lat, lng: venue.lng }))
      : null;

  const fieldLabel = fieldCount === 1 ? "1 field" : `${fieldCount} fields`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.photoWrap, { backgroundColor: colors.surfaceSecondary }]}>
          {showFallback ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.fallback, { backgroundColor: colors.brand + "14" }]}
            >
              <Ionicons name="football" size={24} color={colors.brand} />
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

        <View style={styles.body}>
          <Text size="md" weight="bold" numberOfLines={1}>
            {venue.name}
          </Text>
          <Text size="sm" variant="secondary" numberOfLines={1} style={styles.subline}>
            {[fieldLabel, distance ? `${distance} away` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>

      <Button
        label="View venue"
        onPress={onViewVenue}
        accessibilityLabel={`View ${venue.name}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
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
  },
  subline: {
    marginTop: 2,
  },
});
