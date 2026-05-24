/**
 * Client-side block list. Required by App Store Review Guideline 1.2:
 * users must be able to block other users whose content they don't want
 * to see. Reviews authored by a blocked user are filtered out of the
 * UI everywhere they'd render.
 *
 * Storage is AsyncStorage on-device — the simplest thing that satisfies
 * the policy. A server-backed block table would also work and would
 * persist across devices/reinstalls, but isn't required and adds RLS +
 * sync complexity for an MVP submission.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "@fieldstack/blocked_user_ids";

type ContextValue = {
  /** True until the initial read from AsyncStorage finishes. */
  hydrated: boolean;
  blocked: ReadonlySet<string>;
  isBlocked: (userId: string) => boolean;
  block: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
};

const BlockedUsersContext = createContext<ContextValue | null>(null);

export function BlockedUsersProvider({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            setBlocked(new Set(parsed.filter((x): x is string => typeof x === "string")));
          }
        }
      } catch {
        // Corrupt storage → start empty rather than crash.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: Set<string>) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Best effort — surfacing failure here would just confuse the user.
    }
  }, []);

  const block = useCallback(
    async (userId: string) => {
      setBlocked((prev) => {
        if (prev.has(userId)) return prev;
        const next = new Set(prev);
        next.add(userId);
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  const unblock = useCallback(
    async (userId: string) => {
      setBlocked((prev) => {
        if (!prev.has(userId)) return prev;
        const next = new Set(prev);
        next.delete(userId);
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  const isBlocked = useCallback((userId: string) => blocked.has(userId), [blocked]);

  const value = useMemo<ContextValue>(
    () => ({ hydrated, blocked, isBlocked, block, unblock }),
    [hydrated, blocked, isBlocked, block, unblock]
  );

  return (
    <BlockedUsersContext.Provider value={value}>
      {children}
    </BlockedUsersContext.Provider>
  );
}

export function useBlockedUsers(): ContextValue {
  const ctx = useContext(BlockedUsersContext);
  if (!ctx) {
    throw new Error("useBlockedUsers must be used inside <BlockedUsersProvider>");
  }
  return ctx;
}
