import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";

import { useAuth } from "../lib/auth";
import { useBlockedUsers } from "../lib/blockedUsers";
import { deleteReview, reportReview, upsertReview, type Review } from "../lib/reviews";
import type { DetailParamList } from "../navigation/MainNavigator";
import { borderRadius, fontFamily, fontSize, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Button } from "./Button";
import { StarRating } from "./StarRating";
import { Text } from "./Text";
import { useToast } from "./Toast";

const MAX_BODY = 2000;

type Props = {
  venueId: string;
  reviews: readonly Review[];
  avgRating: number;
  reviewCount: number;
  isLoading: boolean;
  onChanged: () => void;
};

/**
 * Reviews block for VenueDetail. Three parts:
 *   1. Aggregate header (avg + count + star row)
 *   2. The current user's review zone — either a write form (no existing
 *      review) or their posted review with a Delete action. Reviews are not
 *      edited in place: to change one, the user deletes it and posts a fresh
 *      one, the same model Google Maps uses. This keeps a single source of
 *      truth and avoids a half-edited row.
 *   3. Collapsible list of everyone else's reviews
 *
 * Guest users see the aggregate + collapsible list; the write form is
 * replaced with a "Sign in to leave a review" prompt that pushes SignIn.
 */
export function ReviewSection({
  venueId,
  reviews,
  avgRating,
  reviewCount,
  isLoading,
  onChanged,
}: Props) {
  const colors = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const { isBlocked, block } = useBlockedUsers();
  const nav = useNavigation<NativeStackNavigationProp<DetailParamList>>();
  // Default collapsed so the write form sits closer to the top of the
  // section; expand on user tap.
  const [expanded, setExpanded] = useState(false);

  // Pull out the current user's existing review (if any) so the form can
  // pre-fill and we can show "Your review" treatment.
  const myReview = useMemo(
    () => (user ? reviews.find((r) => r.userId === user.id) ?? null : null),
    [reviews, user]
  );
  const otherReviews = useMemo(() => {
    const base = user ? reviews.filter((r) => r.userId !== user.id) : Array.from(reviews);
    // Strip out anyone the current user has blocked. App Review Guideline
    // 1.2 requires that a blocked user's content stop appearing. Anonymized
    // reviews (userId null — author deleted their account) can't be blocked,
    // so they always pass.
    return base.filter((r) => r.userId === null || !isBlocked(r.userId));
  }, [reviews, user, isBlocked]);

  const handleReport = (review: Review) => {
    if (!user) {
      toast.show("Sign in to report a review.", { type: "info" });
      return;
    }
    Alert.alert(
      "Report this review?",
      "Flag this review for moderation. Our team will take a look.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          style: "destructive",
          onPress: async () => {
            const { error } = await reportReview({
              reviewId: review.id,
              reporterId: user.id,
            });
            if (error) {
              toast.show("Couldn't submit report. Try again.", { type: "error" });
              return;
            }
            toast.show("Thanks — we'll review it.", { type: "success" });
          },
        },
      ]
    );
  };

  const handleBlock = (userId: string) => {
    Alert.alert(
      "Block this user?",
      "You won't see any reviews from this user. You can unblock anytime from Settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            await block(userId);
            toast.show("User blocked.", { type: "success" });
          },
        },
      ]
    );
  };

  const openReviewMenu = (review: Review) => {
    Alert.alert(
      "Review options",
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Report review", style: "destructive", onPress: () => handleReport(review) },
        // No author to block on an anonymized review (deleted account).
        ...(review.userId
          ? [
              {
                text: "Block this user",
                style: "destructive" as const,
                onPress: () => handleBlock(review.userId as string),
              },
            ]
          : []),
      ]
    );
  };

  return (
    <View>
      <View style={styles.summary}>
        <StarRating value={avgRating} />
        <Text size="md" weight="bold">
          {reviewCount > 0 ? avgRating.toFixed(1) : "—"}
        </Text>
        <Text size="sm" variant="secondary">
          ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
        </Text>
      </View>

      {user ? (
        myReview ? (
          <MyReviewCard review={myReview} onDeleted={onChanged} />
        ) : (
          <ReviewForm venueId={venueId} userId={user.id} onSaved={onChanged} />
        )
      ) : (
        <Pressable
          onPress={() => {
            // Jump to the Me tab's SignIn screen regardless of which stack
            // this ReviewSection is mounted under. CommonActions.navigate
            // with a `params.screen` traverses into the nested navigator.
            // Typed nav.getParent() narrows to never here because the
            // grandparent's param list isn't reachable from this screen's
            // typing — dispatch sidesteps that without unsound casts.
            nav.getParent()?.dispatch(
              CommonActions.navigate({
                name: "MeTab",
                params: { screen: "SignIn" },
              })
            );
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign in to leave a review"
          style={({ pressed }) => [
            styles.signInPrompt,
            {
              backgroundColor: colors.brand + "12",
              borderColor: colors.brand,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Ionicons name="star-outline" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text size="md" weight="medium">
              Sign in to leave a review
            </Text>
            <Text size="sm" variant="secondary">
              Help other players know what to expect.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.brand} />
        </Pressable>
      )}

      {otherReviews.length > 0 ? (
        <>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={
              expanded
                ? "Hide reviews"
                : `Show all reviews, ${otherReviews.length}`
            }
            style={({ pressed }) => [
              styles.toggleRow,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text size="sm" weight="medium" style={{ color: colors.brand }}>
              {expanded
                ? "Hide reviews"
                : `Show all reviews (${otherReviews.length})`}
            </Text>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.brand}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
          {expanded ? (
            <View style={styles.list}>
              {otherReviews.map((r) => (
                <ReviewRow key={r.id} review={r} onOpenMenu={() => openReviewMenu(r)} />
              ))}
            </View>
          ) : null}
        </>
      ) : reviewCount === 0 && !isLoading ? (
        <Text size="sm" variant="tertiary" style={styles.emptyCopy}>
          No reviews yet. Be the first to share a take.
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

function ReviewForm({
  venueId,
  userId,
  onSaved,
}: {
  venueId: string;
  userId: string;
  onSaved: () => void;
}) {
  const colors = useTheme();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const handleSubmit = async () => {
    if (busy) return;
    setError(null);
    if (rating < 1) {
      setError("Pick at least one star.");
      return;
    }
    setBusy(true);
    const trimmed = body.trim();
    // upsert still covers the (venue,user) uniqueness, but the UI only ever
    // reaches this form when the user has no existing review — so this is
    // always an insert in practice.
    const { error: err } = await upsertReview({
      userId,
      venueId,
      rating,
      body: trimmed.length > 0 ? trimmed : null,
    });
    if (!mountedRef.current) return;
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved();
  };

  return (
    <View
      style={[
        styles.form,
        { borderColor: colors.border, backgroundColor: colors.surface },
      ]}
    >
      <Text size="sm" variant="secondary" weight="medium" style={styles.formLabel}>
        Your rating
      </Text>
      <StarRating value={rating} interactive onChange={setRating} />

      <TextInput
        value={body}
        onChangeText={(t) => setBody(t.slice(0, MAX_BODY))}
        placeholder="Optional — what was the field like?"
        placeholderTextColor={colors.textTertiary}
        multiline
        accessibilityLabel="Review text"
        style={[
          styles.input,
          {
            backgroundColor: colors.surfaceSecondary,
            color: colors.textPrimary,
            borderColor: colors.border,
          },
        ]}
      />

      {error ? (
        <Text
          size="sm"
          variant="danger"
          accessibilityLiveRegion="polite"
          style={styles.error}
        >
          {error}
        </Text>
      ) : null}

      <Button
        label="Post review"
        onPress={handleSubmit}
        loading={busy}
        disabled={busy}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

/**
 * The current user's posted review, shown read-only on the venue page with a
 * Delete action. Editing happens by deleting and posting fresh (Google's
 * model) — so there's no in-place edit form here.
 */
function MyReviewCard({
  review,
  onDeleted,
}: {
  review: Review;
  onDeleted: () => void;
}) {
  const colors = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const confirmDelete = () => {
    Alert.alert(
      "Delete your review?",
      "This removes your rating and comment. You can post a new review afterward.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const { error } = await deleteReview(review.id);
            if (!mountedRef.current) return;
            setBusy(false);
            if (error) {
              toast.show("Couldn't delete review. Try again.", { type: "error" });
              return;
            }
            toast.show("Review deleted.", { type: "success" });
            onDeleted();
          },
        },
      ]
    );
  };

  return (
    <View
      style={[
        styles.form,
        { borderColor: colors.brand, backgroundColor: colors.surface },
      ]}
    >
      <View style={styles.myReviewHeader}>
        <Text size="sm" variant="secondary" weight="medium" style={styles.formLabel}>
          Your review
        </Text>
        <Pressable
          onPress={confirmDelete}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Delete your review"
          hitSlop={spacing.sm}
          style={({ pressed }) => [styles.deleteBtn, { opacity: busy ? 0.4 : pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text size="sm" weight="medium" style={{ color: colors.danger }}>
            Delete
          </Text>
        </Pressable>
      </View>
      <StarRating value={review.rating} />
      {review.body ? (
        <Text size="sm" style={styles.myReviewBody}>
          {review.body}
        </Text>
      ) : null}
      <Text size="xs" variant="tertiary">
        To change it, delete this review and post a new one.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

function ReviewRow({ review, onOpenMenu }: { review: Review; onOpenMenu: () => void }) {
  const colors = useTheme();
  const date = useMemo(() => {
    const d = new Date(review.createdAt);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, [review.createdAt]);
  return (
    <View
      style={[
        styles.reviewRow,
        { borderColor: colors.border, backgroundColor: colors.surface },
      ]}
    >
      <View style={styles.reviewHeader}>
        <StarRating value={review.rating} size={14} />
        <View style={styles.reviewHeaderRight}>
          <Text size="xs" variant="tertiary">
            {date}
          </Text>
          <Pressable
            onPress={onOpenMenu}
            accessibilityRole="button"
            accessibilityLabel="More review options"
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.reviewMenuBtn,
              { opacity: pressed ? 0.5 : 1 },
            ]}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={18}
              color={colors.textTertiary}
            />
          </Pressable>
        </View>
      </View>
      {review.body ? (
        <Text size="sm" style={styles.reviewBody}>
          {review.body}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  signInPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    marginBottom: spacing.md,
  },
  form: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  formLabel: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 88,
    textAlignVertical: "top",
  },
  error: {
    marginTop: spacing.xs,
  },
  myReviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  myReviewBody: {
    marginTop: spacing.xs,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  reviewRow: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  reviewMenuBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewBody: {
    marginTop: spacing.xs,
  },
  emptyCopy: {
    paddingVertical: spacing.lg,
    textAlign: "center",
  },
});
