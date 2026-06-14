/**
 * Single emission point for product analytics. Call sites use `track(...)`
 * with a typed `EVENT_*` constant; the call routes through a swappable
 * `AnalyticsProvider`, so dropping in PostHog / Mixpanel / Amplitude later
 * is one wire-up in `App.tsx`, not a screen-by-screen rewrite.
 *
 * `EVENT_*` constants stay the source of truth — typo'd event names won't
 * compile.
 */

export const EVENT_APP_OPENED = "app_opened";
export const EVENT_VENUE_VIEWED = "venue_viewed";
export const EVENT_FIELD_VIEWED = "field_viewed";
export const EVENT_BOOKING_CTA_TAPPED = "booking_cta_tapped";
export const EVENT_BOOKING_REDIRECT_CONFIRMED = "booking_redirect_confirmed";
export const EVENT_SEARCH_FILTERED = "search_filtered";
// Churn / exit instrumentation — where and when users leave (#307).
export const EVENT_SCREEN_VIEWED = "screen_viewed";
export const EVENT_APP_BACKGROUNDED = "app_backgrounded";
export const EVENT_APP_FOREGROUNDED = "app_foregrounded";

export type AnalyticsEvent =
  | typeof EVENT_APP_OPENED
  | typeof EVENT_VENUE_VIEWED
  | typeof EVENT_FIELD_VIEWED
  | typeof EVENT_BOOKING_CTA_TAPPED
  | typeof EVENT_BOOKING_REDIRECT_CONFIRMED
  | typeof EVENT_SEARCH_FILTERED
  | typeof EVENT_SCREEN_VIEWED
  | typeof EVENT_APP_BACKGROUNDED
  | typeof EVENT_APP_FOREGROUNDED;

export type AnalyticsProperties = Record<string, unknown>;

/**
 * Provider contract. Implementations sit between the app and whichever
 * vendor SDK you're using. Failures inside a provider are swallowed by
 * `track()` — analytics must never crash the app.
 */
export type AnalyticsProvider = {
  track(event: AnalyticsEvent, properties?: AnalyticsProperties): void;
  /** Optional — only providers that distinguish users implement this. */
  identify?(userId: string, traits?: AnalyticsProperties): void;
  /**
   * Optional — clear the identified user so later events aren't attributed
   * to them. Called on sign-out.
   */
  reset?(): void;
};

/** Built-in dev-time logger. Production builds emit nothing by default. */
export const consoleProvider: AnalyticsProvider = {
  track(event, properties) {
    if (__DEV__) {
       
      console.log("[analytics]", event, properties ?? {});
    }
  },
};

let currentProvider: AnalyticsProvider = consoleProvider;

/**
 * Swap the provider once, ideally during app startup. Events that fire
 * before the swap go to whichever provider was active at that moment, so
 * register early (before the first screen mounts) for full coverage.
 */
export function setAnalyticsProvider(provider: AnalyticsProvider): void {
  currentProvider = provider;
}

/**
 * Restore the default console provider. Module-level provider state would
 * otherwise leak between Jest specs that swap in mocks.
 */
export function resetAnalyticsProvider(): void {
  currentProvider = consoleProvider;
}

export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  try {
    currentProvider.track(event, properties);
  } catch (err) {
    // Analytics must never crash callers. Surface to the dev console so a
    // faulty provider is at least visible during development.
    if (__DEV__) {
       
      console.warn("[analytics] provider.track threw", err);
    }
  }
}

export function identify(userId: string, traits?: AnalyticsProperties): void {
  try {
    currentProvider.identify?.(userId, traits);
  } catch (err) {
    if (__DEV__) {

      console.warn("[analytics] provider.identify threw", err);
    }
  }
}

/** Clear the identified user (sign-out). No-op on providers without reset. */
export function reset(): void {
  try {
    currentProvider.reset?.();
  } catch (err) {
    if (__DEV__) {

      console.warn("[analytics] provider.reset threw", err);
    }
  }
}
