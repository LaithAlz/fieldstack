import { describe, expect, it } from "bun:test";

import { normalizeGoogleHours } from "../src/lib/googleHours.js";

describe("normalizeGoogleHours", () => {
  it("returns null for empty / missing input", () => {
    expect(normalizeGoogleHours(null)).toBeNull();
    expect(normalizeGoogleHours(undefined)).toBeNull();
    expect(normalizeGoogleHours({ periods: [] })).toBeNull();
  });

  it("maps a normal weekday period (Mon 9:00-22:00)", () => {
    const out = normalizeGoogleHours({
      periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } }],
    });
    expect(out?.mon).toBe("09:00-22:00");
    expect(out?.tue).toBeNull();
  });

  it("writes a midnight close as 24:00 (same-day close at 0:00 => crosses, capped)", () => {
    // Google models 'closes at midnight' as close.day = next day, hour 0.
    const out = normalizeGoogleHours({
      periods: [{ open: { day: 5, hour: 10, minute: 0 }, close: { day: 6, hour: 0, minute: 0 } }],
    });
    expect(out?.fri).toBe("10:00-24:00");
  });

  it("handles 24/7 (single open period, no close, Sunday 00:00)", () => {
    const out = normalizeGoogleHours({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] });
    for (const d of ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]) {
      expect(out?.[d]).toBe("00:00-24:00");
    }
  });

  it("collapses multiple periods on one day to the widest span", () => {
    const out = normalizeGoogleHours({
      periods: [
        { open: { day: 2, hour: 8, minute: 0 }, close: { day: 2, hour: 12, minute: 0 } },
        { open: { day: 2, hour: 17, minute: 0 }, close: { day: 2, hour: 23, minute: 0 } },
      ],
    });
    expect(out?.tue).toBe("08:00-23:00");
  });

  it("skips invalid/inverted periods, keeps valid ones", () => {
    const out = normalizeGoogleHours({
      periods: [
        { open: { day: 3, hour: 20, minute: 0 }, close: { day: 3, hour: 8, minute: 0 } }, // inverted -> dropped
        { open: { day: 4, hour: 6, minute: 30 }, close: { day: 4, hour: 23, minute: 30 } },
      ],
    });
    expect(out?.wed).toBeNull();
    expect(out?.thu).toBe("06:30-23:30");
  });

  it("output is compatible with the app's parser (open < close <= 24:00)", () => {
    const out = normalizeGoogleHours({
      periods: [{ open: { day: 1, hour: 9 }, close: { day: 2, hour: 0 } }],
    })!;
    for (const v of Object.values(out)) {
      if (v === null) continue;
      const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(v)!;
      const open = +m[1] * 60 + +m[2];
      const close = +m[3] * 60 + +m[4];
      expect(close).toBeGreaterThan(open);
      expect(close).toBeLessThanOrEqual(24 * 60);
    }
  });
});
