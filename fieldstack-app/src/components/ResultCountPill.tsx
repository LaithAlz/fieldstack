import { StyleSheet, View } from "react-native";

import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

type Props = {
  count: number;
  /** Singular noun. Plural is just `${noun}s`. */
  noun: string;
  /** When true, shows a "Searching…" state instead of the count. */
  loading?: boolean;
};

/**
 * Compact "12 venues" pill used over the map. Light surface with a subtle
 * shadow so it lifts off any underlying photo / map style; live-region so
 * a screen reader announces filter updates without re-focusing the chips.
 */
export function ResultCountPill({ count, noun, loading = false }: Props) {
  const colors = useTheme();
  const label = loading
    ? "Searching…"
    : `${count} ${count === 1 ? noun : `${noun}s`}`;

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
      accessibilityLiveRegion="polite"
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
