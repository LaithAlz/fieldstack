// Public API for the app's design tokens. Color values and the numeric
// scales below are sourced from design/tokens.json (single source of truth,
// shared with the site) via the generated `./palette` — see
// design/generate.mjs. fontWeight/fontFamily stay hand-written here since
// font files are app-specific.
import {
  darkColors,
  fontSizeScale,
  lightColors,
  radiusScale,
  spacingScale,
} from "./palette";

// Spacing — multiples of 4 so layouts align cleanly to a 4pt grid.
export const spacing = spacingScale;
export type Spacing = typeof spacing;

export const borderRadius = radiusScale;
export type BorderRadius = typeof borderRadius;

export const fontSize = fontSizeScale;
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
   * Open-now / floodlight signal — amber, reserved for the single "open
   * now" indicator so it doesn't compete with the brand color.
   */
  amber: string;
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
  /**
   * Cards and sheets that sit above the ground surface — needs its own slot
   * because dark mode can't just lighten `surface` by a fixed step the way
   * light mode's plain white card does.
   */
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  success: string;
  danger: string;
  /**
   * The FREE badge's foil-gradient trio — `foilA`/`foilB` are the gradient
   * stops, `onFoil` the ink on top of them.
   */
  foilA: string;
  foilB: string;
  onFoil: string;
};

export const colors: { light: ThemeColors; dark: ThemeColors } = {
  light: lightColors,
  dark: darkColors,
};
