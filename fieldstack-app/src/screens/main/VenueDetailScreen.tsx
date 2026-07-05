import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AmenityChip } from "../../components/AmenityChip";
import { BookingRequestSheet } from "../../components/BookingRequestSheet";
import { EmptyState } from "../../components/EmptyState";
import { FreeBadge } from "../../components/FreeBadge";
import { PhotoGallery } from "../../components/PhotoGallery";
import { ReserveBar } from "../../components/ReserveBar";
import { ReviewSection } from "../../components/ReviewSection";
import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { VenueDetailSkeleton } from "../../components/VenueDetailSkeleton";
import { WhenPickerSheet } from "../../components/WhenPicker";
import { useLocation } from "../../hooks/useLocation";
import { useVenue } from "../../hooks/useVenue";
import { useVenueReviews } from "../../hooks/useVenueReviews";
import { useAuth } from "../../lib/auth";
import { reserveBarActionLabel, resolveBookingAction } from "../../lib/bookingAction";
import { useBookingHistory } from "../../lib/bookingHistory";
import { formatEndTime, formatSlotRange, formatTime12h } from "../../lib/datetime";
import { openDirections } from "../../lib/directions";
import { useFlag } from "../../lib/featureFlags";
import { formatScrapedAgo } from "../../lib/freshness";
import { openOperatorBooking } from "../../lib/openBooking";
import { priceDisplayFor } from "../../lib/priceDisplay";
import {
  preferredSlotDate,
  usePreferredSlot,
  type PreferredSlot,
} from "../../lib/preferredSlot";
import { cheapestBookableField } from "../../lib/reserveField";
import { useRecentlyViewed } from "../../lib/recentlyViewed";
import { useSavedVenues } from "../../lib/savedVenues";
import {
  EVENT_BOOKING_CTA_TAPPED,
  EVENT_VENUE_VIEWED,
  track,
} from "../../lib/analytics";
import { formatDistance, haversineKm } from "../../lib/distance";
import { getDayHours, openStatus } from "../../lib/venueHours";
import type { DetailParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { Field, FieldSize, FieldSurface, VenueType } from "../../types/api";

// Honest typing: VenueDetail/FieldDetail live in all three tab stacks
// (Explore / Saved / Me), and from here we only ever navigate to the other
// detail screen. DetailParamList captures that subset; using MainStackParamList
// would falsely typecheck navigate("Explore") when mounted under Saved or Me,
// where there's no such route.
type Props = NativeStackScreenProps<DetailParamList, "VenueDetail">;
type Nav = NativeStackNavigationProp<DetailParamList>;

export function VenueDetailScreen({ route }: Props) {
  const { venueId } = route.params;
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { slot } = usePreferredSlot();
  const { record } = useBookingHistory();
  const { user } = useAuth();
  const inAppBookingFlag = useFlag("in_app_booking");
  const toast = useToast();
  const slotSheetRef = useRef<BottomSheetModal>(null);
  const fieldPickerRef = useRef<BottomSheetModal>(null);
  const bookingRequestSheetRef = useRef<BottomSheetModal>(null);
  // Which field the booking-request sheet is open for. Only relevant for
  // multi-field venues, where the field picker resolves this after the fact;
  // single-bookable-field venues set it straight from reserveField.
  const [requestField, setRequestField] = useState<Field | null>(null);
  // Guards against a fast double-tap firing openOperatorBooking twice (which
  // would log two booking-history rows and schedule two reminders for one
  // tap's worth of intent). Reset in `finally` so a failed/cancelled redirect
  // doesn't leave the Book button stuck spinning.
  const [bookingInFlight, setBookingInFlight] = useState(false);

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

  const handleBook = async (field: Field) => {
    if (!venue || bookingInFlight) return;
    track(EVENT_BOOKING_CTA_TAPPED, {
      field_id: field.id,
      venue_id: venue.id,
      operator_id: venue.operator_id,
    });
    setBookingInFlight(true);
    try {
      await openOperatorBooking({ field, venue, toast, slot, record });
    } finally {
      setBookingInFlight(false);
    }
  };

  // Jump to the Me tab's SignIn screen regardless of which stack this screen
  // is mounted under. Same CommonActions.navigate + params.screen traversal
  // as ReviewSection's sign-in prompt.
  const goToSignIn = () => {
    nav.getParent()?.dispatch(
      CommonActions.navigate({
        name: "MeTab",
        params: { screen: "SignIn" },
      })
    );
  };

  // Reserve bar's primary action, resolved through the flag + auth state.
  // Flag OFF always falls into the "redirect" branch below, unconditionally
  // on sign-in state — see lib/bookingAction.ts's own tests for that
  // invariant in isolation.
  const handleBookOrRequest = (field: Field) => {
    const decision = resolveBookingAction({ flagOn: inAppBookingFlag, signedIn: Boolean(user) });
    if (decision.type === "redirect") {
      void handleBook(field);
      return;
    }
    if (decision.type === "sign_in") {
      goToSignIn();
      return;
    }
    setRequestField(field);
    bookingRequestSheetRef.current?.present();
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

  // "★ 4.6 · 41 reviews · North York" — stars omitted when there are no
  // reviews yet, locality omitted when the address has no comma-separated
  // second segment to guess it from.
  const ratingParts: string[] = [];
  if (reviewSummary && reviewSummary.reviewCount > 0) {
    ratingParts.push(`★ ${reviewSummary.avgRating.toFixed(1)}`);
    ratingParts.push(
      `${reviewSummary.reviewCount} ${reviewSummary.reviewCount === 1 ? "review" : "reviews"}`
    );
  }
  const locality = addressLocality(venue.address);
  if (locality) ratingParts.push(locality);
  const ratingLine = ratingParts.join(" · ");

  const status = openStatus(venue.hours);

  const handleDirections = async () => {
    const ok = await openDirections({
      lat: venue.lat,
      lng: venue.lng,
      address: venue.address,
      label: venue.name,
    });
    if (!ok) toast.show("Couldn't open maps.", { type: "error" });
  };

  const handleViewOperatorInfo = async () => {
    if (!venue.website) return;
    try {
      await Linking.openURL(venue.website);
    } catch {
      toast.show("Couldn't open the operator's website.", { type: "error" });
    }
  };

  // ---- Reserve bar --------------------------------------------------------
  // Multi-field venues anchor the bar on the cheapest *bookable* field; a
  // field with no booking_url can't back a Book action no matter how cheap.
  // Zero bookable fields anywhere falls back to the operator's own website,
  // and only goes fully hidden when there's truly nothing to link — never a
  // dead Book button that just toasts "no booking link yet" after the tap.
  const bookableFields = fields.filter((f) => f.booking_url !== null);
  const reserveField = cheapestBookableField(fields);

  let reserveBar: ReactNode = null;
  if (reserveField) {
    const display = priceDisplayFor(venue.venue_type, reserveField);
    const priceLabel =
      display.kind === "free" ? (
        <FreeBadge />
      ) : display.kind === "priced" ? (
        <Text font="display" size="xxl" style={{ color: colors.brand, letterSpacing: 0.3 }}>
          {`$${Math.round(display.amount)}/hr`}
        </Text>
      ) : (
        <Text size="md" variant="secondary">
          Rates on site
        </Text>
      );

    const slotLabel = slot
      ? formatSlotRange(preferredSlotDate(slot), slot.startTime, slot.duration)
      : null;
    const subline = slotLabel
      ? bookableFields.length > 1
        ? `${reserveField.name} · ${slotLabel}`
        : slotLabel
      : null;

    reserveBar = (
      <ReserveBar
        priceLabel={priceLabel}
        subline={subline}
        onPress={() => slotSheetRef.current?.present()}
        actionLabel={reserveBarActionLabel(inAppBookingFlag)}
        onActionPress={() => {
          if (bookableFields.length > 1) {
            fieldPickerRef.current?.present();
          } else {
            handleBookOrRequest(reserveField);
          }
        }}
        loading={bookingInFlight}
      />
    );
  } else if (venue.website) {
    reserveBar = (
      <ReserveBar
        priceLabel={
          <Text size="md" variant="secondary">
            No online booking
          </Text>
        }
        subline={null}
        actionLabel="View operator info"
        onActionPress={() => void handleViewOperatorInfo()}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xl + (reserveBar ? 96 : 0) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <PhotoGallery
            photos={venue.photos}
            attributions={venue.photo_attributions}
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
          {ratingLine ? (
            <Text size="sm" variant="secondary" style={styles.ratingLine}>
              {ratingLine}
            </Text>
          ) : null}
          {status ? (
            <View style={styles.openRow}>
              <Text size="sm" weight="bold" style={{ color: colors.amber }}>
                {status.statusLabel}
              </Text>
              <Text size="sm" variant="secondary">{` · ${status.timeLabel}`}</Text>
            </View>
          ) : null}
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
                  venueType={venue.venue_type}
                  onPress={() => nav.navigate("FieldDetail", { fieldId: field.id })}
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
              <View
                style={[
                  styles.notesCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
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

      {reserveBar}

      <WhenPickerSheet
        ref={slotSheetRef}
        getOpenHours={(date) => getDayHours(venue.hours, date)}
      />
      <FieldPickerSheet
        ref={fieldPickerRef}
        fields={bookableFields}
        venueType={venue.venue_type}
        onSelect={(field) => {
          fieldPickerRef.current?.dismiss();
          handleBookOrRequest(field);
        }}
      />
      <BookingRequestSheet
        ref={bookingRequestSheetRef}
        venue={venue}
        field={requestField}
        slot={slot}
        userId={user?.id ?? null}
        onEditSlot={() => slotSheetRef.current?.present()}
        onBookOnOperatorSite={() => {
          bookingRequestSheetRef.current?.dismiss();
          if (requestField) void handleBook(requestField);
        }}
      />
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
// Per-field row in the Fields list. Compact card with name + meta on the
// left and price/FREE/RATES ON SITE on the right — the primary Book action
// lives in the reserve bar now, not per-row (see the mockup's `.fzfield`).
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
  venueType: VenueType | null | undefined;
  onPress: () => void;
};

function FieldRow({ field, venueType, onPress }: FieldRowProps) {
  const colors = useTheme();
  const display = priceDisplayFor(venueType, field);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${field.name}`}
      style={({ pressed }) => [
        styles.fieldRow,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.fieldRowMain}>
        <Text size="md" weight="medium" numberOfLines={1}>
          {field.name}
        </Text>
        <Text size="sm" variant="secondary" numberOfLines={1}>
          {`${SURFACE_LABEL[field.surface]}, ${SIZE_LABEL[field.size]}`}
        </Text>
      </View>
      {display.kind === "free" ? (
        <FreeBadge />
      ) : display.kind === "priced" ? (
        <Text font="display" size="lg" style={{ color: colors.brand, letterSpacing: 0.3 }}>
          {`$${Math.round(display.amount)}/hr`}
        </Text>
      ) : display.kind === "rates_on_site" ? (
        <Text size="xs" weight="medium" variant="tertiary" style={styles.ratesOnSite}>
          RATES ON SITE
        </Text>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Lightweight field-picker sheet — shown when the reserve bar's Book action
// has more than one bookable field to choose from.
// ---------------------------------------------------------------------------

type FieldPickerSheetProps = {
  fields: Field[];
  venueType: VenueType | null | undefined;
  onSelect: (field: Field) => void;
};

const FieldPickerSheet = forwardRef<BottomSheetModal, FieldPickerSheetProps>(
  function FieldPickerSheet({ fields, venueType, onSelect }, ref) {
    const colors = useTheme();
    const snapPoints = useMemo(() => ["50%"], []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
        />
      ),
      []
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetScrollView contentContainerStyle={pickerStyles.content}>
          <Text size="lg" weight="bold" accessibilityRole="header" style={pickerStyles.title}>
            Choose a field
          </Text>
          {fields.map((f) => {
            const display = priceDisplayFor(venueType, f);
            return (
              <Pressable
                key={f.id}
                onPress={() => onSelect(f)}
                accessibilityRole="button"
                accessibilityLabel={`Book ${f.name}`}
                style={({ pressed }) => [
                  pickerStyles.row,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text size="md" weight="medium" numberOfLines={1} style={pickerStyles.rowName}>
                  {f.name}
                </Text>
                {display.kind === "free" ? (
                  <FreeBadge />
                ) : display.kind === "priced" ? (
                  <Text font="display" size="md" style={{ color: colors.brand, letterSpacing: 0.3 }}>
                    {`$${Math.round(display.amount)}/hr`}
                  </Text>
                ) : (
                  <Text size="xs" weight="medium" variant="tertiary">
                    RATES ON SITE
                  </Text>
                )}
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

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
  return `${datePart} ${formatTime12h(slot.startTime)} to ${formatEndTime(slot.startTime, slot.duration)}`;
}

/**
 * Best-effort "neighbourhood/city" guess from a full street address: the
 * second comma-separated segment ("123 Main St, North York, ON" → "North
 * York"). Addresses with no comma (or only one segment) have nothing to
 * honestly extract, so this returns null and the rating line just omits it.
 */
function addressLocality(address: string): string | null {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length >= 2 ? (parts[1] as string) : null;
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
  },
  ratingLine: {
    marginTop: spacing.xs,
  },
  openRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
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
    gap: 2,
  },
  ratesOnSite: {
    letterSpacing: 0.6,
  },
  emptyFields: {
    paddingVertical: spacing.lg,
  },
});

const pickerStyles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: {
    flex: 1,
  },
});
