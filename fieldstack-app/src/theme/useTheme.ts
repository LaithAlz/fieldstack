import { useColorScheme } from "react-native";

import { colors, type ThemeColors } from "./tokens";

/**
 * Returns the active color set based on the system color scheme.
 *
 * Other tokens (spacing, fontSize, etc.) don't change between light and dark,
 * so import them directly from `./tokens` rather than going through this hook.
 *
 * `useColorScheme()` returns `null` briefly on first render in some setups —
 * fall back to light so we never render unstyled.
 */
export function useTheme(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === "dark" ? colors.dark : colors.light;
}
