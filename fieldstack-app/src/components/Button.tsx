import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from "react-native";

import { borderRadius, fontSize, spacing } from "../theme/tokens";
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

  // Primary presses shift to the dedicated darker fill (brandDark) instead
  // of dimming — opacity washes the label out against busy backgrounds.
  const backgroundFor = (pressed: boolean): string => {
    if (variant === "primary") return pressed ? colors.brandDark : colors.brand;
    if (variant === "secondary") return colors.surfaceSecondary;
    return "transparent";
  };

  const textColor =
    variant === "primary"
      ? colors.onBrand
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
          backgroundColor: backgroundFor(pressed),
          opacity: isDisabled
            ? 0.4
            : pressed && variant !== "primary"
              ? 0.7
              : 1,
        },
        // Stud shadow: a hard chalk-free drop in the pressed-state color.
        // Pressing sinks the button into it — tactile, like studs in turf.
        // (iOS only; Android elevation can't do hard offsets, so it gets a
        // regular soft elevation instead.)
        variant === "primary" && !isDisabled && {
          shadowColor: colors.brandDark,
          shadowOpacity: 0.55,
          shadowRadius: 0,
          shadowOffset: { width: 0, height: pressed ? 0 : 3 },
          elevation: pressed ? 1 : 4,
          transform: [{ translateY: pressed ? 2 : 0 }],
        },
        variant === "secondary" && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          font="display"
          style={{
            color: textColor,
            fontSize: fontSize.lg + 1,
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
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
