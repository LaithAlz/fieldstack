/**
 * Whether the app should stop showing the native splash and render its tree.
 *
 * Load-bearing for App Store Guideline 2.1: the SAME value must gate both
 * hiding the native splash and rendering the UI. If the two diverge, the splash
 * can linger over an already-mounted app (the "non-interactive splash screen"
 * rejection). The app is ready once onboarding state has resolved AND the font
 * wait has settled, whether the fonts loaded, errored, or timed out.
 *
 * The timed-out case is the one that bit us: fonts that never resolve still let
 * the UI render via the timeout, so the splash must come down then too.
 */
export function computeAppReady(
  onboardingResolved: boolean,
  fontsSettled: boolean,
  fontTimedOut: boolean
): boolean {
  return onboardingResolved && (fontsSettled || fontTimedOut);
}
