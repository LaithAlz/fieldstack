import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo } from "react";
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AmenityChip } from "../../components/AmenityChip";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { ReviewSection } from "../../components/ReviewSection";
import { EmptyState } from "../../components/EmptyState";
import { PhotoGallery } from "../../components/PhotoGallery";
import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { VenueDetailSkeleton } from "../../components/VenueDetailSkeleton";
import { useLocation } from "../../hooks/useLocation";
import { useVenue } from "../../hooks/useVenue";
import { useVenueReviews } from "../../hooks/useVenueReviews";
import { formatEndTime, formatTime12h } from "../../lib/datetime";
import { openDirections } from "../../lib/directions";
import { formatScrapedAgo } from "../../lib/freshness";
import { openOperatorBooking } from "../../lib/openBooking";
import {
  preferredSlotDate,
  usePreferredSlot,
  type PreferredSlot,
} from "../../lib/preferredSlot";
import { useRecentlyViewed } from "../../lib/recentlyViewed";
import { useSavedVenues } from "../../lib/savedVenues";
import {
  EVENT_BOOKING_CTA_TAPPED,
  EVENT_VENUE_VIEWED,
  track,
} from "../../lib/analytics";
import { formatDistance, haversineKm } from "../../lib/distance";
import type { DetailParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { Field, FieldSize, FieldSurface } from "../../types/api";

// Honest typing: VenueDetail/FieldDetail live in all three tab stacks
// (Explore / Saved / Me), and from here we only ever navigate to the other
// detail screen. DetailParamList captures that subset; using MainStackParamList
// would falsely typecheck navigate("FieldSearch") / navigate("MapView") when
// mounted under Saved or Me.
type Props = NativeStackScreenProps<DetailParamList, "VenueDetail">;
type Nav = NativeStackNavigationProp<DetailParamList>;

export function VenueDetailScreen({ route }: Props) {
  const { venueId } = route.params;
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { slot } = usePreferredSlot();
  const toast = useToast();

  const { data: venue, isLoading, error } = useVenue(venueId);
  const { coords } = useLocation();
  const {
    reviews,
    summary: reviewSummary,
    isLoading: reviewsLoading,
    refresh: refreshReviews,
  } = useVenueReviews(venueId);
  const { isSaved, toggle: toggleSaved } = useSavedVenues();
  const { recordView } = useRecentlyViewed();
  const savedForVenue = venue ? isSaved(venue.id) : false;
  const onToggleSave = venue ? () => void toggleSaved(venue.id) : undefined;

  // System share sheet — gives the user a one-tap way to send the venue to
  // group chat with the optional preferred slot baked in. Native Share is
  // built into RN, no extra dep needed.
  const onShare = venue
    ? async () => {
        const slotPart = slot ? ` on ${formatShareSlot(slot)}` : "";
        const address = venue.address ? `\n${venue.address}` : "";
        try {
          // Modern RN resolves with {action: 'dismissedAction'} on cancel
          // (both platforms), so we only see this catch for genuine failures.
          // Surface those in dev; users won't get a toast for a cancel.
          await Share.share({
            message: `${venue.name}${slotPart}. Wanna play?${address}`,
          });
        } catch (err) {
          if (__DEV__) {
             
            console.warn("[share] failed", err);
          }
        }
      }
    : undefined;

  // Fire venue_viewed once per unique venue id + push into MRU list so the
  // home screen surfaces it at the top of "Recently viewed".
  const loadedVenueId = venue?.id;
  useEffect(() => {
    if (loadedVenueId) {
      track(EVENT_VENUE_VIEWED, { venue_id: loadedVenueId });
      recordView(loadedVenueId);
    }
  }, [loadedVenueId, recordView]);

  const distance = useMemo(() => {
    if (!venue || venue.lat === null || venue.lng === null) return null;
    return formatDistance(haversineKm(coords, { lat: venue.lat, lng: venue.lng }));
  }, [coords, venue]);

  const handleBook = (field: Field) => {
    if (!venue) return;
    track(EVENT_BOOKING_CTA_TAPPED, {
      field_id: field.id,
      venue_id: venue.id,
      operator_id: venue.operator_id,
    });
    void openOperatorBooking({ field, venue, toast });
  };

  // ---- Loading -----------------------------------------------------------
  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.surface }]}>
        <FloatingTopBar
          onBack={() => nav.goBack()}
          insets={insets}
          saved={savedForVenue}
          onToggleSave={onToggleSave}
          onShare={onShare}
        />
        <ScrollView contentContainerStyle={styles.scroll}>
          <VenueDetailSkeleton />
        </ScrollView>
      </View>
    );
  }

  // ---- Error / Not found -------------------------------------------------
  if (error || !venue) {
    return (
      <View style={[styles.root, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
        <FloatingTopBar
          onBack={() => nav.goBack()}
          insets={insets}
          floating={false}
        />
        <EmptyState
          icon={error ? "cloud-offline-outline" : "search-outline"}
          title={error ? "Couldn't load venue" : "Venue not found"}
          description={
            error
              ? "Check your connection and try again."
              : "This venue may have been removed."
          }
          actionLabel="Back to venues"
          onAction={() => nav.goBack()}
        />
      </View>
    );
  }

  // ---- Loaded ------------------------------------------------------------
  const fields = venue.fields;
  const amenities = venue.amenities;

  const addressLine = [venue.address, distance ? `${distance} away` : null]
    .filter(Boolean)
    .join(" · ");

  const handleDirections = async () => {
    const ok = await openDirections({
      lat: venue.lat,
      lng: venue.lng,
      address: venue.address,
      label: venue.name,
    });
    if (!ok) toast.show("Couldn't open maps.", { type: "error" });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <PhotoGallery
            photos={venue.photos}
            coords={
              venue.lat !== null && venue.lng !== null
                ? { lat: venue.lat, lng: venue.lng }
                : null
            }
          />
          <FloatingTopBar
          onBack={() => nav.goBack()}
          insets={insets}
          saved={savedForVenue}
          onToggleSave={onToggleSave}
          onShare={onShare}
        />
        </View>

        <View style={styles.body}>
          <Text
            size="xxl"
            weight="bold"
            font="display"
            accessibilityRole="header"
            style={styles.title}
          >
            {venue.name}
          </Text>
          {addressLine ? (
            <Pressable
              onPress={() => void handleDirections()}
              accessibilityRole="button"
              accessibilityLabel={`Get directions to ${venue.name}`}
              accessibilityHint="Opens your maps app"
              style={({ pressed }) => [styles.addressRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons
                name="navigate-outline"
                size={15}
                color={colors.brand}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text size="sm" variant="secondary" numberOfLines={2} style={styles.addressText}>
                {addressLine}
              </Text>
              <Text size="sm" weight="medium" style={{ color: colors.brand }}>
                Directions
              </Text>
            </Pressable>
          ) : null}
          {/* Provenance badge. Renders only when migration 007 is applied
              and a last-scraped timestamp exists; otherwise the helper
              returns null and we render nothing. */}
          {(() => {
            const freshness = formatScrapedAgo(venue.last_scraped_at);
            return freshness ? (
              <Text size="xs" variant="tertiary" style={styles.freshness}>
                {freshness}
              </Text>
            ) : null;
          })()}

          {amenities.length > 0 ? (
            <View style={styles.amenities}>
              {amenities.map((a) => (
                <AmenityChip key={a} amenity={a} />
              ))}
            </View>
          ) : null}

          <Text size="lg" weight="bold" font="display" accessibilityRole="header" style={styles.section}>
            Fields
          </Text>
          {fields.length === 0 ? (
            <Text size="sm" variant="secondary" style={styles.emptyFields}>
              No fields listed for this venue yet.
            </Text>
          ) : (
            <View style={styles.fieldList}>
              {fields.map((field) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  onCardPress={() =>
                    nav.navigate("FieldDetail", { fieldId: field.id })
                  }
                  onBookPress={() => handleBook(field)}
                />
              ))}
            </View>
          )}

          {/* Booking notes + cancellation policy. Renders only when migration
              009 is applied and at least one field is non-empty. Surfaces
              friction *before* the operator redirect so users aren't
              surprised later. */}
          {venue.booking_notes || venue.cancellation_policy ? (
            <>
              <Text size="lg" weight="bold" font="display" accessibilityRole="header" style={styles.section}>
                Booking notes
              </Text>
              <View style={[styles.notesCard, { borderColor: colors.border }]}>
                {venue.booking_notes ? (
                  <View style={styles.noteRow}>
                    <Ionicons
                      name="information-circle-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={styles.noteIcon}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    />
                    <Text size="sm" variant="secondary" style={styles.noteText}>
                      {venue.booking_notes}
                    </Text>
                  </View>
                ) : null}
                {venue.cancellation_policy ? (
                  <View style={[styles.noteRow, venue.booking_notes ? styles.noteRowGap : undefined]}>
                    <Ionicons
                      name="return-down-back-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={styles.noteIcon}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    />
                    <Text size="sm" variant="secondary" style={styles.noteText}>
                      {venue.cancellation_policy}
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          <Text size="lg" weight="bold" font="display" accessibilityRole="header" style={styles.section}>
            Reviews
          </Text>
          <ReviewSection
            venueId={venueId}
            reviews={reviews}
            avgRating={reviewSummary?.avgRating ?? 0}
            reviewCount={reviewSummary?.reviewCount ?? 0}
            isLoading={reviewsLoading}
            onChanged={() => void refreshReviews()}
          />
        </View>
      </ScrollView>

    </View>
  );
}

// ---------------------------------------------------------------------------
// Floating back button — overlay on the photo gallery
// ---------------------------------------------------------------------------

type FloatingTopBarProps = {
  onBack: () => void;
  insets: { top: number };
  /** When false, render in normal flow (used for error / loading states). */
  floating?: boolean;
  /** Optional save action — when provided, renders a heart toggle. */
  saved?: boolean;
  onToggleSave?: () => void;
  /** Optional share action — renders a share icon between back and heart. */
  onShare?: () => void;
};

function FloatingTopBar({
  onBack,
  insets,
  floating = true,
  saved = false,
  onToggleSave,
  onShare,
}: FloatingTopBarProps) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.topBar,
        floating
          ? {
              position: "absolute",
              top: insets.top + spacing.sm,
              left: spacing.lg,
              right: spacing.lg,
              zIndex: 2,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }
          : {
              paddingTop: spacing.sm,
              paddingHorizontal: spacing.lg,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            },
      ]}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={spacing.sm}
        style={({ pressed }) => [
          styles.circle,
          { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
      </Pressable>
      <View style={styles.topBarRight}>
        {onShare ? (
          <Pressable
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel="Share venue"
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.circle,
              { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        {onToggleSave ? (
          <Pressable
            onPress={onToggleSave}
            accessibilityRole="button"
            accessibilityLabel={saved ? "Unsave venue" : "Save venue"}
            accessibilityState={{ selected: saved }}
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.circle,
              { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons
              name={saved ? "heart" : "heart-outline"}
              size={20}
              color={saved ? colors.danger : colors.textPrimary}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Per-field row in the Fields list. Compact card with surface + size badges,
// optional price, and a Book button that fires the deep-link.
// ---------------------------------------------------------------------------

const SURFACE_LABEL: Record<FieldSurface, string> = {
  turf: "Turf",
  grass: "Grass",
  concrete: "Concrete",
  indoor: "Indoor",
};

const SIZE_LABEL: Record<FieldSize, string> = {
  "5v5": "5-a-side",
  "7v7": "7-a-side",
  "11v11": "11-a-side",
  "3v3": "3-a-side",
  futsal: "Futsal",
};

type FieldRowProps = {
  field: Field;
  onCardPress: () => void;
  onBookPress: () => void;
};

function FieldRow({ field, onCardPress, onBookPress }: FieldRowProps) {
  const colors = useTheme();
  const priceText =
    field.price_per_hour !== null ? `$${Math.round(field.price_per_hour)}/hr` : null;
  return (
    <Pressable
      onPress={onCardPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${field.name}`}
      style={({ pressed }) => [
        styles.fieldRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.fieldRowMain}>
        <Text size="md" weight="medium" numberOfLines={1}>
          {field.name}
        </Text>
        <View style={styles.fieldRowBadges}>
          <Badge label={SURFACE_LABEL[field.surface]} />
          <Badge label={SIZE_LABEL[field.size]} />
          {priceText ? (
            <Text size="sm" variant="secondary" style={styles.fieldRowPrice}>
              {priceText}
            </Text>
          ) : null}
        </View>
      </View>
      <Button
        label="Book"
        onPress={onBookPress}
        accessibilityLabel={`Book ${field.name} on operator site`}
        style={styles.fieldRowButton}
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function formatShareSlot(slot: PreferredSlot): string {
  const date = preferredSlotDate(slot);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  let datePart: string;
  if (date.getTime() === today.getTime()) datePart = "today";
  else if (date.getTime() === tomorrow.getTime()) datePart = "tomorrow";
  else
    datePart = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  return `${datePart} ${formatTime12h(slot.startTime)}–${formatEndTime(slot.startTime, slot.duration)}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  topBar: {
    flexDirection: "row",
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    letterSpacing: 0.2,
    marginBottom: spacing.xs,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  addressText: {
    flexShrink: 1,
  },
  amenities: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  freshness: {
    marginTop: spacing.xs,
  },
  notesCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  noteRowGap: {
    marginTop: spacing.sm,
  },
  noteIcon: {
    marginRight: spacing.sm,
    marginTop: 1,
  },
  noteText: {
    flex: 1,
    flexShrink: 1,
    lineHeight: 20,
  },
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  fieldList: {
    gap: spacing.sm,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    // Gentle lift so the field options read as cards on the warm paper.
    shadowColor: "#1A1D2B",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  fieldRowMain: {
    flex: 1,
    gap: spacing.xs,
  },
  fieldRowBadges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  fieldRowPrice: {
    marginLeft: spacing.xs,
  },
  fieldRowButton: {
    paddingHorizontal: spacing.md,
  },
  emptyFields: {
    paddingVertical: spacing.lg,
  },
});
