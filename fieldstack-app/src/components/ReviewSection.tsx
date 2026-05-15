import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { useAuth } from "../lib/auth";
import { upsertReview, type Review } from "../lib/reviews";
import type { DetailParamList } from "../navigation/MainNavigator";
import { borderRadius, fontFamily, fontSize, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Button } from "./Button";
import { StarRating } from "./StarRating";
import { Text } from "./Text";

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
 *   2. Write/edit form for the current user (no delete here — that lives
 *      on the Me tab's "My reviews" so a curious tap doesn't lose data)
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
  const otherReviews = useMemo(
    () =>
      user ? reviews.filter((r) => r.userId !== user.id) : Array.from(reviews),
    [reviews, user]
  );

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
        <ReviewForm
          venueId={venueId}
          userId={user.id}
          existing={myReview}
          onSaved={onChanged}
        />
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
                <ReviewRow key={r.id} review={r} />
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
  existing,
  onSaved,
}: {
  venueId: string;
  userId: string;
  existing: Review | null;
  onSaved: () => void;
}) {
  const colors = useTheme();
  const [rating, setRating] = useState<number>(existing?.rating ?? 0);
  const [body, setBody] = useState<string>(existing?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (rating < 1) {
      setError("Pick at least one star.");
      return;
    }
    setBusy(true);
    setError(null);
    const trimmed = body.trim();
    const { error: err } = await upsertReview({
      userId,
      venueId,
      rating,
      body: trimmed.length > 0 ? trimmed : null,
    });
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
        {existing ? "Your review" : "Your rating"}
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
        label={existing ? "Update review" : "Post review"}
        onPress={handleSubmit}
        loading={busy}
      />
      {existing ? (
        <Text size="xs" variant="tertiary" style={styles.deleteHint}>
          To delete your review, go to Me → My reviews.
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

function ReviewRow({ review }: { review: Review }) {
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
        <Text size="xs" variant="tertiary">
          {date}
        </Text>
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
  deleteHint: {
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
  reviewBody: {
    marginTop: spacing.xs,
  },
  emptyCopy: {
    paddingVertical: spacing.lg,
    textAlign: "center",
  },
});
