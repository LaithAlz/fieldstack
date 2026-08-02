import { hasUsableHours } from "../useResolvedVenueHours";

describe("hasUsableHours", () => {
  it("true when at least one weekday has a range", () => {
    expect(hasUsableHours({ mon: "09:00-22:00" })).toBe(true);
    expect(hasUsableHours({ mon: null, tue: "06:00-23:00" })).toBe(true);
  });

  it("false for null/undefined/empty/all-closed", () => {
    expect(hasUsableHours(null)).toBe(false);
    expect(hasUsableHours(undefined)).toBe(false);
    expect(hasUsableHours({})).toBe(false);
    expect(hasUsableHours({ mon: null, tue: null })).toBe(false);
  });
});
