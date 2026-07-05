import { reserveBarActionLabel, resolveBookingAction } from "../bookingAction";

describe("resolveBookingAction", () => {
  // The regression this spec cares about most: flag OFF must be the
  // unchanged operator redirect, unconditionally — not just for one auth
  // state. Both branches below must agree.
  it("flag OFF + signed in -> redirect (unchanged current behavior)", () => {
    expect(resolveBookingAction({ flagOn: false, signedIn: true })).toEqual({
      type: "redirect",
    });
  });

  it("flag OFF + signed out -> redirect (unchanged current behavior)", () => {
    expect(resolveBookingAction({ flagOn: false, signedIn: false })).toEqual({
      type: "redirect",
    });
  });

  it("flag ON + signed out -> sign_in", () => {
    expect(resolveBookingAction({ flagOn: true, signedIn: false })).toEqual({
      type: "sign_in",
    });
  });

  it("flag ON + signed in -> request", () => {
    expect(resolveBookingAction({ flagOn: true, signedIn: true })).toEqual({
      type: "request",
    });
  });
});

describe("reserveBarActionLabel", () => {
  it("stays \"Book\" when the flag is off (unchanged current copy)", () => {
    expect(reserveBarActionLabel(false)).toBe("Book");
  });

  it("switches to \"Request to book\" when the flag is on", () => {
    expect(reserveBarActionLabel(true)).toBe("Request to book");
  });
});
