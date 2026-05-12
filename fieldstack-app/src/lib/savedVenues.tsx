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

  const toggle = useCallback(
    async (id: string) => {
      const next = new Set(saved);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSaved(next);
      try {
        await AsyncStorage.setItem(KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Persist failure is non-fatal; UI reflects the in-memory change.
      }
    },
    [saved]
  );

  const value = useMemo<ContextValue>(
    () => ({ saved, hydrated, isSaved, toggle }),
    [saved, hydrated, isSaved, toggle]
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
