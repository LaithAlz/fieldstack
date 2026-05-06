/**
 * Single emission point for product analytics. Swap the body of `track` when
 * we pick a provider (PostHog / Mixpanel / Amplitude / etc.) — call sites
 * stay the same.
 *
 * Always pass an exported `EVENT_*` constant rather than a string literal:
 * the constants are part of the type union, so typos surface at compile time.
 */

export const EVENT_APP_OPENED = "app_opened";
export const EVENT_VENUE_VIEWED = "venue_viewed";
export const EVENT_FIELD_VIEWED = "field_viewed";
export const EVENT_BOOKING_CTA_TAPPED = "booking_cta_tapped";
export const EVENT_BOOKING_REDIRECT_CONFIRMED = "booking_redirect_confirmed";
export const EVENT_SEARCH_FILTERED = "search_filtered";

export type AnalyticsEvent =
  | typeof EVENT_APP_OPENED
  | typeof EVENT_VENUE_VIEWED
  | typeof EVENT_FIELD_VIEWED
  | typeof EVENT_BOOKING_CTA_TAPPED
  | typeof EVENT_BOOKING_REDIRECT_CONFIRMED
  | typeof EVENT_SEARCH_FILTERED;

export type AnalyticsProperties = Record<string, unknown>;

export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  // v1: dev-only console output. Replace with the chosen provider's call here
  // once we pick one — the surface above stays stable.
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[analytics]", event, properties ?? {});
  }
}
