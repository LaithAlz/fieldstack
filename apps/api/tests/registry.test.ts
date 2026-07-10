import { describe, expect, it } from "bun:test";

import { loadOperators, parseOperatorHours } from "../scripts/scrape/lib/registry.js";

describe("parseOperatorHours", () => {
  it("returns undefined when no hours block is present", () => {
    expect(parseOperatorHours("Example Club", undefined)).toBeUndefined();
  });

  it("parses a full week of HH:MM-HH:MM ranges", () => {
    const raw = {
      sun: "10:00-20:00",
      mon: "06:00-23:00",
      tue: "06:00-23:00",
      wed: "06:00-23:00",
      thu: "06:00-23:00",
      fri: "06:00-23:00",
      sat: "10:00-20:00",
    };
    expect(parseOperatorHours("Example Club", raw)).toEqual(raw);
  });

  it("keeps an explicit null for a closed day", () => {
    const raw = { mon: "09:00-21:00", sun: null };
    expect(parseOperatorHours("Example Club", raw)).toEqual({
      mon: "09:00-21:00",
      sun: null,
    });
  });

  it("drops an unknown day key with a warning, keeping the valid days", () => {
    const raw = { mon: "09:00-21:00", someday: "09:00-21:00" };
    expect(parseOperatorHours("Example Club", raw as Record<string, unknown>)).toEqual({
      mon: "09:00-21:00",
    });
  });

  it("drops a malformed range string, keeping the valid days", () => {
    const raw = { mon: "09:00-21:00", tue: "9am to 9pm" };
    expect(parseOperatorHours("Example Club", raw)).toEqual({
      mon: "09:00-21:00",
    });
  });

  it("drops a non-string, non-null value", () => {
    const raw = { mon: "09:00-21:00", tue: 123 as unknown as string };
    expect(parseOperatorHours("Example Club", raw)).toEqual({
      mon: "09:00-21:00",
    });
  });

  it("returns undefined (not an empty object) when every day is malformed", () => {
    expect(
      parseOperatorHours("Example Club", { junk: "nope" } as Record<string, unknown>)
    ).toBeUndefined();
  });

  it("returns undefined for a non-object hours block (e.g. an array) without throwing", () => {
    expect(
      parseOperatorHours("Example Club", ["not", "an", "object"] as unknown as Record<
        string,
        unknown
      >)
    ).toBeUndefined();
  });
});

describe("loadOperators — hours block end to end", () => {
  it("parses the real operators.yaml without throwing, and any operator hours block is well-shaped", () => {
    const operators = loadOperators();
    expect(operators.length).toBeGreaterThan(0);

    const withHours = operators.filter((o) => o.hours !== undefined);
    for (const op of withHours) {
      expect(Object.keys(op.hours!).length).toBeGreaterThan(0);
      for (const [day, value] of Object.entries(op.hours!)) {
        expect(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]).toContain(day);
        if (value !== null) {
          expect(value).toMatch(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/);
        }
      }
    }
  });
});
