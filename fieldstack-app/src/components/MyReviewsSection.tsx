import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import {
  deleteReview,
  listMyReviews,
  type ReviewWithVenue,
} from "../lib/reviews";
import type { MeStackParamList } from "../navigation/MainNavigator";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { StarRating } from "./StarRating";
import { Text } from "./Text";
import { useToast } from "./Toast";

type Props = {
  userId: string;
};

/**
 * Lists the signed-in user's reviews on the Me tab. This is the single
 * place to delete a review (it's intentionally not on the venue page —
 * a stray tap there would erase the user's input).
 *
 * Tapping a row deep-links to the venue's detail screen.
 */
export function MyReviewsSection({ userId }: Props) {
  const colors = useTheme();
  const toast = useToast();
  const nav = useNavigation<NativeStackNavigationProp<MeStackParamList>>();
  const [reviews, setReviews] = useState<ReviewWithVenue[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listMyReviews(userId);
    if (!error && data) setReviews(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = (review: ReviewWithVenue) => {
    Alert.alert(
      "Delete review?",
      `Your review of ${review.venue.name} will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingId(review.id);
            const { error } = await deleteReview(review.id);
            setDeletingId(null);
            if (error) {
              toast.show("Couldn't delete review.", { type: "error" });
              return;
            }
            // Optimistic local trim — refresh would also work but adds a
            // round-trip flash.
            setReviews((prev) =>
              prev ? prev.filter((r) => r.id !== review.id) : prev
            );
            toast.show("Review deleted.", { type: "success" });
          },
        },
      ]
    );
  };

  const openVenue = (venueId: string) => {
    // Me tab → VenueDetail. dispatch lets us cross the typed-nav gap
    // without unsound casts (same pattern as ReviewSection's sign-in CTA).
    nav.dispatch(
      CommonActions.navigate({
        name: "VenueDetail",
        params: { venueId },
      })
    );
  };

  if (loading && reviews === null) {
    // First-load skeleton — keep it minimal so the rest of Profile renders.
    return (
      <View style={[styles.placeholder, { borderColor: colors.border }]}>
        <Text size="sm" variant="tertiary">
          Loading your reviews…
        </Text>
      </View>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <Text size="sm" variant="tertiary" style={styles.empty}>
        You haven&apos;t written any reviews yet.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {reviews.map((r) => (
        <View
          key={r.id}
          style={[
            styles.row,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <Pressable
            onPress={() => openVenue(r.venue.id)}
            accessibilityRole="button"
            accessibilityLabel={`Review of ${r.venue.name}. ${r.rating} of 5 stars. Tap to open venue.`}
            style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.rowHeader}>
              <Text size="md" weight="bold" numberOfLines={1} style={styles.venueName}>
                {r.venue.name}
              </Text>
              <StarRating value={r.rating} size={14} />
            </View>
            {r.body ? (
              <Text size="sm" variant="secondary" numberOfLines={2} style={styles.body}>
                {r.body}
              </Text>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => handleDelete(r)}
            accessibilityRole="button"
            accessibilityLabel={`Delete review of ${r.venue.name}`}
            accessibilityState={{ disabled: deletingId === r.id, busy: deletingId === r.id }}
            disabled={deletingId === r.id}
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.deleteBtn,
              { opacity: deletingId === r.id ? 0.4 : pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  empty: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  list: {
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
  body: {
    marginTop: spacing.xs,
  },
  deleteBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
