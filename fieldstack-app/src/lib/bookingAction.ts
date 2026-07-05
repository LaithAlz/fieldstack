/**
 * Decides what a tap on the reserve bar's primary action should do, given
 * the `in_app_booking` flag and whether the user is signed in. Pulled out of
 * VenueDetailScreen/FieldDetailScreen as a pure function so the single most
 * important invariant here — flag OFF always means the unchanged operator
 * redirect, for every signed-in state — is a plain unit test, not something
 * that only shows up correct by inspecting two screens' JSX.
 */

export type BookingAction =
  // Flag OFF: byte-identical to the pre-flag behavior. Never branches on
  // auth state — a guest and a signed-in user get exactly the same redirect.
  | { type: "redirect" }
  // Flag ON, guest: route to the existing sign-in screen. Never traps the
  // user on a dead end; they land back here able to try again once signed in.
  | { type: "sign_in" }
  // Flag ON, signed in: open the in-app booking request sheet.
  | { type: "request" };

export function resolveBookingAction(params: {
  flagOn: boolean;
  signedIn: boolean;
}): BookingAction {
  if (!params.flagOn) return { type: "redirect" };
  if (!params.signedIn) return { type: "sign_in" };
  return { type: "request" };
}

/** Reserve bar's primary-action label. Only changes when the flag is on. */
export function reserveBarActionLabel(flagOn: boolean): string {
  return flagOn ? "Request to book" : "Book";
}
