import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

type Props = {
  count: number;
  /** Singular noun. Plural is just `${noun}s`. */
  noun: string;
  /** When true, shows the last-known count if any, else "Searching…". */
  loading?: boolean;
};

/**
 * Compact "12 venues" pill used over the map. Light surface with a subtle
 * shadow so it lifts off any underlying photo / map style.
 *
 * Stale-while-revalidate: when `loading` flickers true between filter changes,
 * the prior count stays visible rather than flashing "Searching…" between
 * results. Only the very first load (no prior count) shows the spinner copy.
 *
 * Live region announces only on settled, non-loading counts to avoid the
 * "Searching, 3 venues, Searching, 5 venues" announcement spam during rapid
 * chip taps.
 */
export function ResultCountPill({ count, noun, loading = false }: Props) {
  const colors = useTheme();
  const lastSettledCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!loading) lastSettledCountRef.current = count;
  }, [loading, count]);

  const settledCount = !loading ? count : lastSettledCountRef.current;
  const label =
    settledCount === null
      ? "Searching…"
      : `${settledCount} ${settledCount === 1 ? noun : `${noun}s`}`;

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
      // Only loud during a settled state so SR users don't hear the
      // intermediate "Searching…" between every chip tap.
      accessibilityLiveRegion={loading ? "none" : "polite"}
    >
      <Text size="sm" weight="medium" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 28,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
