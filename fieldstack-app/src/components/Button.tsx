import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from "react-native";

import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost";

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

const MIN_HEIGHT = 44; // REQ-F0.2 — minimum touch target

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const colors = useTheme();
  const isDisabled = disabled || loading;

  const backgroundFor = (): string => {
    if (variant === "primary") return colors.brand;
    if (variant === "secondary") return colors.surfaceSecondary;
    return "transparent";
  };

  const textColor =
    variant === "primary"
      ? "#FFFFFF"
      : variant === "secondary"
        ? colors.textPrimary
        : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: backgroundFor(),
          opacity: isDisabled ? 0.4 : pressed ? 0.7 : 1,
        },
        variant === "secondary" && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          style={{ color: textColor, fontSize: fontSize.lg, fontWeight: fontWeight.bold }}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_HEIGHT,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
});
