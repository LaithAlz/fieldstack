/**
 * AsyncStorage-backed fallback for the venue list. Used so the app opens
 * with content (and "Showing cached results" banner) when the network is
 * down or the API is unreachable, instead of a blank loading state.
 *
 * Strategy: keep one most-recent successful response. We don't key by
 * coords/radius — for offline fallback, *any* recent list is more useful
 * than nothing. Acceptable trade since the banner explicitly tells the
 * user the data is cached.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { VenueWithFields } from "../types/api";

const KEY = "@fieldstack/venue_cache_v1";
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

type CacheEntry = {
  data: VenueWithFields[];
  fetchedAt: number;
};

export type CachedVenues = {
  venues: VenueWithFields[];
  fetchedAt: number;
};

/**
 * Reads the most recent cached venue list. Returns null on first launch,
 * when storage is empty, when the payload doesn't parse, or when the
 * entry is older than `maxAgeMs`.
 */
export async function getCachedVenues(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): Promise<CachedVenues | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isCacheEntry(parsed)) return null;
    if (Date.now() - parsed.fetchedAt > maxAgeMs) return null;
    return { venues: parsed.data, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

/**
 * Writes the latest successful response. Failures here are silent — the
 * worst case is the next offline launch lacks a snapshot, not a crash.
 */
export async function setCachedVenues(data: VenueWithFields[]): Promise<void> {
  try {
    const entry: CacheEntry = { data, fetchedAt: Date.now() };
    await AsyncStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Ignore — see comment above.
  }
}

export async function clearCachedVenues(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.data) &&
    typeof v.fetchedAt === "number" &&
    Number.isFinite(v.fetchedAt)
  );
}
