import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { selection } from "../lib/haptics";
import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

type Props = {
  label: string;
  isActive: boolean;
  /** When provided and active, rendered as a small badge next to the label. */
  count?: number;
  onPress: () => void;
  /**
   * Clear handler. Only used when `isActive` is true; renders an X icon that
   * resets the filter without opening the picker. Callers should not pass
   * this for chips whose only state is on/off.
   */
  onClear?: () => void;
};

/**
 * Toggleable filter pill used above the search results.
 *
 * Layout note: the consumer is responsible for at least 8pt spacing between
 * adjacent chips (REQ-F0.2). A horizontal `FlatList` with `ItemSeparatorComponent`
 * or a flex row with `gap: spacing.sm` both satisfy this.
 */
export function FilterChip({ label, isActive, count, onPress, onClear }: Props) {
  const colors = useTheme();

  const handlePress = () => {
    selection();
    onPress();
  };

  const handleClear = () => {
    selection();
    onClear?.();
  };

  const showClear = isActive && Boolean(onClear);
  const showCount = isActive && typeof count === "number" && count > 0;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={
        showCount ? `${label}, ${count} selected` : label
      }
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isActive ? colors.brand : colors.surface,
          borderColor: isActive ? colors.brand : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: isActive ? "#FFFFFF" : colors.textPrimary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>

      {showCount ? (
        <View style={[styles.countBadge, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.countText, { color: colors.brand }]}>
            {count}
          </Text>
        </View>
      ) : null}

      {showClear ? (
        <Pressable
          onPress={handleClear}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label} filter`}
          hitSlop={spacing.sm}
          style={styles.clear}
        >
          <Ionicons name="close" size={14} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs + 2,
  },
  countText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  clear: {
    marginLeft: spacing.xs + 2,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
