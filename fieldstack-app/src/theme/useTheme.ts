import { colors, type ThemeColors } from "./tokens";

/**
 * Onside ships a single light "Matchday Programme" look: warm paper, ink-navy
 * masthead, tangerine brand. We deliberately ignore the phone's dark setting so
 * the app reads the same for everyone (a dark-mode phone used to flip the whole
 * UI to the night palette). The dark palette stays defined in tokens for a
 * possible future opt-in toggle.
 *
 * Other tokens (spacing, fontSize, etc.) don't change, so import them directly
 * from `./tokens` rather than through this hook.
 */
export function useTheme(): ThemeColors {
  return colors.light;
}
