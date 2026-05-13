import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "../../components/Text";
import { VenueScrollRow } from "../../components/VenueScrollRow";
import { WhenPickerSheet } from "../../components/WhenPicker";
import { useLocation } from "../../hooks/useLocation";
import { useVenues } from "../../hooks/useVenues";
import { useBookingHistory, type BookingAttempt } from "../../lib/bookingHistory";
import { formatEndTime, formatTime12h } from "../../lib/datetime";
import {
  preferredSlotDate,
  usePreferredSlot,
  type PreferredSlot,
} from "../../lib/preferredSlot";
import { useRecentlyViewed } from "../../lib/recentlyViewed";
import { useSavedVenues } from "../../lib/savedVenues";
import type {
  MeStackParamList,
  RootTabsParamList,
} from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

type Nav = NativeStackNavigationProp<MeStackParamList, "Profile">;

const MAX_RECENT_BOOKINGS = 5;

/**
 * The Me tab. Pulls together every piece of personal state we already
 * persist — preferred slot, saved venues, booking attempts, recently viewed —
 * into one coherent view. No new persistence layer, just composition.
 */
export function ProfileScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { coords } = useLocation();
  const { venues } = useVenues({ coords });

  const { slot } = usePreferredSlot();
  const { saved: savedIds } = useSavedVenues();
  const { recent: recentIds } = useRecentlyViewed();
  const { attempts } = useBookingHistory();

  const whenSheetRef = useRef<BottomSheetModal>(null);

  // Visible saved/recent counts — i.e. venues actually renderable given the
  // current location radius. Used to decide which sections show, with an
  // "outside this area" fallback so a non-empty IDs set + zero visible rows
  // doesn't render as silent blank.
  const visibleSavedCount = useMemo(() => {
    if (savedIds.size === 0) return 0;
    const ids = new Set(venues.map((v) => v.id));
    let n = 0;
    for (const id of savedIds) if (ids.has(id)) n++;
    return n;
  }, [savedIds, venues]);

  const visibleRecentCount = useMemo(() => {
    if (recentIds.length === 0) return 0;
    const ids = new Set(venues.map((v) => v.id));
    return recentIds.filter((id) => ids.has(id)).length;
  }, [recentIds, venues]);

  const recentBookingsByVenue = useMemo(() => {
    // Dedupe attempts down to the latest per venue, then hydrate against the
    // visible venues list. Anything outside the current location radius
    // silently drops — better than rendering a tile we can't navigate into.
    const seen = new Set<string>();
    const dedup: BookingAttempt[] = [];
    for (const a of attempts) {
      if (seen.has(a.venueId)) continue;
      seen.add(a.venueId);
      dedup.push(a);
    }
    const byId = new Map(venues.map((v) => [v.id, v]));
    type Row = { attempt: BookingAttempt; venue: NonNullable<ReturnType<typeof byId.get>> };
    return dedup
      .slice(0, MAX_RECENT_BOOKINGS)
      .map((a) => ({ attempt: a, venue: byId.get(a.venueId) }))
      .filter((row): row is Row => Boolean(row.venue));
  }, [attempts, venues]);

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text size="xxl" weight="bold" accessibilityRole="header" style={styles.title}>
            Me
          </Text>
          <Text size="sm" variant="secondary">
            Your preferences and history, all in one place.
          </Text>
        </View>

        {/* ---- Preferred slot ---- */}
        <SectionHeader>Preferred time</SectionHeader>
        <PreferredSlotCard
          slot={slot}
          onPress={() => whenSheetRef.current?.present()}
        />

        {/* ---- Saved venues ---- */}
        {savedIds.size > 0 ? (
          <View style={styles.sectionSpacer}>
            <SectionRow
              title="Saved"
              actionLabel="See all"
              onAction={() => {
                // Sibling-tab hop. Type-narrow getParent so a future rename
                // breaks the build instead of silently no-op'ing at runtime.
                navigation
                  .getParent<BottomTabNavigationProp<RootTabsParamList>>()
                  ?.navigate("SavedTab");
              }}
            />
            {visibleSavedCount > 0 ? (
              <VenueScrollRow
                venueIds={Array.from(savedIds)}
                allVenues={venues}
                onPressVenue={(id) =>
                  navigation.navigate("VenueDetail", { venueId: id })
                }
              />
            ) : (
              <Text size="sm" variant="tertiary" style={styles.outOfArea}>
                Your saved venues aren&apos;t in this area.
              </Text>
            )}
          </View>
        ) : null}

        {/* ---- Recent bookings ---- */}
        {recentBookingsByVenue.length > 0 ? (
          <View style={styles.sectionSpacer}>
            <SectionHeader>Recent bookings</SectionHeader>
            <View style={styles.bookingList}>
              {recentBookingsByVenue.map(({ attempt, venue }) => (
                <Pressable
                  key={attempt.fieldId}
                  onPress={() =>
                    navigation.navigate("VenueDetail", { venueId: venue.id })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${venue.name}`}
                  style={({ pressed }) => [
                    styles.bookingRow,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.bookingIcon,
                      { backgroundColor: colors.brand + "14" },
                    ]}
                  >
                    <Ionicons name="time-outline" size={20} color={colors.brand} />
                  </View>
                  <View style={styles.bookingBody}>
                    <Text size="md" weight="medium" numberOfLines={1}>
                      {venue.name}
                    </Text>
                    <Text size="sm" variant="secondary" numberOfLines={1}>
                      {formatAttemptSummary(attempt)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.textTertiary}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* ---- Recently viewed ---- */}
        {recentIds.length > 0 ? (
          <View style={styles.sectionSpacer}>
            <SectionHeader>Recently viewed</SectionHeader>
            {visibleRecentCount > 0 ? (
              <VenueScrollRow
                venueIds={recentIds}
                allVenues={venues}
                onPressVenue={(id) =>
                  navigation.navigate("VenueDetail", { venueId: id })
                }
              />
            ) : (
              <Text size="sm" variant="tertiary" style={styles.outOfArea}>
                Recent venues aren&apos;t in this area.
              </Text>
            )}
          </View>
        ) : null}

        {/* Empty-everything copy only when there's truly nothing to show. */}
        {savedIds.size === 0 &&
        recentBookingsByVenue.length === 0 &&
        recentIds.length === 0 ? (
          <View style={styles.emptyAll}>
            <Text size="sm" variant="secondary" style={{ textAlign: "center" }}>
              Start exploring fields — anything you save or open will show up here.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <WhenPickerSheet ref={whenSheetRef} />
    </View>
  );
}

// ---------------------------------------------------------------------------

function SectionHeader({ children }: { children: string }) {
  return (
    <Text
      size="sm"
      variant="secondary"
      weight="medium"
      style={styles.sectionHeader}
    >
      {children}
    </Text>
  );
}

function SectionRow({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text size="sm" variant="secondary" weight="medium" style={styles.sectionHeader}>
        {title}
      </Text>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        hitSlop={spacing.sm}
        style={({ pressed }) => [
          styles.sectionAction,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text size="sm" weight="medium" style={{ color: colors.brand }}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function PreferredSlotCard({
  slot,
  onPress,
}: {
  slot: PreferredSlot | null;
  onPress: () => void;
}) {
  const colors = useTheme();
  const label = slot ? formatSlotLabel(slot) : "Not set";
  const cta = slot ? "Change" : "Set preferred time";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={slot ? `Preferred time ${label}. Change.` : "Set preferred time"}
      style={({ pressed }) => [
        styles.slotCard,
        {
          backgroundColor: slot ? colors.brand + "12" : colors.surfaceSecondary,
          borderColor: slot ? colors.brand : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.slotBody}>
        <Ionicons
          name="time-outline"
          size={22}
          color={slot ? colors.brand : colors.textSecondary}
        />
        <View style={{ flex: 1 }}>
          <Text size="md" weight="bold" numberOfLines={1}>
            {label}
          </Text>
          <Text size="sm" variant="secondary" numberOfLines={1}>
            We&apos;ll pre-fill this on every field you open.
          </Text>
        </View>
        <Text
          size="sm"
          weight="medium"
          numberOfLines={1}
          style={{ color: colors.brand, flexShrink: 0 }}
        >
          {cta}
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

function formatSlotLabel(slot: PreferredSlot): string {
  const date = preferredSlotDate(slot);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  let datePart: string;
  if (date.getTime() === today.getTime()) datePart = "Today";
  else if (date.getTime() === tomorrow.getTime()) datePart = "Tomorrow";
  else
    datePart = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  return `${datePart} · ${formatTime12h(slot.startTime)} – ${formatEndTime(slot.startTime, slot.duration)}`;
}

function formatAttemptSummary(attempt: {
  date: string;
  startTime: string;
  duration: number;
  attemptedAt: number;
}): string {
  const [y, m, d] = attempt.date.split("-").map(Number);
  const slotDate = new Date(y, m - 1, d);
  const datePart = slotDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const endLabel = formatEndTime(attempt.startTime, attempt.duration);
  return `${datePart} · ${formatTime12h(attempt.startTime)} – ${endLabel}`;
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  title: {
    letterSpacing: -0.5,
  },
  sectionSpacer: {
    marginTop: spacing.md,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: spacing.lg,
  },
  sectionAction: {
    paddingVertical: spacing.xs,
  },
  slotCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  slotBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  bookingList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  bookingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bookingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  bookingBody: {
    flex: 1,
    gap: 2,
  },
  emptyAll: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  outOfArea: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
});
