import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { Coords } from "../lib/location";
import { formatDistance, haversineKm } from "../lib/distance";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Field, FieldSurface, Venue } from "../types/api";

import { Badge } from "./Badge";
import { GoalNet } from "./GoalNet";
import { Text } from "./Text";

const PHOTO_HEIGHT = 148;

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
  /** True if the user attempted a booking at this venue in the recent window. */
  recentlyAttempted?: boolean;
  onPress: () => void;
  /**
   * When provided, the heart becomes a live save/unsave button (always
   * visible — outline when unsaved). When absent, the heart is a passive
   * badge shown only on saved venues.
   */
  onToggleSave?: () => void;
};

/**
 * Magazine-style venue card: full-bleed photo on top with the price as a
 * paper pill anchored to its corner, name + meta below. The photo fallback
 * keeps the same geometry (goal-net texture + ball mark) so cards with and
 * without photos sit comfortably in the same list.
 */
export const VenueCard = memo(function VenueCard({
  venue,
  userCoords,
  isSaved = false,
  recentlyAttempted = false,
  onPress,
  onToggleSave,
}: Props) {
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
  // Identity first; state qualifiers and meta follow.
  const a11yLabel = [
    venue.name,
    isSaved ? "Saved" : null,
    recentlyAttempted ? "Booked recently" : null,
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
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[styles.photoBlock, { backgroundColor: colors.surfaceSecondary }]}>
        {showFallback ? (
          <View
            // Decorative — the venue name in the card already covers the meaning.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.fallback, { backgroundColor: colors.brand + "10" }]}
          >
            <GoalNet cols={9} rows={5} intensity={0.1} color={colors.brand} />
            <Ionicons name="football" size={40} color={colors.brand} />
          </View>
        ) : (
          <>
            <Image
              source={photoSrc}
              style={styles.photo}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
              onError={() => setPhotoFailed(true)}
            />
            {/* Bottom scrim keeps the overlaid pills legible on busy photos. */}
            <LinearGradient
              colors={["transparent", "rgba(12, 14, 24, 0.45)"]}
              style={styles.scrim}
              pointerEvents="none"
            />
          </>
        )}

        {priceRange ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.pricePill, { backgroundColor: colors.surface }]}
          >
            <Text font="display" size="md" style={{ color: colors.brand, letterSpacing: 0.3 }}>
              {priceRange}
            </Text>
          </View>
        ) : null}

        {recentlyAttempted ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.recentPill, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="time-outline" size={10} color={colors.onAccent} />
            <Text size="xs" weight="bold" style={{ color: colors.onAccent, letterSpacing: 0.6 }}>
              BOOKED RECENTLY
            </Text>
          </View>
        ) : null}

        {onToggleSave ? (
          <Pressable
            onPress={onToggleSave}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? `Remove ${venue.name} from saved` : `Save ${venue.name}`}
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.savedBadge,
              { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons
              name={isSaved ? "heart" : "heart-outline"}
              size={15}
              color={isSaved ? colors.danger : colors.textSecondary}
            />
          </Pressable>
        ) : isSaved ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.savedBadge, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="heart" size={13} color={colors.danger} />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text size="lg" weight="bold" numberOfLines={1} style={styles.title}>
          {venue.name}
        </Text>
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
});

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
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  photoBlock: {
    height: PHOTO_HEIGHT,
    width: "100%",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pricePill: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: borderRadius.md,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  recentPill: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  savedBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  body: {
    padding: spacing.md,
  },
  title: {
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
