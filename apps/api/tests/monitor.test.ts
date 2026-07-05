import { describe, expect, it } from "bun:test";

import {
  writeFailures,
  sourcePrefixCounts,
  zeroRegressions,
  ZERO_GUARD_MIN,
  type SourceRunResult,
} from "../scripts/scrape/lib/monitor.js";

function result(overrides: Partial<SourceRunResult>): SourceRunResult {
  return {
    source: "osm",
    fetched: 10,
    venuesUpserted: 10,
    fieldsUpserted: 10,
    ...overrides,
  };
}

describe("sourcePrefixCounts", () => {
  it("counts ids per prefix, mixed sources", () => {
    const counts = sourcePrefixCounts([
      "osm:way/1",
      "osm:way/2",
      "manual:foo",
      "google:place/1",
      "osm:way/3",
    ]);
    expect(counts.get("osm")).toBe(3);
    expect(counts.get("manual")).toBe(1);
    expect(counts.get("google")).toBe(1);
  });

  it("counts an id with no ':' under its whole string", () => {
    const counts = sourcePrefixCounts(["osm:way/1", "noprefixid"]);
    expect(counts.get("noprefixid")).toBe(1);
    expect(counts.get("osm")).toBe(1);
  });

  it("returns an empty map for no ids", () => {
    expect(sourcePrefixCounts([]).size).toBe(0);
  });
});

describe("zeroRegressions", () => {
  it("fires when fetched === 0 and prior count >= min", () => {
    const results = [result({ source: "mississauga", fetched: 0 })];
    const prior = new Map([["mississauga", 20]]);
    const regressions = zeroRegressions(results, prior);
    expect(regressions).toHaveLength(1);
    expect(regressions[0]!.source).toBe("mississauga");
  });

  it("does not fire for adapter errors (fetched === null)", () => {
    const results = [
      result({ source: "mississauga", fetched: null, error: "boom" }),
    ];
    const prior = new Map([["mississauga", 20]]);
    expect(zeroRegressions(results, prior)).toHaveLength(0);
  });

  it("does not fire when fetched > 0", () => {
    const results = [result({ source: "osm", fetched: 5 })];
    const prior = new Map([["osm", 20]]);
    expect(zeroRegressions(results, prior)).toHaveLength(0);
  });

  it("does not fire when prior count is below min (playtomic-is-empty-today case)", () => {
    const results = [result({ source: "playtomic", fetched: 0 })];
    const prior = new Map([["playtomic", ZERO_GUARD_MIN - 1]]);
    expect(zeroRegressions(results, prior)).toHaveLength(0);
  });

  it("does not fire for a source with no prior rows", () => {
    const results = [result({ source: "brandnew", fetched: 0 })];
    const prior = new Map<string, number>();
    expect(zeroRegressions(results, prior)).toHaveLength(0);
  });

  it("respects a custom min threshold", () => {
    const results = [result({ source: "osm", fetched: 0 })];
    const prior = new Map([["osm", 2]]);
    expect(zeroRegressions(results, prior, 2)).toHaveLength(1);
    expect(zeroRegressions(results, prior, 3)).toHaveLength(0);
  });
});

describe("writeFailures", () => {
  const base = { venuesUpserted: 0, fieldsUpserted: 0 };

  it("flags a source that fetched rows but upserted none", () => {
    const out = writeFailures([{ source: "google", fetched: 120, ...base }]);
    expect(out.map((r) => r.source)).toEqual(["google"]);
  });

  it("ignores errored, empty, and healthy sources", () => {
    expect(
      writeFailures([
        { source: "a", fetched: null, ...base, error: "boom" },
        { source: "b", fetched: 0, ...base },
        { source: "c", fetched: 10, venuesUpserted: 10, fieldsUpserted: 12 },
      ])
    ).toEqual([]);
  });
});
