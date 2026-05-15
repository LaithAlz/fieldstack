import { formatScrapedAgo } from "../freshness";

const NOW = new Date("2026-05-15T12:00:00Z").getTime();

describe("formatScrapedAgo", () => {
  it("returns null for null / undefined / missing", () => {
    expect(formatScrapedAgo(null)).toBeNull();
    expect(formatScrapedAgo(undefined)).toBeNull();
    expect(formatScrapedAgo("")).toBeNull();
  });

  it("returns null for malformed strings", () => {
    expect(formatScrapedAgo("not-a-date")).toBeNull();
  });

  it("returns null for future timestamps (clock skew)", () => {
    const future = new Date(NOW + 60_000).toISOString();
    expect(formatScrapedAgo(future, NOW)).toBeNull();
  });

  it("uses 'just now' under an hour", () => {
    const t = new Date(NOW - 10 * 60 * 1000).toISOString();
    expect(formatScrapedAgo(t, NOW)).toBe("Updated just now");
  });

  it("rounds down to whole hours under a day", () => {
    const t = new Date(NOW - 5 * 60 * 60 * 1000 - 30 * 60 * 1000).toISOString();
    expect(formatScrapedAgo(t, NOW)).toBe("Updated 5h ago");
  });

  it("special-cases yesterday", () => {
    const t = new Date(NOW - 26 * 60 * 60 * 1000).toISOString();
    expect(formatScrapedAgo(t, NOW)).toBe("Updated yesterday");
  });

  it("uses days under a week", () => {
    const t = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatScrapedAgo(t, NOW)).toBe("Updated 3d ago");
  });

  it("uses weeks under a month", () => {
    const t = new Date(NOW - 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatScrapedAgo(t, NOW)).toBe("Updated 2w ago");
  });

  it("caps at '30+ days ago'", () => {
    const t = new Date(NOW - 90 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatScrapedAgo(t, NOW)).toBe("Updated 30+ days ago");
  });
});
