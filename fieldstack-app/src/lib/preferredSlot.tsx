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
  /** False until the AsyncStorage read finishes (success or failure). */
  hydrated: boolean;
  setSlot: (next: PreferredSlot) => Promise<void>;
  clear: () => Promise<void>;
};

const PreferredSlotContext = createContext<ContextValue | null>(null);

export function PreferredSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlotState] = useState<PreferredSlot | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (isPreferredSlot(parsed)) {
            // Past dates re-anchor to today so the time-of-day preference
            // survives midnight rollovers without leaving the user on a date
            // whose every slot is greyed out.
            const refreshed = reanchorIfPast(parsed);
            setSlotState(refreshed);
            if (refreshed !== parsed) {
              // Persist the refresh so the next hydration is consistent.
              await AsyncStorage.setItem(KEY, JSON.stringify(refreshed));
            }
          }
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

  const value = useMemo<ContextValue>(
    () => ({ slot, hydrated, setSlot, clear }),
    [slot, hydrated, setSlot, clear]
  );

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

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPreferredSlot(v: unknown): v is PreferredSlot {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.date === "string" &&
    DATE_RE.test(r.date) &&
    typeof r.startTime === "string" &&
    TIME_RE.test(r.startTime) &&
    typeof r.duration === "number" &&
    Number.isFinite(r.duration) &&
    r.duration > 0 &&
    r.duration <= 6
  );
}

/** Re-anchor a slot whose date is in the past to today. Time + duration kept. */
function reanchorIfPast(slot: PreferredSlot): PreferredSlot {
  const stored = preferredSlotDate(slot);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (stored.getTime() >= today.getTime()) return slot;
  return { ...slot, date: toIsoDate(today) };
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
