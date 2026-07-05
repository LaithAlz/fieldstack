import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { formatDistance, haversineKm } from "../lib/distance";
import type { Coords } from "../lib/location";
import { venuePriceSummary } from "../lib/priceDisplay";
import { isOpenNow } from "../lib/venueHours";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Field, FieldSize, FieldSurface, SearchResult } from "../types/api";

import { Badge } from "./Badge";
import { FreeBadge } from "./FreeBadge";
import { Text } from "./Text";

const PHOTO_SIZE = 84;

const SURFACE_LABEL: Record<FieldSurface, string> = {
  turf: "Turf",
  grass: "Grass",
  concrete: "Concrete",
  indoor: "Indoor",
};

const SIZE_LABEL: Record<FieldSize, string> = {
  "5v5": "5v5",
  "7v7": "7v7",
  "11v11": "11v11",
  "3v3": "3v3",
  futsal: "Futsal",
};

export type ExploreVenueGroup = {
  venue: SearchResult["venue"];
  /** Every matching field the current search returned at this venue. */
  fields: Field[];
};

type Props = {
  group: ExploreVenueGroup;
  userCoords?: Coords;
  onPress: () => void;
};

/**
 * Sheet-list row for Explore — photo left, identity + meta + price/FREE on
 * the right. One card per venue (fields at the same venue roll up into a
 * single row, mirroring the map's one-pin-per-venue markers).
 *
 * No rating line: `SearchResult.venue` doesn't carry rating data (see
 * types/api.ts) — the field/venue tables have no rating column at all, so
 * there's nothing honest to show here yet.
 */
export function ExploreCard({ group, userCoords, onPress }: Props) {
  const colors = useTheme();
  const [photoFailed, setPhotoFailed] = useState(false);

  const { venue, fields } = group;
  const photoSrc = venue.photos[0];
  const showFallback = !photoSrc || photoFailed;

  const distance =
    userCoords && venue.lat !== null && venue.lng !== null
      ? formatDistance(haversineKm(userCoords, { lat: venue.lat, lng: venue.lng }))
      : null;

  const priceSummary = venuePriceSummary(fields, venue.venue_type);
  const hasBookingUrl = fields.some((f) => f.booking_url);
  const meta = buildMeta(fields);

  // `SearchResult.venue` doesn't include `hours` (only the single-venue GET
  // endpoint returns it) — see lib/venueHours.ts's isOpenNow. Until the
  // search endpoint's projection grows an hours column, every card falls
  // through to the same 6 AM–11 PM default window rather than a venue-
  // specific one.
  const openNow = isOpenNow(undefined, new Date());

  const a11yLabel = [
    venue.name,
    priceSummary.kind === "free"
      ? "Free to play"
      : priceSummary.kind === "from"
        ? `from $${Math.round(priceSummary.price)} per hour`
        : null,
    openNow ? "Open now" : null,
    distance ? `${distance} away` : null,
    meta,
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
      <View style={[styles.photoWrap, { backgroundColor: colors.surfaceSecondary }]}>
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
        <Text size="md" weight="bold" numberOfLines={1}>
          {venue.name}
        </Text>
        <View style={styles.metaRow}>
          <Text size="sm" variant="secondary" numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
          {openNow ? (
            <Text
              size="xs"
              weight="bold"
              style={{ color: colors.amber, letterSpacing: 0.4 }}
            >
              OPEN NOW
            </Text>
          ) : null}
        </View>

        <View style={styles.foot}>
          {distance ? (
            <Text font="display" size="md" variant="secondary">
              {distance.toUpperCase()}
            </Text>
          ) : (
            <View />
          )}

          {priceSummary.kind === "free" ? (
            <FreeBadge />
          ) : priceSummary.kind === "from" ? (
            <Text font="display" size="lg" style={{ color: colors.brand, letterSpacing: 0.3 }}>
              {`$${Math.round(priceSummary.price)}/hr`}
            </Text>
          ) : hasBookingUrl ? (
            <Text size="xs" variant="secondary">
              Rates on site
            </Text>
          ) : null}
        </View>

        {fields.length > 1 ? (
          <View style={styles.badges}>
            <Badge label={`${fields.length} fields`} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function buildMeta(fields: Field[]): string {
  const uniqueSurfaces = Array.from(new Set(fields.map((f) => f.surface)));
  const surfaceText = uniqueSurfaces.map((s) => SURFACE_LABEL[s]).join(" + ");
  if (fields.length === 1) {
    return `${surfaceText}, ${SIZE_LABEL[fields[0]!.size]}`;
  }
  const count = `${fields.length} fields`;
  return uniqueSurfaces.length === 1 ? `${surfaceText}, ${count}` : `${count} · ${surfaceText}`;
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: 2,
  },
  meta: {
    flexShrink: 1,
  },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  badges: {
    flexDirection: "row",
    marginTop: spacing.xs,
  },
});
