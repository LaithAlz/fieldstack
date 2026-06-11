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
// Two voices ("Floodlit Pitch" type system):
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
   * surface — white-on-bright-green lands around 1.9:1, so dark mode flips
   * to a near-black ink instead.
   */
  onBrand: string;
  /**
   * High-energy highlight — floodlight lime. Reserved for small moments
   * (activity pills, eyebrow ticks, live indicators), never large fills.
   * Pair with `onAccent` ink when used as a background.
   */
  accent: string;
  onAccent: string;
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

// "Floodlit Pitch" palettes. The old zinc neutrals read as generic SaaS;
// every neutral here carries a faint green cast so the whole app feels like
// it lives pitch-side without shouting about it.
//
// Light = match day: chalk-white surfaces, grass-tinted grouped sections,
// deep pitch-green brand. Dark = floodlit night game: green-black surfaces,
// a brighter floodlit brand green, lime accent glowing against it.
const lightColors: ThemeColors = {
  brand: "#15803D",            // deep pitch green
  brandDark: "#14532D",        // pressed states
  onBrand: "#FFFFFF",
  accent: "#65A30D",           // lime-600 — readable on chalk
  onAccent: "#FFFFFF",
  surface: "#FBFBF7",          // chalk white, warm not clinical
  surfaceSecondary: "#F0F3EA", // grass-tinted grouped sections / cards
  textPrimary: "#171D18",      // green-cast near-black
  textSecondary: "#566055",    // green-cast slate
  textTertiary: "#98A296",
  border: "#E2E6DB",           // chalk-line
  success: "#10B981",          // emerald — distinct from brand green
  danger: "#DC2626",
  overlay: "rgba(13, 20, 14, 0.5)",
};

const darkColors: ThemeColors = {
  brand: "#4ADE80",            // floodlit green — bright against the night
  brandDark: "#22C55E",
  onBrand: "#06230F",          // near-black green ink on the bright fill
  accent: "#A3E635",           // lime-400 — the floodlight glow
  onAccent: "#1A2E05",
  surface: "#0B120D",          // pitch at night, not pure black
  surfaceSecondary: "#151E17",
  textPrimary: "#F2F6F0",
  textSecondary: "#9DAB9E",
  textTertiary: "#67746A",
  border: "#26312A",
  success: "#34D399",
  danger: "#F87171",
  overlay: "rgba(4, 9, 5, 0.72)",
};

export const colors: { light: ThemeColors; dark: ThemeColors } = {
  light: lightColors,
  dark: darkColors,
};
