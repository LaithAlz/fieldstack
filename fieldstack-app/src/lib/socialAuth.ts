/**
 * Social / OAuth sign-in (Google via web, Apple via native), layered on the
 * same supabase-js client the email flow uses. Each function resolves to the
 * shared `{ ok, error }` shape so the SignIn screen handles them identically
 * to email sign-in.
 *
 * Neither provider works until it's configured in the Supabase dashboard
 * (Authentication → Providers) and, for Google, the app's redirect URL
 * (`onside://`) is added to the allow-list. Until then the calls return a
 * clean, presentable error instead of throwing.
 */

import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { supabase } from "./supabase";

// Finish any auth session that was pending when the app was backgrounded —
// recommended once at module load by expo-web-browser.
WebBrowser.maybeCompleteAuthSession();

export type SocialResult = {
  ok: boolean;
  /** User-presentable message when `ok` is false; null on success or cancel. */
  error: string | null;
  /** True when the user backed out — callers stay silent rather than toast. */
  cancelled?: boolean;
};

/**
 * Pull the implicit-flow tokens out of an OAuth redirect URL. Supabase (with
 * the default implicit flow) returns them in the URL fragment:
 * `onside://#access_token=…&refresh_token=…`. Exported for tests.
 */
export function parseTokensFromRedirect(
  url: string
): { access_token: string; refresh_token: string } | null {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

/**
 * Continue with Google. Opens the Supabase-hosted OAuth URL in an in-app
 * browser session, then exchanges the returned tokens for a session. Works on
 * every platform (it's a web flow), so the button can always show.
 */
export async function signInWithGoogle(): Promise<SocialResult> {
  const redirectTo = Linking.createURL("/");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data?.url) {
    return { ok: false, error: presentProviderError(error?.message, "Google") };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === "cancel" || result.type === "dismiss") {
    return { ok: false, error: null, cancelled: true };
  }
  if (result.type !== "success" || !result.url) {
    return { ok: false, error: "Couldn't complete Google sign-in. Try again." };
  }

  const tokens = parseTokensFromRedirect(result.url);
  if (!tokens) {
    return { ok: false, error: "Couldn't complete Google sign-in. Try again." };
  }

  const { error: sessionError } = await supabase.auth.setSession(tokens);
  if (sessionError) {
    return { ok: false, error: "Couldn't complete Google sign-in. Try again." };
  }
  return { ok: true, error: null };
}

/**
 * Whether the native Apple button can be shown — iOS only, and only when the
 * Apple Authentication module + entitlement are present in the build.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Continue with Apple. Uses the native sheet, then hands the identity token to
 * Supabase. Required by App Store Guideline 4.8 whenever another social login
 * is offered on iOS.
 */
export async function signInWithApple(): Promise<SocialResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      return { ok: false, error: "Apple didn't return a sign-in token. Try again." };
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) {
      return { ok: false, error: presentProviderError(error.message, "Apple") };
    }
    return { ok: true, error: null };
  } catch (err) {
    // The native sheet throws a specific code on user cancel.
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ERR_REQUEST_CANCELED") {
      return { ok: false, error: null, cancelled: true };
    }
    return { ok: false, error: "Couldn't complete Apple sign-in. Try again." };
  }
}

/**
 * Map a raw provider error to a presentable line. A disabled provider is the
 * common pre-configuration case — say so plainly rather than leaking the
 * supabase-js internals.
 */
function presentProviderError(message: string | undefined, label: string): string {
  const msg = message?.toLowerCase() ?? "";
  if (msg.includes("provider") && (msg.includes("not enabled") || msg.includes("disabled"))) {
    return `${label} sign-in isn't available yet.`;
  }
  return `Couldn't sign in with ${label}. Try again.`;
}
