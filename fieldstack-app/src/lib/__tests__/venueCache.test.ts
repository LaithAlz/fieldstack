import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  clearCachedVenues,
  getCachedVenues,
  setCachedVenues,
} from "../venueCache";

const STORAGE_KEY = "@fieldstack/venue_cache_v1";

// Minimal shape that satisfies VenueWithFields well enough for storage.
// We never JSON.parse against the actual type — the cache just rehydrates
// whatever we put in.
const sampleVenue = {
  id: "v1",
  name: "Test Field",
  operator_id: "op1",
  address: "1 Test Lane",
  lat: 43.6709,
  lng: -79.3863,
  photos: [],
  amenities: [],
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  operator: null,
  fields: [],
  // VenueWithFields has more required fields in reality, but the cache
  // doesn't validate shape — it just round-trips JSON.
} as unknown as Parameters<typeof setCachedVenues>[0][number];

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("venueCache", () => {
  it("returns null when nothing is cached", async () => {
    expect(await getCachedVenues()).toBeNull();
  });

  it("round-trips a written entry", async () => {
    await setCachedVenues([sampleVenue]);
    const cached = await getCachedVenues();
    expect(cached).not.toBeNull();
    expect(cached?.venues).toHaveLength(1);
    expect(cached?.venues[0]?.id).toBe("v1");
    expect(typeof cached?.fetchedAt).toBe("number");
  });

  it("treats entries older than maxAgeMs as missing", async () => {
    // Hand-write an entry with an old timestamp so we don't have to mock Date.
    const ancient = { data: [sampleVenue], fetchedAt: Date.now() - 48 * 60 * 60 * 1000 };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ancient));
    expect(await getCachedVenues(24 * 60 * 60 * 1000)).toBeNull();
  });

  it("respects a custom maxAgeMs", async () => {
    const recent = { data: [sampleVenue], fetchedAt: Date.now() - 1000 };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    // 2 sec window — should hit
    expect(await getCachedVenues(2000)).not.toBeNull();
    // 0.5 sec window — should miss
    expect(await getCachedVenues(500)).toBeNull();
  });

  it("returns null when storage holds malformed JSON", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "not-json-{");
    expect(await getCachedVenues()).toBeNull();
  });

  it("returns null when the entry shape is wrong", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ data: "not-an-array", fetchedAt: Date.now() })
    );
    expect(await getCachedVenues()).toBeNull();
  });

  it("clear wipes the cache", async () => {
    await setCachedVenues([sampleVenue]);
    expect(await getCachedVenues()).not.toBeNull();
    await clearCachedVenues();
    expect(await getCachedVenues()).toBeNull();
  });
});
