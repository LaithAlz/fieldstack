/**
 * Churn / exit instrumentation (#307).
 *
 * Answers the questions the funnel events can't: when do users leave, from
 * which screen, and after how long? Three signals:
 *
 *   - `screen_viewed`   — every navigation transition, with the previous
 *                         screen, so PostHog can build path / drop-off
 *                         funnels per screen.
 *   - `app_backgrounded`— the exit moment: session length, the screen the
 *                         user left from (the churn point), and how many
 *                         screens they saw this session.
 *   - `app_foregrounded`— the return: how long they were away. Away longer
 *                         than SESSION_GAP_MS counts as a new session.
 *
 * Wire-up lives in App.tsx: `initSessionTracking()` once at startup, and
 * `onNavigationStateChange()` from the NavigationContainer callbacks.
 */

import { AppState, type AppStateStatus } from "react-native";

import {
  EVENT_APP_BACKGROUNDED,
  EVENT_APP_FOREGROUNDED,
  EVENT_SCREEN_VIEWED,
  track,
} from "./analytics";

/** Away longer than this and the next foreground starts a fresh session. */
const SESSION_GAP_MS = 30 * 60 * 1000;

type SessionState = {
  sessionStartedAt: number;
  currentScreen: string | null;
  screensViewed: number;
  backgroundedAt: number | null;
  /** Last observed AppState — collapses iOS's active→inactive→background chain. */
  wasActive: boolean;
};

const state: SessionState = {
  sessionStartedAt: Date.now(),
  currentScreen: null,
  screensViewed: 0,
  backgroundedAt: null,
  wasActive: true,
};

/**
 * Record a navigation transition. Deduped — pan/param changes that re-report
 * the same route name don't emit. Called from App.tsx's NavigationContainer
 * onReady/onStateChange.
 */
export function onScreenChange(screenName: string | undefined, now = Date.now()): void {
  if (!screenName || screenName === state.currentScreen) return;
  const previous = state.currentScreen;
  state.currentScreen = screenName;
  state.screensViewed += 1;
  track(EVENT_SCREEN_VIEWED, {
    screen: screenName,
    previous_screen: previous,
    session_seconds: Math.round((now - state.sessionStartedAt) / 1000),
  });
}

/**
 * AppState transition handler. Exported for tests; production code reaches
 * it through `initSessionTracking()`.
 */
export function handleAppStateChange(next: AppStateStatus, now = Date.now()): void {
  const isActive = next === "active";

  if (state.wasActive && !isActive) {
    // Exit moment — this is the churn datapoint.
    state.wasActive = false;
    state.backgroundedAt = now;
    track(EVENT_APP_BACKGROUNDED, {
      session_seconds: Math.round((now - state.sessionStartedAt) / 1000),
      last_screen: state.currentScreen,
      screens_viewed: state.screensViewed,
    });
    return;
  }

  if (!state.wasActive && isActive) {
    state.wasActive = true;
    const awayMs = state.backgroundedAt !== null ? now - state.backgroundedAt : 0;
    const newSession = awayMs >= SESSION_GAP_MS;
    track(EVENT_APP_FOREGROUNDED, {
      away_seconds: Math.round(awayMs / 1000),
      new_session: newSession,
      last_screen: state.currentScreen,
    });
    if (newSession) {
      state.sessionStartedAt = now;
      state.screensViewed = 0;
    }
    state.backgroundedAt = null;
  }
}

/**
 * Subscribe to AppState. Call once at startup; returns the unsubscribe for
 * symmetry, though App-level wiring never tears it down.
 */
export function initSessionTracking(): () => void {
  state.sessionStartedAt = Date.now();
  const sub = AppState.addEventListener("change", (next) => handleAppStateChange(next));
  return () => sub.remove();
}

/** Test-only: reset module state between specs. */
export function resetSessionTrackingForTests(now = Date.now()): void {
  state.sessionStartedAt = now;
  state.currentScreen = null;
  state.screensViewed = 0;
  state.backgroundedAt = null;
  state.wasActive = true;
}
