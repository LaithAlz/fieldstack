import {
  formatDurationHours,
  formatEndTime,
  formatTime12h,
} from "../datetime";

describe("formatTime12h", () => {
  it("converts midnight", () => {
    expect(formatTime12h("00:00")).toBe("12:00 AM");
  });

  it("converts noon", () => {
    expect(formatTime12h("12:00")).toBe("12:00 PM");
  });

  it("converts a morning hour with minutes", () => {
    expect(formatTime12h("09:30")).toBe("9:30 AM");
  });

  it("converts an evening hour", () => {
    expect(formatTime12h("19:00")).toBe("7:00 PM");
  });

  it("converts 11 PM", () => {
    expect(formatTime12h("23:00")).toBe("11:00 PM");
  });
});

describe("formatEndTime", () => {
  it("adds whole hours", () => {
    expect(formatEndTime("19:00", 1)).toBe("8:00 PM");
    expect(formatEndTime("19:00", 2)).toBe("9:00 PM");
  });

  it("adds fractional hours", () => {
    expect(formatEndTime("19:00", 1.5)).toBe("8:30 PM");
    expect(formatEndTime("19:30", 1.5)).toBe("9:00 PM");
  });

  it("wraps past midnight as 12h time", () => {
    // 23:00 + 2h = 01:00 next day → "1:00 AM"
    expect(formatEndTime("23:00", 2)).toBe("1:00 AM");
  });

  it("crosses noon", () => {
    expect(formatEndTime("11:00", 2)).toBe("1:00 PM");
  });
});

describe("formatDurationHours", () => {
  it("singularizes one hour", () => {
    expect(formatDurationHours(1)).toBe("1 hour");
  });

  it("pluralizes any other value", () => {
    expect(formatDurationHours(1.5)).toBe("1.5 hours");
    expect(formatDurationHours(2)).toBe("2 hours");
    expect(formatDurationHours(3)).toBe("3 hours");
  });
});
