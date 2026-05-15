import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AmenityChip } from "../../components/AmenityChip";
import { BookingBottomSheet } from "../../components/BookingBottomSheet";
import {
  DateTimeRangePicker,
  defaultDateTimeSelections,
} from "../../components/DateTimeRangePicker";
import { ReviewSection } from "../../components/ReviewSection";
import { EmptyState } from "../../components/EmptyState";
import { FieldAvailabilityCard } from "../../components/FieldAvailabilityCard";
import { PhotoGallery } from "../../components/PhotoGallery";
import { Text } from "../../components/Text";
import { VenueDetailSkeleton } from "../../components/VenueDetailSkeleton";
import { useLocation } from "../../hooks/useLocation";
import { useVenue } from "../../hooks/useVenue";
import { useVenueReviews } from "../../hooks/useVenueReviews";
import { mockedAvailability } from "../../lib/availability";
import { formatEndTime, formatTime12h } from "../../lib/datetime";
import { formatScrapedAgo } from "../../lib/freshness";
import {
  preferredSlotDate,
  usePreferredSlot,
  type PreferredSlot,
} from "../../lib/preferredSlot";
import { useRecentlyViewed } from "../../lib/recentlyViewed";
import { useSavedVenues } from "../../lib/savedVenues";
import { EVENT_VENUE_VIEWED, track } from "../../lib/analytics";
import { formatDistance, haversineKm } from "../../lib/distance";
import type { DetailParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { Field } from "../../types/api";

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

  const getAvailability = useCallback(
    (d: Date, t: string) => mockedAvailability(venueId, d, t),
    [venueId]
  );

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
            message: `${venue.name}${slotPart} — wanna play?${address}`,
          });
        } catch (err) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn("[share] failed", err);
          }
        }
      }
    : undefined;

  const initial = useState(() => {
    if (slot) {
      return {
        date: preferredSlotDate(slot),
        startTime: slot.startTime,
        duration: slot.duration,
      };
    }
    return defaultDateTimeSelections((d, t) =>
      mockedAvailability(venueId, d, t)
    );
  })[0];

  const [selectedDate, setSelectedDate] = useState(initial.date);
  const [selectedTime, setSelectedTime] = useState(initial.startTime);
  const [selectedDuration, setSelectedDuration] = useState(initial.duration);

  const [bookingField, setBookingField] = useState<Field | null>(null);
  const [bookingVisible, setBookingVisible] = useState(false);

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
    setBookingField(field);
    setBookingVisible(true);
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
  const operatorName = venue.operator?.name ?? "the operator";

  const headerLines = [venue.address, distance ? `${distance} away` : null].filter(
    (s): s is string => Boolean(s)
  );

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
          <PhotoGallery photos={venue.photos} />
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
            size="xl"
            weight="bold"
            accessibilityRole="header"
            style={styles.title}
          >
            {venue.name}
          </Text>
          {headerLines.map((line) => (
            <Text key={line} size="sm" variant="secondary">
              {line}
            </Text>
          ))}
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

          <Text size="lg" weight="bold" accessibilityRole="header" style={styles.section}>
            Pick a time
          </Text>
          <DateTimeRangePicker
            selectedDate={selectedDate}
            selectedStartTime={selectedTime}
            selectedDuration={selectedDuration}
            onDateChange={setSelectedDate}
            onStartTimeChange={setSelectedTime}
            onDurationChange={setSelectedDuration}
            getAvailability={getAvailability}
          />

          <Text size="lg" weight="bold" accessibilityRole="header" style={styles.section}>
            Available fields
          </Text>
          {fields.length === 0 ? (
            <Text size="sm" variant="secondary" style={styles.emptyFields}>
              No fields listed for this venue yet.
            </Text>
          ) : (
            <View style={styles.fieldList}>
              {fields.map((field) => (
                <FieldAvailabilityCard
                  key={field.id}
                  field={field}
                  selectedDate={selectedDate}
                  selectedTime={selectedTime}
                  onCardPress={() =>
                    nav.navigate("FieldDetail", { fieldId: field.id })
                  }
                  onBookPress={() => handleBook(field)}
                />
              ))}
            </View>
          )}

          <Text size="lg" weight="bold" accessibilityRole="header" style={styles.section}>
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

      {bookingField ? (
        <BookingBottomSheet
          visible={bookingVisible}
          field={bookingField}
          venue={venue}
          operatorName={operatorName}
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          selectedDuration={selectedDuration}
          onDismiss={() => setBookingVisible(false)}
        />
      ) : null}
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
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
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
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  fieldList: {
    gap: spacing.md,
  },
  emptyFields: {
    paddingVertical: spacing.lg,
  },
});
