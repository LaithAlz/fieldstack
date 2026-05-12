/**
 * Tracks the user's recently viewed venues so we can surface a quick-jump row
 * at the top of the venue list. Stored as a JSON array of venue IDs in MRU
 * order, capped at MAX_ENTRIES.
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

const KEY = "@fieldstack/recently_viewed";
const MAX_ENTRIES = 8;

type ContextValue = {
  /** Most-recent first list of venue IDs. */
  recent: readonly string[];
  hydrated: boolean;
  /** Insert/move a venueId to the front. No-op if already at the front. */
  recordView: (venueId: string) => void;
  clear: () => Promise<void>;
};

const RecentlyViewedContext = createContext<ContextValue | null>(null);

export function RecentlyViewedProvider({ children }: { children: ReactNode }) {
  const [recent, setRecent] = useState<readonly string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
            setRecent(parsed.slice(0, MAX_ENTRIES));
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change, gated on hydrated so the empty initial state can't
  // overwrite stored data before the read finishes.
  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(KEY, JSON.stringify(recent)).catch(() => undefined);
  }, [recent, hydrated]);

  const recordView = useCallback((venueId: string) => {
    setRecent((prev) => {
      if (prev[0] === venueId) return prev;
      const without = prev.filter((id) => id !== venueId);
      return [venueId, ...without].slice(0, MAX_ENTRIES);
    });
  }, []);

  const clear = useCallback(async () => {
    setRecent([]);
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<ContextValue>(
    () => ({ recent, hydrated, recordView, clear }),
    [recent, hydrated, recordView, clear]
  );

  return (
    <RecentlyViewedContext.Provider value={value}>
      {children}
    </RecentlyViewedContext.Provider>
  );
}

export function useRecentlyViewed(): ContextValue {
  const ctx = useContext(RecentlyViewedContext);
  if (!ctx) {
    throw new Error(
      "useRecentlyViewed must be used inside <RecentlyViewedProvider>"
    );
  }
  return ctx;
}
