/**
 * Concrete analytics providers. Kept in their own file so `analytics.ts`
 * remains a tiny, dependency-free interface — these implementations pull
 * in the PostHog / Sentry SDKs which are heavy.
 *
 * Wiring is env-gated: if the relevant `EXPO_PUBLIC_*` var isn't set, the
 * factory returns null and the caller stays on the console provider. That
 * means dev / CI / preview builds work without external accounts; prod
 * builds opt in by setting the env var at build time.
 */

import * as Sentry from "@sentry/react-native";
import PostHog from "posthog-react-native";

import type { AnalyticsProvider } from "./analytics";

const POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * PostHog-backed provider. Returns null when no API key is set so callers
 * can fall back to the console provider in dev.
 */
export function createPosthogProvider(): AnalyticsProvider | null {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return null;

  const client = new PostHog(apiKey, {
    host: POSTHOG_HOST,
    // Capture lifecycle + screen events automatically. Manual `track`
    // calls layer on top of these for product-specific events.
    captureAppLifecycleEvents: true,
  });

  return {
    track(event, properties) {
      // PostHog's typed properties are stricter (JsonType-only) than our
      // generic `unknown`-valued AnalyticsProperties. The runtime accepts
      // anything JSON-serializable; cast through unknown to satisfy types.
      client.capture(event, properties as unknown as Record<string, never>);
    },
    identify(userId, traits) {
      client.identify(userId, traits as unknown as Record<string, never>);
    },
  };
}

/**
 * Initialize Sentry crash reporting. No-op when the DSN env var is not set,
 * so dev builds don't need a Sentry project. Returns whether init ran.
 */
export function initSentry(): boolean {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    // Enable in production builds only — dev mode would otherwise flood
    // Sentry with red-screen errors and HMR noise.
    enabled: !__DEV__,
    // Modest sample rates so we get a representative slice without
    // burning quota during a usage spike.
    tracesSampleRate: 0.2,
    profilesSampleRate: 0.0,
    attachScreenshot: false,
  });
  return true;
}
