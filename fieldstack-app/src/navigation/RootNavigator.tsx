import { useOnboarding } from "../lib/onboardingContext";

import { MainNavigator } from "./MainNavigator";
import { OnboardingNavigator } from "./OnboardingNavigator";

/**
 * Picks Onboarding or Main based on the persisted flag. When the user
 * finishes onboarding via `completeOnboarding()` the flag flips and React
 * unmounts the OnboardingNavigator entirely — the back-history can't return
 * to onboarding once the user is past it.
 */
export function RootNavigator() {
  const { isOnboarded } = useOnboarding();
  return isOnboarded ? <MainNavigator /> : <OnboardingNavigator />;
}
