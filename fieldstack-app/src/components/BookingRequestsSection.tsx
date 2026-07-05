import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import {
  cancelBookingRequest,
  listMyBookingRequests,
  type BookingRequestStatus,
  type BookingRequestWithVenue,
} from "../lib/bookingRequests";
import { formatSlotRange } from "../lib/datetime";
import type { MeStackParamList } from "../navigation/MainNavigator";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Badge, type BadgeVariant } from "./Badge";
import { Text } from "./Text";
import { useToast } from "./Toast";

type Props = {
  userId: string;
};

const STATUS_LABEL: Record<BookingRequestStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<BookingRequestStatus, BadgeVariant> = {
  pending: "amber",
  confirmed: "success",
  declined: "tertiary",
  cancelled: "tertiary",
};

/**
 * Lists the signed-in user's in-app booking requests on the Me tab (behind
 * the `in_app_booking` flag — see BookingRequestSheet). Mirrors
 * MyReviewsSection's shape: fetch-on-mount, deep-link to the field on tap,
 * with a cancel action here in place of MyReviewsSection's delete.
 *
 * Only pending rows get a cancel action — RLS enforces the same rule
 * server-side (users can only transition their own pending rows to
 * cancelled), so this is a UI-level mirror of that invariant, not the only
 * thing enforcing it.
 */
export function BookingRequestsSection({ userId }: Props) {
  const colors = useTheme();
  const toast = useToast();
  const nav = useNavigation<NativeStackNavigationProp<MeStackParamList>>();
  const [requests, setRequests] = useState<BookingRequestWithVenue[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listMyBookingRequests(userId);
    if (!error && data) setRequests(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCancel = (request: BookingRequestWithVenue) => {
    Alert.alert(
      "Cancel this request?",
      `Your booking request at ${request.venue.name} will be cancelled.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel request",
          style: "destructive",
          onPress: async () => {
            setCancellingId(request.id);
            const { error } = await cancelBookingRequest(request.id);
            setCancellingId(null);
            if (error) {
              toast.show("Couldn't cancel your request.", { type: "error" });
              return;
            }
            setRequests((prev) =>
              prev
                ? prev.map((r) => (r.id === request.id ? { ...r, status: "cancelled" } : r))
                : prev
            );
            toast.show("Request cancelled.", { type: "success" });
          },
        },
      ]
    );
  };

  const openField = (fieldId: string) => {
    // Me tab -> FieldDetail. dispatch crosses the typed-nav gap without an
    // unsound cast (same pattern as MyReviewsSection's venue deep link).
    nav.dispatch(
      CommonActions.navigate({
        name: "FieldDetail",
        params: { fieldId },
      })
    );
  };

  if (loading && requests === null) {
    return (
      <View style={[styles.placeholder, { borderColor: colors.border }]}>
        <Text size="sm" variant="tertiary">
          Loading your requests…
        </Text>
      </View>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <Text size="sm" variant="tertiary" style={styles.empty}>
        You haven&apos;t requested a booking yet.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {requests.map((r) => (
        <View
          key={r.id}
          style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Pressable
            onPress={() => openField(r.field.id)}
            accessibilityRole="button"
            accessibilityLabel={`Booking request at ${r.venue.name}, ${r.field.name}, ${STATUS_LABEL[r.status]}. Tap to open field.`}
            style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.rowHeader}>
              <Text size="md" weight="bold" numberOfLines={1} style={styles.venueName}>
                {r.venue.name}
              </Text>
              <Badge label={STATUS_LABEL[r.status]} variant={STATUS_VARIANT[r.status]} />
            </View>
            <Text size="sm" variant="secondary" numberOfLines={1} style={styles.meta}>
              {`${r.field.name} · ${formatSlotRange(parseIsoDate(r.requestedDate), r.startTime, r.durationHours)}`}
            </Text>
            {r.note ? (
              <Text size="sm" variant="secondary" numberOfLines={2} style={styles.note}>
                {r.note}
              </Text>
            ) : null}
          </Pressable>
          {r.status === "pending" ? (
            <Pressable
              onPress={() => handleCancel(r)}
              accessibilityRole="button"
              accessibilityLabel={`Cancel booking request at ${r.venue.name}`}
              accessibilityState={{
                disabled: cancellingId === r.id,
                busy: cancellingId === r.id,
              }}
              disabled={cancellingId === r.id}
              hitSlop={spacing.sm}
              style={({ pressed }) => [
                styles.cancelBtn,
                { opacity: cancellingId === r.id ? 0.4 : pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons name="close-circle-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" -> local-midnight Date, matching preferredSlotDate's parsing. */
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date();
  out.setFullYear(y, m - 1, d);
  out.setHours(0, 0, 0, 0);
  return out;
}

const styles = StyleSheet.create({
  placeholder: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  empty: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  venueName: {
    flexShrink: 1,
  },
  meta: {
    marginTop: 2,
  },
  note: {
    marginTop: spacing.xs,
  },
  cancelBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
