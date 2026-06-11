// Spacing — multiples of 4 so layouts align cleanly to a 4pt grid.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
export type Spacing = typeof spacing;

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
} as const;
export type BorderRadius = typeof borderRadius;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
  // Hero size for the condensed display face — screen titles and big
  // numerals. Condensed type reads narrower, so it earns the extra points.
  xxxl: 34,
} as const;
export type FontSize = typeof fontSize;

// React Native typing for fontWeight is a string literal union, so these
// strings need to match exactly.
export const fontWeight = {
  regular: "400",
  medium: "500",
  bold: "600",
  display: "600",
  displayBold: "700",
} as const;
export type FontWeight = typeof fontWeight;

// Family names map to the variants loaded in App.tsx via expo-font. Each
// weight is a distinct font file because RN can't synthesize bold from a
// single regular .ttf reliably across platforms.
//
// Two voices ("Night Kickoff" type system):
//   - Figtree — warm geometric sans for body copy and UI labels.
//   - Barlow Condensed — the display face. Condensed, athletic, the
//     typography of kit numbers and stadium scoreboards. Used for screen
//     titles, prices, and map-pin numerals via <Text font="display">.
export const fontFamily = {
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  bold: "Figtree_600SemiBold",
  display: "BarlowCondensed_600SemiBold",
  displayBold: "BarlowCondensed_700Bold",
} as const;
export type FontFamily = typeof fontFamily;

/**
 * Single shape both light and dark must satisfy. Adding a new color here
 * forces both palettes to define it — keeps them in lockstep.
 */
export type ThemeColors = {
  brand: string;
  brandDark: string;
  /**
   * Text/icon color for filled accent surfaces (brand / success / danger
   * backgrounds). White works on the light palette's deeper fills, but the
   * dark palette brightens those fills for contrast against the near-black
   * surface, so dark mode flips to a near-black ink instead.
   */
  onBrand: string;
  /**
   * High-energy highlight — electric sky blue, the flash of a broadcast
   * graphic. Reserved for small moments (activity pills, live indicators),
   * never large fills. Pair with `onAccent` ink when used as a background.
   */
  accent: string;
  onAccent: string;
  /**
   * The marquee block (Explore header, hero moments). Night-sky ink navy in
   * BOTH schemes — in light mode it's the dramatic counterweight to the
   * paper surfaces; in dark mode it's a half-step lighter than the page.
   * `onHero` is always paper.
   */
  heroSurface: string;
  onHero: string;
  onHeroMuted: string;
  surface: string;
  surfaceSecondary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  success: string;
  danger: string;
  overlay: string;
};

// "Night Kickoff" palettes. Paper, ink, and the orange winter match ball.
//
// Light = warm paper surfaces with blue-black ink type and a vivid
// tangerine brand — editorial, like a printed match programme. Dark = the
// night game: deep ink-navy sky, the ball-orange brand glowing against it.
// Green appears nowhere except the semantic `success`.
const lightColors: ThemeColors = {
  brand: "#C2410C",            // tangerine — the match ball
  brandDark: "#9A3412",        // pressed states
  onBrand: "#FFFFFF",
  accent: "#0284C7",           // electric sky — broadcast flash
  onAccent: "#FFFFFF",
  heroSurface: "#1A1D2B",      // night-sky ink navy
  onHero: "#F6F2EA",           // paper
  onHeroMuted: "rgba(246, 242, 234, 0.72)",
  surface: "#FAF7F2",          // warm paper, not clinical white
  surfaceSecondary: "#F1ECE2", // sand — grouped sections / cards
  textPrimary: "#1A1D2B",      // ink navy
  textSecondary: "#565B6E",
  textTertiary: "#9CA1B2",
  border: "#E6E0D4",
  success: "#10B981",          // emerald, semantic only
  danger: "#DC2626",
  overlay: "rgba(16, 18, 28, 0.5)",
};

const darkColors: ThemeColors = {
  brand: "#FF6B2C",            // ball orange, bright against the night
  brandDark: "#E8551A",
  onBrand: "#2A1205",          // near-black ember ink on the bright fill
  accent: "#38BDF8",           // sky-400 — the floodlight flash
  onAccent: "#082F49",
  heroSurface: "#171C2C",      // a half-step above the page
  onHero: "#F4F1EA",
  onHeroMuted: "rgba(244, 241, 234, 0.7)",
  surface: "#0E131F",          // night sky, not pure black
  surfaceSecondary: "#181E2E",
  textPrimary: "#F4F1EA",      // paper
  textSecondary: "#A8ADBF",
  textTertiary: "#6E7488",
  border: "#2A3145",
  success: "#34D399",
  danger: "#F87171",
  overlay: "rgba(6, 8, 14, 0.72)",
};

export const colors: { light: ThemeColors; dark: ThemeColors } = {
  light: lightColors,
  dark: darkColors,
};
