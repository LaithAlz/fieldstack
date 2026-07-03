import { describe, expect, it } from "bun:test";

import {
  addressKey,
  findDuplicates,
  isGenericName,
  nameSimilarity,
  normalizeName,
  pickWinner,
  type DedupeVenue,
} from "../scripts/scrape/lib/dedupe.js";

function venue(overrides: Partial<DedupeVenue>): DedupeVenue {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Venue",
    address: null,
    lat: 43.65,
    lng: -79.38,
    external_id: "osm:1",
    field_count: 1,
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("strips punctuation, case, and legal-suffix noise", () => {
    expect(normalizeName("Markham Sports Dome Inc.")).toEqual([
      "markham",
      "sports",
      "dome",
    ]);
    expect(normalizeName("The Soccer Centre")).toEqual(["soccer", "centre"]);
  });

  it("keeps facility words that distinguish real venues", () => {
    // "Dome" vs "Centre" is the difference between two real Milton venues —
    // normalization must not erase it.
    expect(normalizeName("Milton Sports Dome")).toContain("dome");
    expect(normalizeName("Milton Sports Centre")).toContain("centre");
  });
});

describe("nameSimilarity", () => {
  it("is 1 for identical names regardless of punctuation", () => {
    expect(nameSimilarity("Toronto Soccerplex", "Toronto Soccerplex!")).toBe(1);
  });

  it("stays below the auto threshold for sibling facilities", () => {
    // Same complex family, different buildings — must NOT auto-merge.
    expect(nameSimilarity("Milton Sports Dome", "Milton Sports Centre")).toBeLessThan(
      0.85
    );
  });

  it("scores unrelated names near zero", () => {
    expect(
      nameSimilarity("East Toronto Soccer", "Scarborough Soccer Centre")
    ).toBeLessThan(0.3);
  });
});

describe("addressKey", () => {
  it("collides for the same street address written differently", () => {
    expect(addressKey("45 Fairfax Crescent, Scarborough, ON M1L 1Z6")).toBe(
      addressKey("45 Fairfax Cres, Toronto")
    );
  });

  it("returns null without a leading street number", () => {
    expect(addressKey("Scarborough Soccer Centre")).toBeNull();
    expect(addressKey(null)).toBeNull();
  });
});

describe("pickWinner", () => {
  it("prefers manual over google over osm", () => {
    const manual = venue({ id: "b", external_id: "manual:x" });
    const google = venue({ id: "a", external_id: "google:x", field_count: 5 });
    expect(pickWinner(google, manual)[0]).toBe(manual);
    const osm = venue({ id: "c", external_id: "osm:x" });
    expect(pickWinner(osm, google)[0]).toBe(google);
  });

  it("breaks source ties on field count, then id, deterministically", () => {
    const rich = venue({ id: "z", external_id: "osm:1", field_count: 3 });
    const poor = venue({ id: "a", external_id: "osm:2", field_count: 1 });
    expect(pickWinner(poor, rich)[0]).toBe(rich);
    const same1 = venue({ id: "a", external_id: "osm:1" });
    const same2 = venue({ id: "b", external_id: "osm:2" });
    expect(pickWinner(same2, same1)[0]).toBe(same1);
  });
});

describe("isGenericName", () => {
  it("treats kind-of-place names as generic and branded names as specific", () => {
    expect(isGenericName("Senior Soccer Field")).toBe(true);
    expect(isGenericName("Soccer Pitch")).toBe(true);
    expect(isGenericName("Toronto Soccerplex")).toBe(false);
    expect(isGenericName("Milton Sports Dome")).toBe(false);
  });
});

describe("findDuplicates", () => {
  it("auto-flags the same name at the same spot across sources, keeping google", () => {
    const a = venue({ id: "a", name: "Toronto Soccerplex", external_id: "google:p1" });
    const b = venue({
      id: "b",
      name: "Toronto Soccerplex",
      external_id: "osm:n1",
      lat: 43.6501, // ~11m away
    });
    const pairs = findDuplicates([a, b]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.tier).toBe("auto");
    expect(pairs[0]!.keep.id).toBe("a");
    expect(pairs[0]!.drop.id).toBe("b");
  });

  it("never pairs two OSM rows — sibling pitches share a name legitimately", () => {
    // Real case: a park's mini fields are separate OSM ways with one label.
    const pitches = ["w1", "w2", "w3", "w4"].map((w, i) =>
      venue({
        id: w,
        name: "Creditview Sandalwood Park (Mini #1-4)",
        external_id: `osm:way/${w}`,
        lat: 43.65 + i * 0.0004, // 40-ish metres apart
      })
    );
    expect(findDuplicates(pitches)).toHaveLength(0);
  });

  it("auto-merges generic names across sources only when pins nearly coincide", () => {
    const g = venue({ id: "a", name: "Senior Soccer Field", external_id: "google:p9" });
    const nearOsm = venue({
      id: "b",
      name: "Senior Soccer Field",
      external_id: "osm:w9",
      lat: 43.65009, // ~10m
    });
    expect(findDuplicates([g, nearOsm])[0]?.tier).toBe("auto");

    const farOsm = venue({
      id: "c",
      name: "Senior Soccer Field",
      external_id: "osm:w10",
      lat: 43.6511, // ~120m — could be the next pitch over
    });
    const far = findDuplicates([g, farOsm]);
    expect(far.every((p) => p.tier !== "auto")).toBe(true);
  });

  it("never auto-merges two google listings — facility vs tenant is a human call", () => {
    const a = venue({ id: "a", name: "Scarborough Soccer Centre", external_id: "google:p1" });
    const b = venue({
      id: "b",
      name: "Scarborough Soccer Centre",
      external_id: "google:p2",
      lat: 43.65003,
    });
    const pairs = findDuplicates([a, b]);
    expect(pairs.every((p) => p.tier === "review")).toBe(true);
  });

  it("does NOT flag the same name in different cities", () => {
    // Two real Soccer Glow Kingdom locations (Vaughan vs Mississauga).
    const vaughan = venue({ id: "a", name: "Soccer Glow Kingdom", lat: 43.83, lng: -79.53 });
    const mississauga = venue({ id: "b", name: "Soccer Glow Kingdom", lat: 43.59, lng: -79.75 });
    expect(findDuplicates([vaughan, mississauga])).toHaveLength(0);
  });

  it("sends same-address different-name pairs to review, never auto", () => {
    const facility = venue({
      id: "a",
      name: "Scarborough Soccer Centre",
      address: "45 Fairfax Crescent, Scarborough, ON",
      external_id: "google:p2",
    });
    const tenant = venue({
      id: "b",
      name: "East Toronto Soccer",
      address: "45 Fairfax Cres, Toronto",
      external_id: "google:p3",
      lat: 43.65005,
    });
    const pairs = findDuplicates([facility, tenant]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.tier).toBe("review");
  });

  it("ignores nearby venues with unrelated names and addresses", () => {
    const a = venue({ id: "a", name: "Riverdale Park East", address: "550 Broadview Ave" });
    const b = venue({ id: "b", name: "Withrow Park", address: "725 Logan Ave", lat: 43.6503 });
    expect(findDuplicates([a, b])).toHaveLength(0);
  });

  it("skips venues without coordinates", () => {
    const a = venue({ id: "a", name: "Same Name", lat: null, lng: null });
    const b = venue({ id: "b", name: "Same Name" });
    expect(findDuplicates([a, b])).toHaveLength(0);
  });
});
