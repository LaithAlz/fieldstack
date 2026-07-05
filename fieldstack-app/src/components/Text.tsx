import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { fontFamily, fontSize, fontWeight } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

export type TextSize = keyof typeof fontSize;
export type TextWeight = keyof typeof fontWeight;
export type TextVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "danger"
  | "success";

type Props = RNTextProps & {
  size?: TextSize;
  weight?: TextWeight;
  variant?: TextVariant;
  /**
   * "display" switches to the condensed athletic face (Barlow Condensed) —
   * screen titles, prices, kit-number moments. Body copy stays on the
   * default face. weight maps regular/medium -> SemiBold, bold -> Bold.
   */
  font?: "body" | "display";
};

// REQ-F0.5: ≥1.5 line-height on body text. Headings tighten slightly so big
// titles don't feel airy. Override via the `style` prop when needed.
const LINE_HEIGHT_RATIO: Record<TextSize, number> = {
  xs: 1.5,
  sm: 1.5,
  md: 1.5,
  lg: 1.5,
  xl: 1.3,
  xxl: 1.25,
  xxxl: 1.1,
  // Scoreboard digits are tabular and single-line — the tightest ratio in
  // the scale, matching how a broadcast scoreboard sets its numerals.
  scoreboard: 1.05,
};

/**
 * Themed wrapper around RN Text. `size` and `weight` map to design tokens;
 * `variant` selects a semantic color from the active theme. Pass `style` to
 * extend or override (custom style wins via array merge).
 */
export function Text({
  size = "md",
  weight = "regular",
  variant = "primary",
  font = "body",
  style,
  ...rest
}: Props) {
  const colors = useTheme();
  const colorByVariant: Record<TextVariant, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    danger: colors.danger,
    success: colors.success,
  };
  const family =
    font === "display"
      ? weight === "bold"
        ? fontFamily.displayBold
        : fontFamily.display
      : fontFamily[weight];
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: family,
          fontSize: fontSize[size],
          lineHeight: Math.round(fontSize[size] * LINE_HEIGHT_RATIO[size]),
          // fontWeight kept for fallback when the custom face hasn't loaded
          // yet or on platforms where the family doesn't exist. RN ignores
          // conflicting weight when fontFamily resolves.
          fontWeight: font === "display" ? fontWeight.displayBold : fontWeight[weight],
          color: colorByVariant[variant],
        },
        style,
      ]}
    />
  );
}
