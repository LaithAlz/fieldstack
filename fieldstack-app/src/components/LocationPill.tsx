import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";

import type { PermissionStatus } from "../lib/location";
import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

type Props = {
  label: string;
  permissionStatus: PermissionStatus;
  onPress: () => void;
};

/**
 * Top-bar control that shows the current "browse from" area. When location
 * permission is denied, switches to a prompt-style "Set location" treatment
 * (REQ-F2.3) so the user knows action is needed.
 */
export function LocationPill({ label, permissionStatus, onPress }: Props) {
  const colors = useTheme();
  const denied = permissionStatus === "denied";

  // Distinct treatment when denied: tinted brand background + chevron.
  const bg = denied ? colors.brand + "1F" : colors.surfaceSecondary;
  const fg = denied ? colors.brand : colors.textPrimary;
  const text = denied ? "Set location" : label;
  const a11yLabel = denied
    ? "Set location. Tap to enable location access."
    : `Currently browsing ${label}. Tap to change.`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg, opacity: pressed ? 0.7 : 1 },
      ]}
      hitSlop={spacing.sm}
    >
      <Ionicons
        name={denied ? "warning-outline" : "location"}
        size={16}
        color={fg}
        style={styles.icon}
      />
      <Text size="sm" weight="medium" style={{ color: fg }} numberOfLines={1}>
        {text}
      </Text>
      <Ionicons name="chevron-down" size={14} color={fg} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    minHeight: 36,
    alignSelf: "flex-start",
    maxWidth: 240,
  },
  icon: {
    marginRight: spacing.xs + 2,
  },
  chevron: {
    marginLeft: spacing.xs,
  },
});
