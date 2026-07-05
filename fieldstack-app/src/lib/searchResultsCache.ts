/**
 * AsyncStorage-backed fallback for Explore's field-search results — same
 * one-snapshot strategy as venueCache.ts. Now that useFieldSearch's 75km
 * search is Explore's single data source (VenueListScreen + its
 * getCachedVenues fallback are retired), this hook needs its own offline
 * story so a network blip on Explore doesn't dump the user on a blank
 * screen instead of their last-seen results.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SearchResult } from "../types/api";

const KEY = "@fieldstack/search_results_cache_v1";
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

type CacheEntry = {
  data: SearchResult[];
  fetchedAt: number;
};

export type CachedSearchResults = {
  results: SearchResult[];
  fetchedAt: number;
};

/**
 * Reads the most recent cached search results. Returns null on first launch,
 * when storage is empty, when the payload doesn't parse, or when the entry
 * is older than `maxAgeMs`.
 */
export async function getCachedSearchResults(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): Promise<CachedSearchResults | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isCacheEntry(parsed)) return null;
    if (Date.now() - parsed.fetchedAt > maxAgeMs) return null;
    return { results: parsed.data, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

/**
 * Writes the latest successful response. Failures here are silent — the
 * worst case is the next offline launch lacks a snapshot, not a crash.
 */
export async function setCachedSearchResults(data: SearchResult[]): Promise<void> {
  try {
    const entry: CacheEntry = { data, fetchedAt: Date.now() };
    await AsyncStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Ignore — see comment above.
  }
}

export async function clearCachedSearchResults(): Promise<void> {
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
