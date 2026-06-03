/**
 * Tracks whether onboarding is complete and exposes a `completeOnboarding()`
 * action. The RootNavigator reads `isOnboarded` to decide which stack to
 * mount; calling `completeOnboarding()` from any onboarding screen flips the
 * state, persists it, and triggers the navigator switch.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { setOnboardingComplete } from "./storage";

type OnboardingContextValue = {
  isOnboarded: boolean;
  completeOnboarding: () => Promise<void>;
  /** True once the onboarding state has been resolved from storage. */
  hydrated: boolean;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({
  initialIsOnboarded,
  onboardingResolved,
  children,
}: {
  initialIsOnboarded: boolean;
  /** Passed in from App.tsx — true once the storage read for onboarding state has settled. */
  onboardingResolved: boolean;
  children: ReactNode;
}) {
  const [isOnboarded, setIsOnboarded] = useState(initialIsOnboarded);

  const completeOnboarding = useCallback(async () => {
    // Optimistically flip local state so the navigator swap is instant; the
    // storage write happens in parallel and would only "fail" if the device
    // is genuinely out of disk, in which case the next cold start re-runs
    // onboarding — acceptable.
    setIsOnboarded(true);
    await setOnboardingComplete(true);
  }, []);

  return (
    <OnboardingContext.Provider
      value={{ isOnboarded, completeOnboarding, hydrated: onboardingResolved }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  }
  return ctx;
}
