/**
 * "What time do you want to play?" persistence layer.
 *
 * Users typically book the same slot week-to-week (e.g. Saturday 7 PM, 1.5h).
 * Capturing that preference once and pre-filling every booking sheet from it
 * removes a tedious re-pick at every field. Stored as an ISO date + HH:mm
 * start + numeric hours so reads survive across app restarts.
 *
 * Unset state means "no preference"; field detail screens fall back to
 * `defaultDateTimeSelections()` in that case.
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

const KEY = "@fieldstack/preferred_slot";

export type PreferredSlot = {
  /** ISO date string at local midnight (YYYY-MM-DD). */
  date: string;
  /** "HH:mm" 24h. */
  startTime: string;
  /** Hours, fractional allowed (1, 1.5, 2, …). */
  duration: number;
};

type ContextValue = {
  slot: PreferredSlot | null;
  setSlot: (next: PreferredSlot) => Promise<void>;
  clear: () => Promise<void>;
};

const PreferredSlotContext = createContext<ContextValue | null>(null);

export function PreferredSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlotState] = useState<PreferredSlot | null>(null);
  const [, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (isPreferredSlot(parsed)) setSlotState(parsed);
        }
      } catch {
        // Read failure is fine — fall back to no preference.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSlot = useCallback(async (next: PreferredSlot) => {
    setSlotState(next);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Write failure is non-fatal; in-memory state already updated.
    }
  }, []);

  const clear = useCallback(async () => {
    setSlotState(null);
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<ContextValue>(() => ({ slot, setSlot, clear }), [slot, setSlot, clear]);

  return (
    <PreferredSlotContext.Provider value={value}>
      {children}
    </PreferredSlotContext.Provider>
  );
}

export function usePreferredSlot(): ContextValue {
  const ctx = useContext(PreferredSlotContext);
  if (!ctx) {
    throw new Error("usePreferredSlot must be used inside <PreferredSlotProvider>");
  }
  return ctx;
}

/** Convert the stored ISO date back to a Date at local midnight. */
export function preferredSlotDate(slot: PreferredSlot): Date {
  const [y, m, d] = slot.date.split("-").map(Number);
  const out = new Date();
  out.setFullYear(y, m - 1, d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isPreferredSlot(v: unknown): v is PreferredSlot {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.date === "string" &&
    typeof r.startTime === "string" &&
    typeof r.duration === "number"
  );
}
