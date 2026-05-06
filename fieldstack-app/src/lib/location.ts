/**
 * Location plumbing. We only ever ask for foreground permission — never
 * background. The Welcome → LocationPermission flow checks status silently
 * on mount and only triggers the system dialog when the user explicitly
 * taps "Enable location."
 */

import * as Location from "expo-location";
import { Linking, Platform } from "react-native";

// Yonge & Bloor — central downtown Toronto, used as fallback when the user
// declines location or skips onboarding.
export const DEFAULT_COORDS = {
  lat: 43.6709,
  lng: -79.3863,
} as const;

export type Coords = { lat: number; lng: number };

export type PermissionStatus =
  | "granted"
  | "denied"
  | "undetermined";

/** Read current permission status without prompting. Safe on every cold start. */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status;
  } catch {
    return "undetermined";
  }
}

/** Trigger the system permission dialog. Only call from explicit user action. */
export async function requestPermission(): Promise<PermissionStatus> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status;
  } catch {
    return "denied";
  }
}

/**
 * Fetch the current device coordinates. Returns null on any failure — callers
 * should fall back to DEFAULT_COORDS rather than block on this.
 */
export async function getCurrentCoords(): Promise<Coords | null> {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch {
    return null;
  }
}

/**
 * Open the OS location settings page so the user can flip a previously-denied
 * permission. iOS opens the app's settings, Android opens app info — both work.
 */
export async function openLocationSettings(): Promise<void> {
  if (Platform.OS === "ios") {
    await Linking.openURL("app-settings:");
  } else {
    await Linking.openSettings();
  }
}
