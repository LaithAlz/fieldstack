/**
 * Google-Maps-style bottom card for the currently selected map venue.
 *
 * Layout:
 *   [drag handle]
 *   Title (bold)
 *   Subtitle: type · distance · N fields
 *   [open ▸ Details]              [Save] [Share]
 *
 * Edge-to-edge — anchors to the bottom of the screen, no side margins,
 * rounded top corners only. Matches Google Maps' bottom-of-screen place
 * card pattern: the card itself is tappable to open VenueDetail (where
 * the real Book CTA lives); Save + Share are inline icon actions.
 */

import { Ionicons } from "@expo/vector-icons";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatDistance, haversineKm } from "../lib/distance";
import { selection } from "../lib/haptics";
import type { Coords } from "../lib/location";
import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import type { Venue, VenueType } from "../types/api";

import { Text } from "./Text";

type PreviewVenue = Pick<Venue, "id" | "name" | "address" | "lat" | "lng" | "venue_type">;

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

const VENUE_TYPE_LABEL: Record<VenueType, string> = {
  public_park: "Public park",
  private: "Private facility",
  community_centre: "Community centre",
};

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
  const insets = useSafeAreaInsets();

  const distance =
    userCoords && venue.lat !== null && venue.lng !== null
      ? formatDistance(haversineKm(userCoords, { lat: venue.lat, lng: venue.lng }))
      : null;

  const fieldsLabel = `${fieldCount} ${fieldCount === 1 ? "field" : "fields"}`;
  const typeLabel = venue.venue_type ? VENUE_TYPE_LABEL[venue.venue_type] : null;
  const priceLabel =
    minPrice !== null && minPrice > 0 ? `From $${Math.round(minPrice)}/hr` : null;

  const subtitle = [typeLabel, distance, fieldsLabel].filter(Boolean).join(" · ");

  const handleShare = async () => {
    selection();
    try {
      await Share.share({
        message: `${venue.name}${venue.address ? `\n${venue.address}` : ""}`,
      });
    } catch {
      // User cancel or genuine failure — either way, no surfacing needed.
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          shadowColor: "#000",
          // Inset the home-indicator area INSIDE the card so the white
          // surface extends edge-to-edge at the bottom and the action row
          // stays clear of the gesture bar.
          paddingBottom: spacing.md + insets.bottom,
        },
      ]}
    >
      {/* Drag handle — visual only; the card doesn't actually drag yet. */}
      <View style={styles.handleWrap}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>

      {/* Tappable body — title + subtitle + price. Wrapping just the textual
          area in a Pressable means the action buttons below stay independent
          and don't compete with the card tap. */}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open ${venue.name}`}
        style={({ pressed }) => [styles.body, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {venue.name}
          </Text>
        </View>

        {subtitle ? (
          <Text size="sm" variant="secondary" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}

        {priceLabel ? (
          <Text
            size="sm"
            weight="medium"
            style={{ color: colors.brand, marginTop: spacing.xs }}
          >
            {priceLabel}
          </Text>
        ) : null}
      </Pressable>

      {/* Action row — "Details" as the primary affordance on the left
          (mirrors the card body tap, but explicit), Save + Share as
          icon-with-label on the right. Google Maps' card uses the same
          rhythm: one primary blue action, then icon shortcuts. */}
      <View style={styles.actions}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Open ${venue.name} details`}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: pressed ? colors.brandDark : colors.brand },
          ]}
        >
          <Ionicons name="arrow-forward" size={16} color={colors.onBrand} />
          <Text style={[styles.primaryLabel, { color: colors.onBrand }]}>Details</Text>
        </Pressable>

        <View style={styles.iconActions}>
          <IconAction
            icon={isSaved ? "heart" : "heart-outline"}
            label={isSaved ? "Saved" : "Save"}
            color={isSaved ? colors.danger : colors.textPrimary}
            onPress={onToggleSave}
            accessibilityLabel={isSaved ? "Unsave venue" : "Save venue"}
          />
          <IconAction
            icon="share-outline"
            label="Share"
            color={colors.textPrimary}
            onPress={handleShare}
            accessibilityLabel="Share venue"
          />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

type IconActionProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color: string;
  onPress: () => void;
  accessibilityLabel: string;
};

function IconAction({ icon, label, color, onPress, accessibilityLabel }: IconActionProps) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={spacing.xs}
      style={({ pressed }) => [styles.iconAction, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.iconLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.xs,
    // paddingBottom applied inline (insets.bottom + spacing.md).
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  handleWrap: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    minHeight: 40,
  },
  primaryLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  iconActions: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.lg,
  },
  iconAction: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48,
  },
  iconLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
});
