/**
 * Feature-flag resolution for gating in-progress flows behind a single
 * on/off switch, without a redeploy. Today's only flag is `in_app_booking`
 * (the booking-request flow); more flags register the same way.
 *
 * Resolution order, most specific wins:
 *   1. Local dev override — `EXPO_PUBLIC_FF_IN_APP_BOOKING=1` forces the
 *      flag on regardless of PostHog, so a dev/simulator build can exercise
 *      a new flow before a PostHog project (or the flag inside it) exists.
 *   2. PostHog's live flag value, when a client is configured
 *      (`EXPO_PUBLIC_POSTHOG_KEY` set) — lets us ship OFF by default and
 *      turn it on for a cohort/everyone from the PostHog dashboard, no app
 *      update required.
 *   3. `false` — the safe default. No override, no PostHog key: nothing
 *      changes for anyone.
 *
 * `resolveFlag` is the pure decision (no React, no PostHog import) so the
 * ordering itself is trivially unit-testable. `useFlag` is a thin hook
 * wrapper that also has to be safe when PostHog isn't configured at all
 * (local dev, CI, preview builds without the key) — `useFeatureFlag` from
 * posthog-react-native returns `undefined` and only warns (never throws)
 * when called without a client, which `resolveFlag` treats as "not enabled."
 *
 * `useFeatureFlag` is used directly here (confirmed exported by the
 * installed posthog-react-native version's types — see
 * node_modules/posthog-react-native/dist/hooks/useFeatureFlag.d.ts) rather
 * than falling back to `posthog.isFeatureEnabled` + a manual listener.
 */

import PostHog, { useFeatureFlag as usePostHogFeatureFlag } from "posthog-react-native";

export type FlagName = "in_app_booking";

// Our flag name -> PostHog's dashboard flag key. Identical today, but kept
// as an explicit map so the two vocabularies can diverge without a call-site
// rename.
const POSTHOG_FLAG_KEYS: Record<FlagName, string> = {
  in_app_booking: "in_app_booking",
};

// Per-flag env override var names. A Record (rather than a single constant)
// so a future second flag doesn't have to invent its own ad hoc `useFlag`
// wiring — it just adds a key here.
const DEV_OVERRIDE_ENV_VARS: Record<FlagName, string | undefined> = {
  in_app_booking: process.env.EXPO_PUBLIC_FF_IN_APP_BOOKING,
};

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * Pure three-way resolution. Exported so the ordering is unit-testable
 * without a React render or a real PostHog client — `posthogValue` is
 * whatever `useFeatureFlag` returned (`boolean | string | undefined`;
 * PostHog represents multivariate flags as their variant string, so only an
 * exact `true` counts as "on").
 */
export function resolveFlag(params: {
  devOverride: boolean;
  posthogValue: unknown;
}): boolean {
  if (params.devOverride) return true;
  return params.posthogValue === true;
}

let flagsClient: PostHog | null | undefined; // undefined = not yet resolved

/**
 * Lazily creates a PostHog client dedicated to flag resolution. Kept
 * separate from lib/analyticsProviders.ts's tracking client so this module
 * has no import-order dependency on App.tsx's analytics setup — a screen can
 * call `useFlag` before (or without) analytics ever initializing and still
 * get a correct answer. Returns null when no API key is configured or
 * construction throws; callers must treat null as "PostHog unavailable,"
 * never let it throw up through a render.
 */
function getFlagsClient(): PostHog | null {
  if (flagsClient !== undefined) return flagsClient;
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    flagsClient = null;
    return null;
  }
  try {
    flagsClient = new PostHog(apiKey, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
    });
  } catch {
    flagsClient = null;
  }
  return flagsClient;
}

/** Test-only escape hatch — clears the memoized client between specs. */
export function __resetFlagsClientForTests(): void {
  flagsClient = undefined;
}

export function useFlag(name: FlagName): boolean {
  const devOverride = DEV_OVERRIDE_ENV_VARS[name] === "1";
  const client = getFlagsClient() ?? undefined;
  // Hooks run unconditionally on every render (rules of hooks) even when the
  // dev override already decided the answer — cheap, and keeps this a
  // regular hook other consumers can rely on.
  const posthogValue = usePostHogFeatureFlag(POSTHOG_FLAG_KEYS[name], client);
  return resolveFlag({ devOverride, posthogValue });
}
