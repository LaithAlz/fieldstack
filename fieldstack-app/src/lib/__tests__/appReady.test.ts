import { computeAppReady } from "../appReady";

describe("computeAppReady", () => {
  it("stays false until onboarding state has resolved", () => {
    expect(computeAppReady(false, true, true)).toBe(false);
  });

  it("is ready once the fonts have settled", () => {
    expect(computeAppReady(true, true, false)).toBe(true);
  });

  it("is ready when the font wait times out (the stuck-splash case)", () => {
    // Fonts never settled, but the timeout fired. The UI renders with system
    // fonts, so the splash MUST come down too. Before the fix the splash was
    // hidden only when fonts settled, leaving it stuck over the mounted app.
    expect(computeAppReady(true, false, true)).toBe(true);
  });

  it("stays false while still waiting on fonts with no timeout yet", () => {
    expect(computeAppReady(true, false, false)).toBe(false);
  });
});
