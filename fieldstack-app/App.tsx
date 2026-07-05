import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from "@expo-google-fonts/barlow-condensed";
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
} from "@expo-google-fonts/figtree";
import { createNavigationContainerRef, NavigationContainer, DefaultTheme, DarkTheme, type LinkingOptions } from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ToastProvider } from "./src/components/Toast";
import {
  EVENT_APP_OPENED,
  setAnalyticsProvider,
  track,
} from "./src/lib/analytics";
import {
  createPosthogProvider,
  initSentry,
} from "./src/lib/analyticsProviders";
import { AuthProvider, useAuth } from "./src/lib/auth";
import { BlockedUsersProvider, useBlockedUsers } from "./src/lib/blockedUsers";
import {
  BookingHistoryProvider,
  useBookingHistory,
} from "./src/lib/bookingHistory";
import { initNotifications } from "./src/lib/notifications";
import { initReviewPrompt } from "./src/lib/reviewPrompt";
import { initSessionTracking, onScreenChange } from "./src/lib/sessionTracking";
import { OnboardingProvider, useOnboarding } from "./src/lib/onboardingContext";
import {
  PreferredSlotProvider,
  usePreferredSlot,
} from "./src/lib/preferredSlot";
import {
  RecentlyViewedProvider,
  useRecentlyViewed,
} from "./src/lib/recentlyViewed";
import { SavedVenuesProvider, useSavedVenues } from "./src/lib/savedVenues";
import { computeAppReady } from "./src/lib/appReady";
import { getOnboardingComplete } from "./src/lib/storage";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider, useTheme, useThemePreference } from "./src/theme/useTheme";

// Hold the splash open while we decide which stack to mount. REQ-F1.1 caps
// this at 2s — if the storage read somehow hangs, the timeout race lets the
// splash come down anyway and the user lands on Welcome (the safer default).
SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op: already hidden, fine */
});

// Crash reporting + analytics, env-gated so dev/preview builds without these
// secrets still work. Sentry init runs once at module load (must run before any
// UI for capture to work). Wrapped because this runs at import time: a throwing
// SDK init would crash the whole app before React ever mounts (App Store 2.1).
// Analytics is best-effort, so a failure here must not stop the app from
// starting.
try {
  initSentry();
  const posthogProvider = createPosthogProvider();
  if (posthogProvider) setAnalyticsProvider(posthogProvider);
} catch (err) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn("[startup] analytics init failed", err);
  }
}

// Navigation ref used outside the component tree (e.g. RecoveryRedirectHandler)
// to imperatively navigate as soon as the container is ready.
const navRef = createNavigationContainerRef();

const SPLASH_CAP_MS = 2000;

// Hard safety net for App Store Guideline 2.1: never let the native splash
// linger. If the readiness gates below somehow never resolve on a given
// device/OS, force the splash down shortly after the cap so the user always
// reaches an interactive screen. Hiding an already-hidden splash is a no-op.
setTimeout(() => {
  SplashScreen.hideAsync().catch(() => undefined);
}, SPLASH_CAP_MS + 1500);

// Deep-link / universal-link routing table. The scheme comes from app.json
// (`"scheme": "onside"`). Each path maps onto the registered screen names
// in MainNavigator.tsx — `ExploreTab` and `MeTab` are the bottom-tab names.
const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: ["onside://"],
  config: {
    screens: {
      ExploreTab: {
        screens: {
          VenueDetail: "venue/:venueId",
          FieldDetail: "venue/:venueId/field/:fieldId",
        },
      },
      MeTab: {
        screens: {
          SetNewPassword: "set-new-password",
        },
      },
    },
  },
};

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialIsOnboarded, setInitialIsOnboarded] = useState(false);
  const [fontTimeoutHit, setFontTimeoutHit] = useState(false);

  // Figtree (body) + Barlow Condensed (display) — fall back to system font
  // during the brief load. If the font fetch fails (cold install + no
  // network), `fontError` becomes non-null and we open the gate anyway so
  // the app isn't stranded on the splash.
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });
  const fontsGateOpen = fontsLoaded || fontError !== null;

  // Single readiness flag that drives BOTH hiding the native splash and
  // rendering the tree, so the two can never diverge. If the splash were hidden
  // on a different condition than the one that renders the UI, the splash could
  // stay up over a mounted app (the stuck-splash bug). Ready means onboarding
  // state has resolved and the font wait has settled (loaded, errored, or
  // timed out).
  const appReady = computeAppReady(isReady, fontsGateOpen, fontTimeoutHit);

  useEffect(() => {
    // Best-effort startup side effects, guarded so a throw can't block the
    // readiness path below (which would strand the app the way the splash bug
    // did). Analytics and notification setup are non-fatal.
    try {
      track(EVENT_APP_OPENED);
      initSessionTracking();
      initNotifications();
      initReviewPrompt();
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[startup] non-fatal init failed", err);
      }
    }

    let cancelled = false;
    (async () => {
      const onboarded = await withTimeout(getOnboardingComplete(), SPLASH_CAP_MS, false);
      if (cancelled) return;
      setInitialIsOnboarded(onboarded);
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hide the native splash exactly when we begin rendering the tree (appReady),
  // so the hide condition and the render condition can never disagree.
  // hideAsync can reject if already hidden, so swallow.
  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [appReady]);

  // Hard timeout on the font wait — if neither loaded nor errored within the
  // splash cap, fall back to system font rather than orphaning the splash.
  useEffect(() => {
    if (fontsGateOpen) return;
    const id = setTimeout(() => setFontTimeoutHit(true), SPLASH_CAP_MS);
    return () => clearTimeout(id);
  }, [fontsGateOpen]);

  if (!appReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* ErrorBoundary sits inside SafeAreaProvider (so the fallback
            respects notches) but outside everything else, so any crash in
            providers / nav / screens lands on the friendly screen instead
            of a white blank. ThemeProvider sits inside it too — the fallback
            deliberately avoids useTheme() (see ErrorBoundary), so a crash in
            the theme layer itself still lands on the friendly screen instead
            of re-throwing. */}
        <ErrorBoundary>
          <ThemeProvider>
            <BottomSheetModalProvider>
              <ToastProvider>
                <AuthProvider>
                  <OnboardingProvider initialIsOnboarded={initialIsOnboarded} onboardingResolved={isReady}>
                    <PreferredSlotProvider>
                      <SavedVenuesProvider>
                        <BookingHistoryProvider>
                          <RecentlyViewedProvider>
                            <BlockedUsersProvider>
                              {/* Hold render until persisted state has hydrated,
                                  so deep links don't see empty defaults. */}
                              <PersistenceGate>
                                <NavigationRoot />
                              </PersistenceGate>
                            </BlockedUsersProvider>
                          </RecentlyViewedProvider>
                        </BookingHistoryProvider>
                      </SavedVenuesProvider>
                    </PreferredSlotProvider>
                  </OnboardingProvider>
                </AuthProvider>
              </ToastProvider>
            </BottomSheetModalProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Navigation tree + status bar, split out from App() so it can call
 * useTheme()/useThemePreference() (which require a <ThemeProvider> ancestor)
 * to follow the active color scheme instead of hardcoding light.
 */
function NavigationRoot() {
  const themeColors = useTheme();
  const { active } = useThemePreference();

  // Map our brand tokens into React Navigation's theme so default headers,
  // backgrounds, and back-button tints come from the same palette, on top of
  // the matching nav theme base (fonts, misc chrome) for the active scheme.
  const navTheme = {
    ...(active === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(active === "dark" ? DarkTheme : DefaultTheme).colors,
      primary: themeColors.brand,
      background: themeColors.surface,
      card: themeColors.surface,
      text: themeColors.textPrimary,
      border: themeColors.border,
    },
  };

  return (
    <>
      <NavigationContainer
        ref={navRef}
        theme={navTheme}
        linking={linking}
        // Churn instrumentation: report every route transition (deduped
        // inside onScreenChange) so exit events know which screen the user
        // left from.
        // Cast: navRef has no RootParamList generic, so getCurrentRoute()
        // types as never. Runtime shape is always { name: string } when a
        // route exists.
        onReady={() =>
          onScreenChange((navRef.getCurrentRoute() as { name?: string } | undefined)?.name)
        }
        onStateChange={() =>
          onScreenChange((navRef.getCurrentRoute() as { name?: string } | undefined)?.name)
        }
      >
        <RootNavigator />
        {/* Fires as soon as the nav container is ready so a cold-start from
            a recovery deep link redirects to SetNewPassword immediately,
            even if the user lands on the Explore tab rather than the Me
            tab. */}
        <RecoveryRedirectHandler />
      </NavigationContainer>
      <StatusBar style={active === "dark" ? "light" : "dark"} />
    </>
  );
}

/**
 * Eagerly redirects to SetNewPassword when a password-recovery deep link
 * opens the app. Mounting this inside NavigationContainer (but outside
 * RootNavigator) gives it both auth context access (via useAuth, which
 * resolves through the AuthProvider higher in the tree) and a ready nav
 * container. This fixes the latency bug where ProfileScreen's useEffect
 * would only fire after the user manually tapped the Me tab.
 */
function RecoveryRedirectHandler() {
  const { pendingRecovery, clearPendingRecovery } = useAuth();

  useEffect(() => {
    if (!pendingRecovery) return;
    if (!navRef.isReady()) return;
    clearPendingRecovery();
    // Type-cast needed because navRef is untyped (no RootParamList generic);
    // the runtime route is correct — MeTab > SetNewPassword exists in the tree.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navRef as any).navigate("MeTab", { screen: "SetNewPassword" });
  }, [pendingRecovery, clearPendingRecovery]);

  return null;
}

function PersistenceGate({ children }: { children: React.ReactNode }) {
  const { hydrated: slotHydrated } = usePreferredSlot();
  const { hydrated: savedHydrated } = useSavedVenues();
  const { hydrated: historyHydrated } = useBookingHistory();
  const { hydrated: recentHydrated } = useRecentlyViewed();
  const { hydrated: authHydrated } = useAuth();
  const { hydrated: blockedHydrated } = useBlockedUsers();
  const { hydrated: onboardingHydrated } = useOnboarding();
  // Theme hydration too — otherwise the first frame can render in the
  // "system" default scheme for one tick before snapping to the user's
  // persisted light/dark choice (the cold-start flash this gate exists to
  // prevent for every other piece of persisted state).
  const { hydrated: themeHydrated } = useThemePreference();
  if (
    !slotHydrated ||
    !savedHydrated ||
    !historyHydrated ||
    !recentHydrated ||
    !authHydrated ||
    !blockedHydrated ||
    !onboardingHydrated ||
    !themeHydrated
  ) {
    return null;
  }
  return <>{children}</>;
}
