/**
 * Persistent set of "saved" venue IDs. Backed by AsyncStorage as a JSON array;
 * exposed as a Set-of-strings in memory for O(1) membership checks.
 *
 * Returns an immutable snapshot per render so consumers can pass it down
 * without worrying about mutation, and so React's referential equality picks
 * up changes.
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

const KEY = "@fieldstack/saved_venues";

type ContextValue = {
  saved: ReadonlySet<string>;
  hydrated: boolean;
  isSaved: (venueId: string) => boolean;
  toggle: (venueId: string) => Promise<void>;
  /** Wipe in-memory + persisted set. Used by Settings → Clear data. */
  clear: () => Promise<void>;
};

const SavedVenuesContext = createContext<ContextValue | null>(null);

export function SavedVenuesProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set());
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
            setSaved(new Set(parsed));
          }
        }
      } catch {
        // Read failure is non-fatal; in-memory stays empty.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isSaved = useCallback((id: string) => saved.has(id), [saved]);

  // Functional setter pattern — rapid taps must not race on a stale snapshot.
  // Persist inside the updater so the disk write always reflects the actual
  // resulting state, not whatever was captured at call time.
  const toggle = useCallback(async (id: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      void AsyncStorage.setItem(KEY, JSON.stringify(Array.from(next))).catch(() => undefined);
      return next;
    });
  }, []);

  const clear = useCallback(async () => {
    setSaved(new Set());
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<ContextValue>(
    () => ({ saved, hydrated, isSaved, toggle, clear }),
    [saved, hydrated, isSaved, toggle, clear]
  );

  return (
    <SavedVenuesContext.Provider value={value}>
      {children}
    </SavedVenuesContext.Provider>
  );
}

export function useSavedVenues(): ContextValue {
  const ctx = useContext(SavedVenuesContext);
  if (!ctx) {
    throw new Error("useSavedVenues must be used inside <SavedVenuesProvider>");
  }
  return ctx;
}
