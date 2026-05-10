/**
 * Typed AsyncStorage wrappers. Keep keys namespaced and centralize JSON
 * (de)serialization so callers never deal with stringification themselves.
 *
 * All getters swallow read errors and return a sensible default — storage
 * failures shouldn't crash the app, they should fall back to "fresh user".
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { FieldSize, FieldSurface } from "../types/api";

const KEYS = {
  onboardingComplete: "@fieldstack/onboarding_complete",
  sportPreference: "@fieldstack/sport_preference",
  lastLocation: "@fieldstack/last_location",
  lastFilters: "@fieldstack/last_filters",
} as const;

export type SportPreference = FieldSize[] | null;
export type StoredCoords = { lat: number; lng: number };

export type StoredFilters = {
  surface: FieldSurface[];
  size: FieldSize[];
  priceMax: number | null;
  sort: "distance" | "price_asc" | "price_desc";
};

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

// ---------- last applied search filters ----------

const VALID_SURFACES: FieldSurface[] = ["turf", "grass", "concrete", "indoor"];
const VALID_SIZES: FieldSize[] = ["5v5", "7v7", "11v11"];
const VALID_SORTS = ["distance", "price_asc", "price_desc"] as const;

function isValidStoredFilters(parsed: unknown): parsed is StoredFilters {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  return (
    Array.isArray(p.surface) &&
    p.surface.every((s) => VALID_SURFACES.includes(s as FieldSurface)) &&
    Array.isArray(p.size) &&
    p.size.every((s) => VALID_SIZES.includes(s as FieldSize)) &&
    (p.priceMax === null || typeof p.priceMax === "number") &&
    typeof p.sort === "string" &&
    (VALID_SORTS as readonly string[]).includes(p.sort)
  );
}

export async function getLastFilters(): Promise<StoredFilters | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.lastFilters);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidStoredFilters(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function setLastFilters(value: StoredFilters): Promise<void> {
  await AsyncStorage.setItem(KEYS.lastFilters, JSON.stringify(value));
}

export async function clearLastFilters(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.lastFilters);
}
