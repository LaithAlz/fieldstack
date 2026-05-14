import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ToastProvider } from "./src/components/Toast";
import { EVENT_APP_OPENED, track } from "./src/lib/analytics";
import { AuthProvider, useAuth } from "./src/lib/auth";
import {
  BookingHistoryProvider,
  useBookingHistory,
} from "./src/lib/bookingHistory";
import { initNotifications } from "./src/lib/notifications";
import { OnboardingProvider } from "./src/lib/onboardingContext";
import {
  PreferredSlotProvider,
  usePreferredSlot,
} from "./src/lib/preferredSlot";
import {
  RecentlyViewedProvider,
  useRecentlyViewed,
} from "./src/lib/recentlyViewed";
import { SavedVenuesProvider, useSavedVenues } from "./src/lib/savedVenues";
import { getOnboardingComplete } from "./src/lib/storage";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { colors } from "./src/theme/tokens";

// Hold the splash open while we decide which stack to mount. REQ-F1.1 caps
// this at 2s — if the storage read somehow hangs, the timeout race lets the
// splash come down anyway and the user lands on Welcome (the safer default).
SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op: already hidden, fine */
});

const SPLASH_CAP_MS = 2000;

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
  const scheme = useColorScheme();

  // Inter — fall back to system font during the brief load. If the font fetch
  // fails (cold install + no network), `fontError` becomes non-null and we
  // open the gate anyway so the app isn't stranded on the splash.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const fontsGateOpen = fontsLoaded || fontError !== null;

  useEffect(() => {
    track(EVENT_APP_OPENED);
    initNotifications();
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

  // Keep the native splash up until both gates are open. SplashScreen.hideAsync
  // can reject if already hidden — swallow.
  useEffect(() => {
    if (isReady && fontsGateOpen) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isReady, fontsGateOpen]);

  // Hard timeout on the font wait — if neither loaded nor errored within the
  // splash cap, fall back to system font rather than orphaning the splash.
  useEffect(() => {
    if (fontsGateOpen) return;
    const id = setTimeout(() => setFontTimeoutHit(true), SPLASH_CAP_MS);
    return () => clearTimeout(id);
  }, [fontsGateOpen]);

  if (!isReady || (!fontsGateOpen && !fontTimeoutHit)) {
    return null;
  }

  // Map our brand tokens into React Navigation's theme so default headers,
  // backgrounds, and back-button tints come from the same palette.
  const navTheme = scheme === "dark"
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: colors.dark.brand,
          background: colors.dark.surface,
          card: colors.dark.surface,
          text: colors.dark.textPrimary,
          border: colors.dark.border,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.light.brand,
          background: colors.light.surface,
          card: colors.light.surface,
          text: colors.light.textPrimary,
          border: colors.light.border,
        },
      };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* ErrorBoundary sits inside SafeAreaProvider (so the fallback
            respects notches) but outside everything else, so any crash in
            providers / nav / screens lands on the friendly screen instead
            of a white blank. */}
        <ErrorBoundary>
          <BottomSheetModalProvider>
            <ToastProvider>
              <AuthProvider>
                <OnboardingProvider initialIsOnboarded={initialIsOnboarded}>
                  <PreferredSlotProvider>
                    <SavedVenuesProvider>
                      <BookingHistoryProvider>
                        <RecentlyViewedProvider>
                          {/* Hold render until persisted state has hydrated,
                              so deep links don't see empty defaults. */}
                          <PersistenceGate>
                            <NavigationContainer theme={navTheme}>
                              <RootNavigator />
                            </NavigationContainer>
                            <StatusBar style="auto" />
                          </PersistenceGate>
                        </RecentlyViewedProvider>
                      </BookingHistoryProvider>
                    </SavedVenuesProvider>
                  </PreferredSlotProvider>
                </OnboardingProvider>
              </AuthProvider>
            </ToastProvider>
          </BottomSheetModalProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function PersistenceGate({ children }: { children: React.ReactNode }) {
  const { hydrated: slotHydrated } = usePreferredSlot();
  const { hydrated: savedHydrated } = useSavedVenues();
  const { hydrated: historyHydrated } = useBookingHistory();
  const { hydrated: recentHydrated } = useRecentlyViewed();
  const { hydrated: authHydrated } = useAuth();
  if (
    !slotHydrated ||
    !savedHydrated ||
    !historyHydrated ||
    !recentHydrated ||
    !authHydrated
  ) {
    return null;
  }
  return <>{children}</>;
}
