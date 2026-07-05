import { getDayHours, isOpenNow } from "../venueHours";

const SUN = new Date(2026, 4, 17); // 2026-05-17 — Sunday
const MON = new Date(2026, 4, 18);
const FRI = new Date(2026, 4, 22);

describe("getDayHours", () => {
  it("returns null when hours is null / undefined", () => {
    expect(getDayHours(null, MON)).toBeNull();
    expect(getDayHours(undefined, MON)).toBeNull();
  });

  it("returns null when the day key is missing", () => {
    expect(getDayHours({ tue: "06:00-22:00" }, MON)).toBeNull();
  });

  it("returns null when the day is explicitly closed", () => {
    expect(getDayHours({ sun: null }, SUN)).toBeNull();
  });

  it("parses a well-formed range", () => {
    expect(getDayHours({ mon: "06:00-23:00" }, MON)).toEqual({
      openMinutes: 6 * 60,
      closeMinutes: 23 * 60,
    });
  });

  it("tolerates whitespace", () => {
    expect(getDayHours({ fri: " 09:00 - 22:30 " }, FRI)).toEqual({
      openMinutes: 9 * 60,
      closeMinutes: 22 * 60 + 30,
    });
  });

  it("rejects malformed strings", () => {
    expect(getDayHours({ mon: "open" }, MON)).toBeNull();
    expect(getDayHours({ mon: "06-23" }, MON)).toBeNull();
    expect(getDayHours({ mon: "06:00-" }, MON)).toBeNull();
  });

  it("rejects ranges where close <= open", () => {
    expect(getDayHours({ mon: "10:00-10:00" }, MON)).toBeNull();
    expect(getDayHours({ mon: "22:00-06:00" }, MON)).toBeNull();
  });

  it("rejects out-of-range times", () => {
    expect(getDayHours({ mon: "06:00-25:00" }, MON)).toBeNull();
  });
});

describe("isOpenNow", () => {
  it("is open inside a well-formed range", () => {
    const noonMon = new Date(2026, 4, 18, 12, 0);
    expect(isOpenNow({ mon: "06:00-23:00" }, noonMon)).toBe(true);
  });

  it("is closed before opening and at/after closing", () => {
    const earlyMon = new Date(2026, 4, 18, 5, 59);
    const closingMon = new Date(2026, 4, 18, 23, 0);
    expect(isOpenNow({ mon: "06:00-23:00" }, earlyMon)).toBe(false);
    expect(isOpenNow({ mon: "06:00-23:00" }, closingMon)).toBe(false);
  });

  it("falls back to the 6 AM–11 PM default when hours data is missing", () => {
    const daytime = new Date(2026, 4, 18, 14, 0);
    const middleOfNight = new Date(2026, 4, 18, 3, 0);
    expect(isOpenNow(null, daytime)).toBe(true);
    expect(isOpenNow(undefined, daytime)).toBe(true);
    expect(isOpenNow(null, middleOfNight)).toBe(false);
  });

  it("falls back to the default when today's entry is malformed or explicitly closed", () => {
    const daytime = new Date(2026, 4, 17, 14, 0); // Sunday
    expect(isOpenNow({ sun: null }, daytime)).toBe(true);
    expect(isOpenNow({ sun: "not-a-range" }, daytime)).toBe(true);
  });
});
