import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoalNet } from "../../components/GoalNet";
import { MyReviewsSection } from "../../components/MyReviewsSection";
import { Text } from "../../components/Text";
import { VenueScrollRow } from "../../components/VenueScrollRow";
import { WhenPickerSheet } from "../../components/WhenPicker";
import { useLocation } from "../../hooks/useLocation";
import { useVenues } from "../../hooks/useVenues";
import { useAuth } from "../../lib/auth";
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
  const { user, pendingRecovery, clearPendingRecovery } = useAuth();

  // Fallback redirect for recovery deep-links in case the app-level
  // RecoveryRedirectHandler in App.tsx fires before the nav container is fully
  // ready. If the handler already cleared pendingRecovery this effect is a
  // no-op. If the handler couldn't run yet (navRef not ready), this catches it
  // the moment the Me tab is focused and ProfileScreen mounts.
  useEffect(() => {
    if (!pendingRecovery) return;
    clearPendingRecovery();
    navigation.navigate("SetNewPassword");
  }, [pendingRecovery, clearPendingRecovery, navigation]);

  // Greeting picks the first thing useful — display name from auth metadata,
  // local-part of the email, or a generic fallback for guests.
  const greeting = useMemo(() => {
    if (!user) return "Me";
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const candidate = [meta.name, meta.full_name].find(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
    if (candidate) return `Hey ${candidate.trim().split(" ")[0]}`;
    if (user.email) {
      // Split on dots/underscores/dashes so "alex.smith@…" reads as "Alex"
      // rather than "Alex.smith". Common in work emails.
      const local = user.email.split("@")[0];
      const firstToken = local.split(/[._-]/)[0] ?? local;
      return `Hey ${firstToken.charAt(0).toUpperCase()}${firstToken.slice(1)}`;
    }
    return "Hey there";
  }, [user]);

  // First initial for the hero avatar — name metadata, then email, else null
  // (guest renders a person glyph instead).
  const avatarInitial = useMemo(() => {
    if (!user) return null;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name = [meta.name, meta.full_name].find(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
    const source = name?.trim() || user.email || "";
    return source.charAt(0).toUpperCase() || null;
  }, [user]);

  // Identity line under the greeting: the account email, or a guest note.
  const identityLine = user?.email ?? "Browsing as guest";

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
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Ink-navy hero — same marquee treatment as Explore. Avatar +
            greeting + identity line on the goal-net backdrop give the Me tab
            a real header instead of a bare title on the page surface. */}
        <View
          style={[
            styles.hero,
            { backgroundColor: colors.heroSurface, paddingTop: insets.top + spacing.md },
          ]}
        >
          <GoalNet intensity={0.07} />
          <View style={styles.heroTopRow}>
            <View style={styles.heroIdentity}>
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: user ? colors.brand : "rgba(244, 241, 234, 0.16)",
                  },
                ]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {user && avatarInitial ? (
                  <Text font="display" size="xl" style={{ color: colors.onBrand }}>
                    {avatarInitial}
                  </Text>
                ) : (
                  <Ionicons name="person" size={24} color={colors.onHero} />
                )}
              </View>
              <View style={styles.heroText}>
                <Text
                  size="xxl"
                  weight="bold"
                  font="display"
                  accessibilityRole="header"
                  numberOfLines={1}
                  style={[styles.title, { color: colors.onHero }]}
                >
                  {greeting}
                </Text>
                <Text size="sm" numberOfLines={1} style={{ color: colors.onHeroMuted }}>
                  {identityLine}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => navigation.navigate("Settings")}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={spacing.sm}
              style={({ pressed }) => [
                styles.gearBtn,
                { backgroundColor: "rgba(244, 241, 234, 0.16)", opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="settings-outline" size={20} color={colors.onHero} />
            </Pressable>
          </View>
        </View>

        {/* Sign-in banner — only when guest. Saves are device-local, so the
            invite is informational rather than blocking. Hides itself once
            the user signs in. */}
        {!user ? (
          <Pressable
            onPress={() => navigation.navigate("SignIn")}
            accessibilityRole="button"
            accessibilityLabel="Sign in to sync your saves and preferences"
            style={({ pressed }) => [
              styles.signInBanner,
              {
                backgroundColor: colors.brand + "12",
                borderColor: colors.brand,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.signInIcon,
                { backgroundColor: colors.brand + "22" },
              ]}
            >
              <Ionicons name="cloud-upload-outline" size={20} color={colors.brand} />
            </View>
            <View style={styles.signInBody}>
              <Text size="md" weight="bold">
                Sign in to sync
              </Text>
              <Text size="sm" variant="secondary">
                Keep your saves, preferred time, and history across devices.
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.brand}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
        ) : null}

        {/* ---- Preferred slot ---- */}
        <SectionHeader>Preferred time</SectionHeader>
        <PreferredSlotCard
          slot={slot}
          onPress={() => whenSheetRef.current?.present()}
        />

        {/* ---- Cold start ---- */}
        {/* A fresh profile has nothing below the slot card — every section
            is conditional on history. Point back at the content instead of
            showing dead air. Disappears as soon as anything accrues. */}
        {savedIds.size === 0 &&
        recentBookingsByVenue.length === 0 &&
        recentIds.length === 0 ? (
          <Pressable
            onPress={() =>
              navigation
                .getParent<BottomTabNavigationProp<RootTabsParamList>>()
                ?.navigate("ExploreTab")
            }
            accessibilityRole="button"
            accessibilityLabel="Explore venues"
            accessibilityHint="Opens the Explore tab"
            style={({ pressed }) => [
              styles.coldStartCard,
              {
                backgroundColor: colors.surfaceSecondary,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={[styles.coldStartIcon, { backgroundColor: colors.brand + "16" }]}>
              <Ionicons name="football-outline" size={22} color={colors.brand} />
            </View>
            <View style={styles.coldStartBody}>
              <Text size="md" weight="bold">
                Your pitch history starts here
              </Text>
              <Text size="sm" variant="secondary">
                Browse venues, save your favourites, and book a field. It all
                shows up on this screen.
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textTertiary}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
        ) : null}

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
                    navigation.navigate("FieldDetail", { fieldId: attempt.fieldId })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Open your booked field at ${venue.name}`}
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

        {/* ---- My reviews ---- */}
        {user ? (
          <View style={styles.sectionSpacer}>
            <SectionHeader>My reviews</SectionHeader>
            <MyReviewsSection userId={user.id} />
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

        {/* Empty-everything copy only when there's truly nothing to show AND
            we're not already nudging the user via the sign-in banner — both
            blocks together reads as redundant. */}
        {user &&
        savedIds.size === 0 &&
        recentBookingsByVenue.length === 0 &&
        recentIds.length === 0 ? (
          <View style={styles.emptyAll}>
            <Text size="sm" variant="secondary" style={{ textAlign: "center" }}>
              Start exploring fields. Anything you save or open will show up here.
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
      accessibilityRole="header"
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

  return `${datePart} · ${formatTime12h(slot.startTime)} to ${formatEndTime(slot.startTime, slot.duration)}`;
}

function formatAttemptSummary(attempt: {
  date: string;
  // Null when the user booked without a preferred slot set (see
  // bookingHistory.tsx) — the row still shows the date, just no time range.
  startTime: string | null;
  duration: number | null;
  attemptedAt: number;
}): string {
  const [y, m, d] = attempt.date.split("-").map(Number);
  const slotDate = new Date(y, m - 1, d);
  const datePart = slotDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (attempt.startTime === null || attempt.duration === null) return datePart;
  const endLabel = formatEndTime(attempt.startTime, attempt.duration);
  return `${datePart} · ${formatTime12h(attempt.startTime)} to ${endLabel}`;
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    overflow: "hidden",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  heroIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: {
    flex: 1,
    gap: 1,
  },
  title: {
    letterSpacing: 0.6,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  gearBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  coldStartCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  coldStartIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  coldStartBody: {
    flex: 1,
    gap: 2,
  },
  signInBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  signInIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  signInBody: {
    flex: 1,
    gap: 2,
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
