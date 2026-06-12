import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AmenityChip } from "../../components/AmenityChip";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { FieldDetailSkeleton } from "../../components/FieldDetailSkeleton";
import { PhotoGallery } from "../../components/PhotoGallery";
import { StickyFooter } from "../../components/StickyFooter";
import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { useField } from "../../hooks/useField";
import {
  EVENT_BOOKING_CTA_TAPPED,
  EVENT_FIELD_VIEWED,
  track,
} from "../../lib/analytics";
import { resolveFieldPhotos } from "../../lib/fieldPhotos";
import { openOperatorBooking } from "../../lib/openBooking";
import type { DetailParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import type { FieldSize, FieldSurface } from "../../types/api";

// See VenueDetailScreen — typed against DetailParamList because this screen
// is mounted in all three tab stacks and only navigates to the sibling
// detail. Using MainStackParamList would lie under Saved/Me.
type Props = NativeStackScreenProps<DetailParamList, "FieldDetail">;
type Nav = NativeStackNavigationProp<DetailParamList>;

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

const LIGHTING_AMENITY_KEYS = new Set(["lights", "lighting"]);
const INDOOR_AMENITY_KEYS = new Set(["indoor"]);

export function FieldDetailScreen({ route }: Props) {
  const { fieldId } = route.params;
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const toast = useToast();

  const { data: field, isLoading, error } = useField(fieldId);

  // Fire field_viewed once per unique field id loaded.
  const loadedFieldId = field?.id;
  useEffect(() => {
    if (loadedFieldId) track(EVENT_FIELD_VIEWED, { field_id: loadedFieldId });
  }, [loadedFieldId]);

  const handleBookPress = () => {
    if (!field) return;
    track(EVENT_BOOKING_CTA_TAPPED, {
      field_id: field.id,
      venue_id: field.venue.id,
      operator_id: field.venue.operator_id,
    });
    void openOperatorBooking({ field, venue: field.venue, toast });
  };

  // ---- Loading -----------------------------------------------------------
  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.surface }]}>
        <FloatingBack onBack={() => nav.goBack()} insets={insets} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <FieldDetailSkeleton />
        </ScrollView>
      </View>
    );
  }

  // ---- Error / Not found -------------------------------------------------
  if (error || !field) {
    return (
      <View
        style={[
          styles.root,
          { backgroundColor: colors.surface, paddingTop: insets.top },
        ]}
      >
        <FloatingBack onBack={() => nav.goBack()} insets={insets} floating={false} />
        <EmptyState
          icon={error ? "cloud-offline-outline" : "search-outline"}
          title={error ? "Couldn't load field" : "Field not found"}
          description={
            error
              ? "Check your connection and try again."
              : "This field is no longer available."
          }
          actionLabel="Back"
          onAction={() => nav.goBack()}
        />
      </View>
    );
  }

  // ---- Loaded ------------------------------------------------------------
  const { venue } = field;
  const amenities = venue.amenities ?? [];

  const hasLighting = amenities.some((a) => LIGHTING_AMENITY_KEYS.has(a.toLowerCase()));
  const isIndoor =
    field.surface === "indoor" ||
    amenities.some((a) => INDOOR_AMENITY_KEYS.has(a.toLowerCase()));

  const priceText =
    field.price_per_hour !== null ? `$${Math.round(field.price_per_hour)}/hr` : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: spacing.xl + 80 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <PhotoGallery photos={resolveFieldPhotos(field.photos, venue.photos)} />
          <FloatingBack onBack={() => nav.goBack()} insets={insets} />
        </View>

        <View style={styles.body}>
          <Text
            size="xxl"
            weight="bold"
            font="display"
            accessibilityRole="header"
            style={styles.title}
          >
            {field.name}
          </Text>

          {/* Surface / size badges */}
          <View style={styles.badges}>
            <Badge label={SURFACE_LABEL[field.surface]} />
            <Badge label={SIZE_LABEL[field.size]} />
          </View>

          {/* Venue name — tappable */}
          <Pressable
            onPress={() => nav.navigate("VenueDetail", { venueId: venue.id })}
            accessibilityRole="link"
            accessibilityLabel={`Open ${venue.name}`}
            style={({ pressed }) => [
              styles.venueLink,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text size="md" variant="secondary" numberOfLines={1}>
              {venue.name}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textSecondary}
            />
          </Pressable>

          {/* Price */}
          {priceText ? (
            <View style={styles.priceWrap}>
              <Text
                size="xxxl"
                font="display"
                style={{ color: colors.brand, letterSpacing: 0.4 }}
              >
                {priceText}
              </Text>
              {field.price_note ? (
                <Text size="sm" variant="secondary" style={styles.priceNote}>
                  {field.price_note}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Field specs */}
          <Text size="lg" weight="bold" font="display" accessibilityRole="header" style={styles.section}>
            Field specs
          </Text>
          <View style={[styles.specs, { borderColor: colors.border }]}>
            <SpecRow label="Surface" value={SURFACE_LABEL[field.surface]} />
            <SpecRow label="Size" value={SIZE_LABEL[field.size]} />
            <SpecRow label="Lighting" value={hasLighting ? "Yes" : "No"} />
            <SpecRow
              label="Indoor / Outdoor"
              value={isIndoor ? "Indoor" : "Outdoor"}
              last
            />
          </View>

          {/* Venue amenities */}
          {amenities.length > 0 ? (
            <>
              <Text
                size="lg"
                weight="bold"
                accessibilityRole="header"
                style={styles.section}
              >
                Venue amenities
              </Text>
              <View style={styles.amenities}>
                {amenities.map((a) => (
                  <AmenityChip key={a} amenity={a} />
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      <StickyFooter>
        <Button
          label="Book on operator's site"
          onPress={handleBookPress}
          accessibilityHint="Opens the operator's website in your browser"
        />
      </StickyFooter>
    </View>
  );
}

// ---------------------------------------------------------------------------

function SpecRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.specRow,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <Text size="sm" variant="tertiary">
        {label}
      </Text>
      <Text size="sm" weight="medium" style={styles.specValue}>
        {value}
      </Text>
    </View>
  );
}

type FloatingBackProps = {
  onBack: () => void;
  insets: { top: number };
  /** When false, render in normal flow (used for error / loading states). */
  floating?: boolean;
};

function FloatingBack({ onBack, insets, floating = true }: FloatingBackProps) {
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
    letterSpacing: 0.2,
  },
  badges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  venueLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  priceWrap: {
    marginTop: spacing.lg,
  },
  priceNote: {
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  specs: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  specValue: {
    flexShrink: 1,
    textAlign: "right",
  },
  amenities: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
});
