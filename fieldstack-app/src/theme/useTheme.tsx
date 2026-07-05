import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

import { colors, type ThemeColors } from "./tokens";

const KEY = "@fieldstack/theme_preference";

/** User-facing choice. "system" (the default) follows the OS setting. */
export type ThemePreference = "system" | "light" | "dark";
type ActiveScheme = "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** The resolved scheme actually in effect right now. */
  active: ActiveScheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Resolves the app's color scheme: user preference ("system" | "light" |
 * "dark", persisted in AsyncStorage) crossed with the OS setting
 * (`useColorScheme()`), and exposes both the resolved `ThemeColors` (via
 * `useTheme()`) and the raw preference (via `useThemePreference()`, used by
 * the Settings "Appearance" picker).
 *
 * Must wrap anything that calls `useTheme()`/`useThemePreference()` — mount
 * high in App.tsx, inside ErrorBoundary (so a crash here still falls back to
 * the theme-free error screen) and outside every provider that themes its
 * own UI (Toast, etc).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (!cancelled && isThemePreference(raw)) {
          setPreferenceState(raw);
        }
      } catch {
        // Read failure is fine — fall back to the "system" default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(KEY, next).catch(() => undefined);
  }, []);

  const active: ActiveScheme =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, setPreference, active }),
    [preference, setPreference, active]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The user's raw appearance choice plus the resolved active scheme. */
export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemePreference must be used inside <ThemeProvider>");
  }
  return ctx;
}

/**
 * Other tokens (spacing, fontSize, etc.) don't change with the scheme, so
 * import them directly from `./tokens` rather than through this hook.
 */
export function useTheme(): ThemeColors {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return colors[ctx.active];
}
