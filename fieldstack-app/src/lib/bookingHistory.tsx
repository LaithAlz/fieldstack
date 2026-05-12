/**
 * Local booking-attempt history. The app hands off to the operator's site to
 * actually book; we record the *attempt* (when the user tapped "Continue on
 * {operator}") so we can:
 *   - badge venues the user recently engaged with
 *   - eventually surface "rebook last week's slot" shortcuts
 *
 * Storage is a JSON array, capped at MAX_ENTRIES with most-recent-first.
 * Same field+venue pair within a short window collapses into one entry so we
 * don't fill the cap with retries.
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

const KEY = "@fieldstack/booking_history";
const MAX_ENTRIES = 50;
const DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export type BookingAttempt = {
  fieldId: string;
  venueId: string;
  /** Unix ms. */
  attemptedAt: number;
  /** ISO YYYY-MM-DD of the slot they were booking (not the attempt time). */
  date: string;
  startTime: string;
  duration: number;
};

type ContextValue = {
  attempts: readonly BookingAttempt[];
  hydrated: boolean;
  record: (attempt: Omit<BookingAttempt, "attemptedAt">) => Promise<void>;
  /** True when the venue had a booking attempt within the last `withinMs`. */
  venueWasRecentlyAttempted: (venueId: string, withinMs?: number) => boolean;
  clear: () => Promise<void>;
};

const BookingHistoryContext = createContext<ContextValue | null>(null);

export function BookingHistoryProvider({ children }: { children: ReactNode }) {
  const [attempts, setAttempts] = useState<readonly BookingAttempt[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            const valid = parsed.filter(isBookingAttempt);
            setAttempts(valid);
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

  const record = useCallback(async (attempt: Omit<BookingAttempt, "attemptedAt">) => {
    const now = Date.now();
    setAttempts((prev) => {
      // Collapse a same-field+venue entry within DEDUPE_WINDOW_MS into the new one.
      const filtered = prev.filter(
        (a) =>
          !(
            a.fieldId === attempt.fieldId &&
            a.venueId === attempt.venueId &&
            now - a.attemptedAt < DEDUPE_WINDOW_MS
          )
      );
      const next = [{ ...attempt, attemptedAt: now }, ...filtered].slice(0, MAX_ENTRIES);
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const venueWasRecentlyAttempted = useCallback(
    (venueId: string, withinMs: number = 30 * 24 * 60 * 60 * 1000) => {
      const cutoff = Date.now() - withinMs;
      return attempts.some(
        (a) => a.venueId === venueId && a.attemptedAt >= cutoff
      );
    },
    [attempts]
  );

  const clear = useCallback(async () => {
    setAttempts([]);
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<ContextValue>(
    () => ({ attempts, hydrated, record, venueWasRecentlyAttempted, clear }),
    [attempts, hydrated, record, venueWasRecentlyAttempted, clear]
  );

  return (
    <BookingHistoryContext.Provider value={value}>
      {children}
    </BookingHistoryContext.Provider>
  );
}

export function useBookingHistory(): ContextValue {
  const ctx = useContext(BookingHistoryContext);
  if (!ctx) {
    throw new Error(
      "useBookingHistory must be used inside <BookingHistoryProvider>"
    );
  }
  return ctx;
}

function isBookingAttempt(v: unknown): v is BookingAttempt {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.fieldId === "string" &&
    typeof r.venueId === "string" &&
    typeof r.attemptedAt === "number" &&
    Number.isFinite(r.attemptedAt) &&
    typeof r.date === "string" &&
    typeof r.startTime === "string" &&
    typeof r.duration === "number" &&
    Number.isFinite(r.duration)
  );
}
