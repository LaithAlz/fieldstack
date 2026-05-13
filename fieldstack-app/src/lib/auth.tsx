/**
 * Auth context. Wraps the supabase-js auth surface and exposes a typed
 * `useAuth()` for screens. Session is hydrated on app launch (from
 * AsyncStorage via supabase-js's storage adapter); subsequent state lives
 * in React state so consumers re-render on sign-in/out.
 *
 * Guest mode = no session. The app still works fully; persistence is
 * device-local until the user signs in.
 */

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "./supabase";

type AuthResult = {
  ok: boolean;
  /** User-presentable error message when `ok` is false. */
  error: string | null;
};

type ContextValue = {
  user: User | null;
  session: Session | null;
  /** False until the first session-restore attempt finishes. */
  hydrated: boolean;
  /** True only while a sign-in / sign-up / sign-out request is in flight. */
  busy: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<ContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);

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

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback<ContextValue["signIn"]>(async (email, password) => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { ok: !error, error: error?.message ?? null };
    } finally {
      setBusy(false);
    }
  }, []);

  const signUp = useCallback<ContextValue["signUp"]>(async (email, password) => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      return { ok: !error, error: error?.message ?? null };
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<ContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      hydrated,
      busy,
      signIn,
      signUp,
      signOut,
    }),
    [session, hydrated, busy, signIn, signUp, signOut]
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
