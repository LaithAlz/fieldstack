import { mockedAvailability } from "../availability";

// Pick a deterministic Friday + Saturday in the past so getDay() doesn't drift
// with system date when tests run.
const FRIDAY = new Date(2026, 4, 15); // 2026-05-15 — Friday
const SATURDAY = new Date(2026, 4, 16);
const SUNDAY = new Date(2026, 4, 17);
const MONDAY = new Date(2026, 4, 18);
const TUESDAY = new Date(2026, 4, 19);

describe("mockedAvailability", () => {
  it("always returns 'busy' for Friday 6–10 PM regardless of venue", () => {
    for (const h of [18, 19, 20, 21, 22]) {
      expect(
        mockedAvailability("any-venue", FRIDAY, `${pad(h)}:00`)
      ).toBe("busy");
    }
  });

  it("always returns 'busy' for Saturday 6–10 PM", () => {
    for (const h of [18, 19, 20, 21, 22]) {
      expect(
        mockedAvailability("any-venue", SATURDAY, `${pad(h)}:00`)
      ).toBe("busy");
    }
  });

  it("returns 'open' for Sunday morning", () => {
    expect(mockedAvailability("v1", SUNDAY, "09:00")).toBe("open");
  });

  it("returns 'open' for weekday midday", () => {
    expect(mockedAvailability("v1", MONDAY, "12:00")).toBe("open");
  });

  it("is deterministic for the same inputs", () => {
    const a = mockedAvailability("v1", MONDAY, "18:00");
    const b = mockedAvailability("v1", MONDAY, "18:00");
    expect(a).toBe(b);
  });

  it("differs by venue for weekday peak hours", () => {
    const venues = ["v1", "v2", "v3", "v4", "v5", "v6"];
    const results = venues.map((v) =>
      mockedAvailability(v, TUESDAY, "18:00")
    );
    // At least one open and one busy across 6 venues at peak hour, otherwise
    // the noise function isn't actually noisy.
    expect(results).toContain("open");
    expect(results).toContain("busy");
  });

  it("treats malformed start times as 'open' (defensive)", () => {
    expect(mockedAvailability("v1", MONDAY, "not-a-time")).toBe("open");
  });

  it("returns 'open' for early morning (before peak)", () => {
    expect(mockedAvailability("v1", FRIDAY, "06:00")).toBe("open");
    expect(mockedAvailability("v1", FRIDAY, "10:00")).toBe("open");
  });

  it("returns 'open' for late night (after peak)", () => {
    expect(mockedAvailability("v1", FRIDAY, "23:00")).toBe("open");
  });
});

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
