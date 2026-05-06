/**
 * Typed AsyncStorage wrappers. Keep keys namespaced and centralize JSON
 * (de)serialization so callers never deal with stringification themselves.
 *
 * All getters swallow read errors and return a sensible default — storage
 * failures shouldn't crash the app, they should fall back to "fresh user".
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { FieldSize } from "../types/api";

const KEYS = {
  onboardingComplete: "@fieldstack/onboarding_complete",
  sportPreference: "@fieldstack/sport_preference",
  lastLocation: "@fieldstack/last_location",
} as const;

export type SportPreference = FieldSize[] | null;
export type StoredCoords = { lat: number; lng: number };

// ---------- onboarding flag ----------

export async function getOnboardingComplete(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEYS.onboardingComplete)) === "true";
  } catch {
    return false;
  }
}

export async function setOnboardingComplete(value: boolean): Promise<void> {
  await AsyncStorage.setItem(
    KEYS.onboardingComplete,
    value ? "true" : "false"
  );
}

// ---------- sport preference ----------

export async function getSportPreference(): Promise<SportPreference> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.sportPreference);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as FieldSize[]) : null;
  } catch {
    return null;
  }
}

export async function setSportPreference(value: SportPreference): Promise<void> {
  if (value === null || value.length === 0) {
    await AsyncStorage.removeItem(KEYS.sportPreference);
  } else {
    await AsyncStorage.setItem(KEYS.sportPreference, JSON.stringify(value));
  }
}

// ---------- last known location ----------

export async function getLastLocation(): Promise<StoredCoords | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.lastLocation);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { lat: unknown }).lat === "number" &&
      typeof (parsed as { lng: unknown }).lng === "number"
    ) {
      return parsed as StoredCoords;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setLastLocation(value: StoredCoords): Promise<void> {
  await AsyncStorage.setItem(KEYS.lastLocation, JSON.stringify(value));
}
