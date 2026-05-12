import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { Coords } from "../lib/location";
import { formatDistance, haversineKm } from "../lib/distance";
import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Field, FieldSurface, Venue } from "../types/api";

import { Badge } from "./Badge";
import { Text } from "./Text";

const PHOTO_SIZE = 96;

const SURFACE_LABEL: Record<FieldSurface, string> = {
  turf: "turf",
  grass: "grass",
  concrete: "concrete",
  indoor: "indoor",
};

type Props = {
  venue: Venue & { fields?: Field[] };
  userCoords?: Coords;
  /** True if this venue is in the user's saved set — shows a heart overlay. */
  isSaved?: boolean;
  onPress: () => void;
};

export function VenueCard({ venue, userCoords, isSaved = false, onPress }: Props) {
  const colors = useTheme();
  const [photoFailed, setPhotoFailed] = useState(false);

  const photoSrc = venue.photos[0];
  const showFallback = !photoSrc || photoFailed;

  // Distance — only computed when both venue and user coords are present.
  const distance =
    userCoords && venue.lat !== null && venue.lng !== null
      ? formatDistance(haversineKm(userCoords, { lat: venue.lat, lng: venue.lng }))
      : null;

  // Field summary: count + unique surfaces ("3 fields · turf + grass").
  const fields = venue.fields ?? [];
  const summary = fields.length > 0 ? buildFieldSummary(fields) : null;

  // Price range: lowest price across active fields with a price.
  const priceRange = fields.length > 0 ? buildPriceRange(fields) : null;

  // Surface chips — show up to 2 unique surfaces.
  const uniqueSurfaces = Array.from(new Set(fields.map((f) => f.surface))).slice(0, 2);

  // Single combined a11y label so screen readers announce the card as a unit
  // rather than reading every nested element separately (REQ-F2.4).
  const a11yLabel = [
    isSaved ? "Saved" : null,
    venue.name,
    distance ? `${distance} away` : null,
    summary,
    priceRange,
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
      <View style={styles.photoBlock}>
        <View
          style={[
            styles.photoWrap,
            { backgroundColor: colors.surfaceSecondary },
          ]}
        >
          {showFallback ? (
            <View
              // Decorative — the venue name in the card already covers the meaning.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.fallback, { backgroundColor: colors.brand + "14" }]}
            >
              <Ionicons name="football" size={36} color={colors.brand} />
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
        {/* Badge lives outside photoWrap so its shadow / elevation isn't
            clipped by the photo's overflow: hidden. */}
        {isSaved ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.savedBadge, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="heart" size={12} color={colors.danger} />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text size="lg" weight="bold" numberOfLines={1} style={styles.title}>
            {venue.name}
          </Text>
          {priceRange ? (
            <Text size="sm" weight="medium" style={{ color: colors.brand }}>
              {priceRange}
            </Text>
          ) : null}
        </View>

        <Text size="sm" variant="secondary" numberOfLines={1} style={styles.subline}>
          {[distance, summary].filter(Boolean).join(" · ") || venue.address}
        </Text>

        {uniqueSurfaces.length > 0 ? (
          <View style={styles.badges}>
            {uniqueSurfaces.map((s) => (
              <Badge key={s} label={SURFACE_LABEL[s]} />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function buildFieldSummary(fields: Field[]): string {
  const surfaces = Array.from(new Set(fields.map((f) => f.surface)));
  const surfaceText = surfaces.map((s) => SURFACE_LABEL[s]).join(" + ");
  const count = `${fields.length} ${fields.length === 1 ? "field" : "fields"}`;
  return surfaceText ? `${count} · ${surfaceText}` : count;
}

function buildPriceRange(fields: Field[]): string | null {
  const prices = fields
    .map((f) => f.price_per_hour)
    .filter((p): p is number => p !== null);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  return `from $${Math.round(min)}/hr`;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  photoBlock: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
  },
  photoWrap: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: borderRadius.md,
    overflow: "hidden",
  },
  savedBadge: {
    position: "absolute",
    top: -spacing.xs / 2,
    right: -spacing.xs / 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  subline: {
    marginTop: 2,
  },
  badges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
