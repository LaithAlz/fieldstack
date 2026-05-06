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
} as const;
export type FontSize = typeof fontSize;

// React Native typing for fontWeight is a string literal union, so these
// strings need to match exactly.
export const fontWeight = {
  regular: "400",
  medium: "500",
  bold: "600",
} as const;
export type FontWeight = typeof fontWeight;

/**
 * Single shape both light and dark must satisfy. Adding a new color here
 * forces both palettes to define it — keeps them in lockstep.
 */
export type ThemeColors = {
  brand: string;
  brandDark: string;
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

const lightColors: ThemeColors = {
  brand: "#059669",            // emerald-600
  brandDark: "#047857",        // emerald-700, for pressed states
  surface: "#FFFFFF",
  surfaceSecondary: "#F4F4F5", // zinc-100, for cards / grouped sections
  textPrimary: "#18181B",      // zinc-900
  textSecondary: "#52525B",    // zinc-600
  textTertiary: "#A1A1AA",     // zinc-400
  border: "#E4E4E7",           // zinc-200
  success: "#10B981",          // emerald-500
  danger: "#EF4444",           // red-500
  overlay: "rgba(0, 0, 0, 0.5)",
};

const darkColors: ThemeColors = {
  brand: "#10B981",            // emerald-500, brighter for contrast on dark surfaces
  brandDark: "#059669",        // emerald-600
  surface: "#09090B",          // zinc-950
  surfaceSecondary: "#18181B", // zinc-900
  textPrimary: "#FAFAFA",      // zinc-50
  textSecondary: "#A1A1AA",    // zinc-400
  textTertiary: "#71717A",     // zinc-500
  border: "#27272A",           // zinc-800
  success: "#34D399",          // emerald-400
  danger: "#F87171",           // red-400, softer on dark
  overlay: "rgba(0, 0, 0, 0.7)",
};

export const colors: { light: ThemeColors; dark: ThemeColors } = {
  light: lightColors,
  dark: darkColors,
};
