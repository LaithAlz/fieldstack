/**
 * Auth context. Wraps the supabase-js auth surface and exposes a typed
 * `useAuth()` for screens. Session is hydrated on app launch (from
 * AsyncStorage via supabase-js's storage adapter); subsequent state lives
 * in React state so consumers re-render on sign-in/out.
 *
 * Guest mode = no session. The app still works fully; persistence is
 * device-local until the user signs in.
 */

import type { AuthError, Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { identify, reset as resetAnalytics } from "./analytics";
import { supabase } from "./supabase";

type AuthResult = {
  ok: boolean;
  /** User-presentable error message when `ok` is false. */
  error: string | null;
};

/**
 * Map supabase-js error messages to a stable UI vocabulary. Without this the
 * sign-in form would leak server-side detail (JWT internals, RLS rule names)
 * straight to the user, and screens couldn't compare error.message strings
 * against a known set for branching behaviour.
 *
 * Returns null when err is null so screens can use `error ?? "..."` directly.
 */
function presentAuthError(err: AuthError | null): string | null {
  if (!err) return null;
  const msg = err.message?.toLowerCase() ?? "";
  if (msg.includes("invalid login credentials")) return "Email, phone, or password is incorrect.";
  if (msg.includes("email not confirmed")) return "Confirm your email. Check your inbox for a link.";
  if (msg.includes("phone not confirmed")) return "Confirm your phone. Check your texts for a code.";
  if (msg.includes("user already registered") || msg.includes("already registered"))
    return "That account already exists. Try signing in.";
  if (msg.includes("password should be at least")) return "Password must be at least 6 characters.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "Too many attempts. Try again in a minute.";
  if (msg.includes("network")) return "Couldn't reach the server. Check your connection.";
  if (msg.includes("phone") && (msg.includes("provider") || msg.includes("disabled")))
    return "Phone sign-up isn't enabled yet. Use email instead.";
  // Anything else: don't surface internals.
  return "Something went wrong. Please try again.";
}

/**
 * The user contacts us with exactly one of `email` or `phone`. Caller picks
 * by which key is set; never both, never neither.
 */
export type AuthContact = { email: string } | { phone: string };

type ContextValue = {
  user: User | null;
  session: Session | null;
  /** False until the first session-restore attempt finishes. */
  hydrated: boolean;
  /** True only while a sign-in / sign-up / sign-out request is in flight. */
  busy: boolean;
  /**
   * Set to true when a `type=recovery` deep link is opened. Consumers should
   * navigate to `SetNewPasswordScreen` and then call `clearPendingRecovery`.
   */
  pendingRecovery: boolean;
  clearPendingRecovery: () => void;
  signIn: (contact: AuthContact, password: string) => Promise<AuthResult>;
  signUp: (
    contact: AuthContact,
    password: string,
    fullName: string
  ) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<AuthResult>;
};

const AuthContext = createContext<ContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session ?? null);
      } catch {
        // Network failure or storage corruption — treat as no session.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    // Subscribe to sign-in / sign-out events. Supabase fires this on the
    // background refresh too, so we always have a fresh session in memory.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (cancelled) return;
      setSession(next ?? null);
    });

    // Deep-link handler for email verification / magic links. Supabase
    // appends `#access_token=…&refresh_token=…` to its redirect URL; we
    // parse that out and hydrate the session. We don't `detectSessionInUrl`
    // in the client (it's RN, no URL bar), so this is the bridge.
    const handleDeepLink = async (url: string | null) => {
      if (cancelled || !url) return;
      const parsed = parseSupabaseAuthUrl(url);
      if (!parsed) return;
      try {
        await supabase.auth.setSession(parsed);
        // Recovery links must route to SetNewPasswordScreen instead of
        // silently logging the user in.
        if (!cancelled && parsed.type === "recovery") {
          setPendingRecovery(true);
        }
      } catch (err) {
        if (__DEV__) {
          // Message only — supabase-js error objects can echo back the
          // request/response body, which may include the raw tokens.
           
          console.warn(
            "[auth] setSession from deep link failed",
            err instanceof Error ? err.message : "unknown"
          );
        }
      }
    };

    // Cold-launch: the email link may have been the launcher.
    Linking.getInitialURL()
      .then((url) => void handleDeepLink(url))
      .catch(() => undefined);
    // Warm: app already running when the user tapped the link.
    const linkingSub = Linking.addEventListener("url", (e) =>
      void handleDeepLink(e.url)
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  // Tie analytics movement to the person: identify when a user is present
  // (sign-in or a restored session on launch), reset when they sign out so
  // the next session/guest isn't merged into the previous user. Idempotent
  // re-identify on relaunch is harmless.
  //
  // Deliberately no email (or other contact info) in the identify traits —
  // PostHog only needs the id to tie events to a person. Keeps the "linked"
  // privacy-label answers from growing without a real analytics need.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    if (uid && uid !== prevUserIdRef.current) {
      identify(uid);
    } else if (!uid && prevUserIdRef.current) {
      resetAnalytics();
    }
    prevUserIdRef.current = uid;
  }, [session]);

  const signIn = useCallback<ContextValue["signIn"]>(async (contact, password) => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        ...contact,
        password,
      });
      return { ok: !error, error: presentAuthError(error) };
    } finally {
      setBusy(false);
    }
  }, []);

  const signUp = useCallback<ContextValue["signUp"]>(
    async (contact, password, fullName) => {
      setBusy(true);
      try {
        const { error } = await supabase.auth.signUp({
          ...contact,
          password,
          options: { data: { full_name: fullName } },
        });
        return { ok: !error, error: presentAuthError(error) };
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteAccount = useCallback(async (): Promise<AuthResult> => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("delete_user");
      if (error) {
        return { ok: false, error: "Couldn't delete account. Please try again." };
      }
      await supabase.auth.signOut();
      return { ok: true, error: null };
    } catch {
      return { ok: false, error: "Couldn't delete account. Please try again." };
    } finally {
      setBusy(false);
    }
  }, []);

  const clearPendingRecovery = useCallback(() => {
    setPendingRecovery(false);
  }, []);

  const value = useMemo<ContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      hydrated,
      busy,
      pendingRecovery,
      clearPendingRecovery,
      signIn,
      signUp,
      signOut,
      deleteAccount,
    }),
    [session, hydrated, busy, pendingRecovery, clearPendingRecovery, signIn, signUp, signOut, deleteAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): ContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

/**
 * Pull `access_token`, `refresh_token`, and `type` out of a Supabase auth
 * redirect URL. Supabase puts them in the URL fragment
 * (`#access_token=…&refresh_token=…&type=recovery`) for email verification,
 * magic links, and password recovery. Returns null for anything else (regular
 * deep links, error redirects, etc.) so callers can no-op safely.
 */
function parseSupabaseAuthUrl(
  url: string
): { access_token: string; refresh_token: string; type: string | null } | null {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token, type: params.get("type") };
}
