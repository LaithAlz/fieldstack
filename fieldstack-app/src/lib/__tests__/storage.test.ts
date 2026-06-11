import AsyncStorage from "@react-native-async-storage/async-storage";

import { getLastFilters, setLastFilters, type StoredFilters } from "../storage";

const FILTERS_KEY = "@fieldstack/last_filters";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("last filters persistence", () => {
  it("round-trips a full filter set", async () => {
    const filters: StoredFilters = {
      surface: ["turf"],
      size: ["5v5"],
      venueType: ["private"],
      priceMax: 80,
      sort: "price_asc",
    };
    await setLastFilters(filters);
    expect(await getLastFilters()).toEqual(filters);
  });

  it("accepts every size the filter UI offers (regression: futsal/3v3 wiped filters)", async () => {
    const filters: StoredFilters = {
      surface: [],
      size: ["3v3", "futsal", "11v11"],
      venueType: [],
      priceMax: null,
      sort: "distance",
    };
    await setLastFilters(filters);
    expect(await getLastFilters()).toEqual(filters);
  });

  it("coerces a pre-015 entry without venueType to an empty array", async () => {
    const legacy = {
      surface: ["grass"],
      size: ["7v7"],
      priceMax: null,
      sort: "distance",
    };
    await AsyncStorage.setItem(FILTERS_KEY, JSON.stringify(legacy));
    expect(await getLastFilters()).toEqual({ ...legacy, venueType: [] });
  });

  it("rejects entries with unknown enum values", async () => {
    const garbage = {
      surface: ["lava"],
      size: ["5v5"],
      venueType: [],
      priceMax: null,
      sort: "distance",
    };
    await AsyncStorage.setItem(FILTERS_KEY, JSON.stringify(garbage));
    expect(await getLastFilters()).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    await AsyncStorage.setItem(FILTERS_KEY, "{not-json");
    expect(await getLastFilters()).toBeNull();
  });
});
