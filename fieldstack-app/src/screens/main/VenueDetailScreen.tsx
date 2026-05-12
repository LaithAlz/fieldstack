import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AmenityChip } from "../../components/AmenityChip";
import { BookingBottomSheet } from "../../components/BookingBottomSheet";
import {
  DateTimeRangePicker,
  defaultDateTimeSelections,
} from "../../components/DateTimeRangePicker";
import { EmptyState } from "../../components/EmptyState";
import { FieldAvailabilityCard } from "../../components/FieldAvailabilityCard";
import { PhotoGallery } from "../../components/PhotoGallery";
import { Skeleton } from "../../components/Skeleton";
import { Text } from "../../components/Text";
import { useLocation } from "../../hooks/useLocation";
import { useVenue } from "../../hooks/useVenue";
import { EVENT_VENUE_VIEWED, track } from "../../lib/analytics";
import { formatDistance, haversineKm } from "../../lib/distance";
import type { MainStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { Field } from "../../types/api";

type Props = NativeStackScreenProps<MainStackParamList, "VenueDetail">;
type Nav = NativeStackNavigationProp<MainStackParamList>;

const DEFAULTS = defaultDateTimeSelections();

export function VenueDetailScreen({ route }: Props) {
  const { venueId } = route.params;
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const { data: venue, isLoading, error } = useVenue(venueId);
  const { coords } = useLocation();

  const [selectedDate, setSelectedDate] = useState(DEFAULTS.date);
  const [selectedTime, setSelectedTime] = useState(DEFAULTS.startTime);
  const [selectedDuration, setSelectedDuration] = useState(DEFAULTS.duration);

  const [bookingField, setBookingField] = useState<Field | null>(null);
  const [bookingVisible, setBookingVisible] = useState(false);

  // Fire venue_viewed once per unique venue id.
  const loadedVenueId = venue?.id;
  useEffect(() => {
    if (loadedVenueId) track(EVENT_VENUE_VIEWED, { venue_id: loadedVenueId });
  }, [loadedVenueId]);

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
        <FloatingTopBar onBack={() => nav.goBack()} insets={insets} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Skeleton width="100%" height={220} borderRadius={0} />
          <View style={styles.body}>
            <Skeleton width="70%" height={28} />
            <View style={{ height: spacing.sm }} />
            <Skeleton width="50%" height={16} />
            <View style={{ height: spacing.lg }} />
            <Skeleton width="100%" height={88} />
            <View style={{ height: spacing.md }} />
            <Skeleton width="100%" height={88} />
          </View>
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
          <FloatingTopBar onBack={() => nav.goBack()} insets={insets} />
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
};

function FloatingTopBar({ onBack, insets, floating = true }: FloatingTopBarProps) {
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
              zIndex: 2,
            }
          : { paddingTop: spacing.sm, paddingHorizontal: spacing.lg },
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
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
