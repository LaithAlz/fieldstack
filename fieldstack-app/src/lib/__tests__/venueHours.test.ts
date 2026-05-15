import { getDayHours } from "../venueHours";

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
