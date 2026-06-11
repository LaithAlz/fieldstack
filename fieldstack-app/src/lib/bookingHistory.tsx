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
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "./auth";
import { supabase } from "./supabase";

const KEY = "@fieldstack/booking_history";
const MAX_ENTRIES = 50;
const DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export type BookingAttempt = {
  /**
   * Stable UUID. Generated client-side so cloud + local can dedupe on
   * sign-in merge without timestamp-fuzzy matching. The cloud table's
   * `id uuid` column accepts client-supplied values.
   */
  id: string;
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
  /** Caller passes the slot details; we mint the id + attemptedAt. */
  record: (attempt: Omit<BookingAttempt, "attemptedAt" | "id">) => Promise<void>;
  /** True when the venue had a booking attempt within the last `withinMs`. */
  venueWasRecentlyAttempted: (venueId: string, withinMs?: number) => boolean;
  clear: () => Promise<void>;
};

const BookingHistoryContext = createContext<ContextValue | null>(null);

export function BookingHistoryProvider({ children }: { children: ReactNode }) {
  const [attempts, setAttempts] = useState<readonly BookingAttempt[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const { user } = useAuth();
  const mergedForUserId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            const valid = parsed
              // Back-fill ids for entries persisted before the schema gained
              // them, so legacy data still loads + dedupes correctly.
              .map(backfillId)
              .filter(isBookingAttempt);
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

  // Persist on every change. Gated on `hydrated` so the empty initial state
  // can't overwrite stored data before the read finishes.
  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(KEY, JSON.stringify(attempts)).catch(() => undefined);
  }, [attempts, hydrated]);

  // Cloud sync on sign-in. Append-only — pull cloud history, union with
  // local by id, cap, push local-only entries up. Cloud is unbounded; local
  // stays capped at MAX_ENTRIES for UI consistency.
  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      mergedForUserId.current = null;
      return;
    }
    if (mergedForUserId.current === user.id) return;
    mergedForUserId.current = user.id;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_booking_history")
          .select(
            "id, field_id, venue_id, attempted_at, slot_date, start_time, duration"
          )
          .eq("user_id", user.id)
          .order("attempted_at", { ascending: false })
          .limit(MAX_ENTRIES);
        if (cancelled) return;
        if (error) {
           
          console.warn("[bookingHistory] pull failed", error.message);
          return;
        }
        const cloudAttempts: BookingAttempt[] = (data ?? []).map((r) => ({
          id: r.id as string,
          fieldId: r.field_id as string,
          venueId: r.venue_id as string,
          attemptedAt: new Date(r.attempted_at as string).getTime(),
          date: r.slot_date as string,
          startTime: r.start_time as string,
          duration: Number(r.duration),
        }));

        setAttempts((prev) => {
          const seen = new Set<string>();
          const merged: BookingAttempt[] = [];
          // Walk both lists in interleaved order so the final array stays
          // sorted by attemptedAt desc.
          const combined = [...prev, ...cloudAttempts].sort(
            (a, b) => b.attemptedAt - a.attemptedAt
          );
          for (const a of combined) {
            if (seen.has(a.id)) continue;
            seen.add(a.id);
            merged.push(a);
            if (merged.length >= MAX_ENTRIES) break;
          }

          // Upload local-only entries (those whose ids aren't in cloud).
          const cloudIds = new Set(cloudAttempts.map((a) => a.id));
          const localOnly = prev.filter((a) => !cloudIds.has(a.id));
          if (localOnly.length > 0) {
            void supabase
              .from("user_booking_history")
              .upsert(
                localOnly.map((a) => ({
                  id: a.id,
                  user_id: user.id,
                  field_id: a.fieldId,
                  venue_id: a.venueId,
                  attempted_at: new Date(a.attemptedAt).toISOString(),
                  slot_date: a.date,
                  start_time: a.startTime,
                  duration: a.duration,
                })),
                { onConflict: "id", ignoreDuplicates: true }
              )
              .then(({ error: upErr }) => {
                if (upErr) {
                   
                  console.warn(
                    "[bookingHistory] upload failed",
                    upErr.message
                  );
                }
              });
          }
          return merged;
        });
      } catch (err) {
         
        console.warn("[bookingHistory] sync threw", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, user]);

  const record = useCallback(
    async (attempt: Omit<BookingAttempt, "attemptedAt" | "id">) => {
      const now = Date.now();
      const newAttempt: BookingAttempt = {
        ...attempt,
        id: uuid(),
        attemptedAt: now,
      };
      setAttempts((prev) => {
        // Collapse a same-field+venue entry within DEDUPE_WINDOW_MS.
        const filtered = prev.filter(
          (a) =>
            !(
              a.fieldId === attempt.fieldId &&
              a.venueId === attempt.venueId &&
              now - a.attemptedAt < DEDUPE_WINDOW_MS
            )
        );
        return [newAttempt, ...filtered].slice(0, MAX_ENTRIES);
      });

      if (user) {
        void supabase
          .from("user_booking_history")
          .insert({
            id: newAttempt.id,
            user_id: user.id,
            field_id: newAttempt.fieldId,
            venue_id: newAttempt.venueId,
            attempted_at: new Date(now).toISOString(),
            slot_date: newAttempt.date,
            start_time: newAttempt.startTime,
            duration: newAttempt.duration,
          })
          .then(({ error }) => {
            if (error) {
               
              console.warn(
                "[bookingHistory] cloud insert failed",
                error.message
              );
            }
          });
      }
    },
    [user]
  );

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function isBookingAttempt(v: unknown): v is BookingAttempt {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.fieldId === "string" &&
    r.fieldId.length > 0 &&
    typeof r.venueId === "string" &&
    r.venueId.length > 0 &&
    typeof r.attemptedAt === "number" &&
    Number.isFinite(r.attemptedAt) &&
    r.attemptedAt > 0 &&
    typeof r.date === "string" &&
    DATE_RE.test(r.date) &&
    typeof r.startTime === "string" &&
    TIME_RE.test(r.startTime) &&
    typeof r.duration === "number" &&
    Number.isFinite(r.duration) &&
    r.duration > 0
  );
}

/**
 * Add a synthetic id to entries persisted before the schema gained one.
 * Pre-9D-3 builds wrote attempts without ids; without back-fill they'd fail
 * isBookingAttempt and drop on the first post-upgrade load.
 */
function backfillId(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const r = v as Record<string, unknown>;
  if (typeof r.id === "string" && r.id.length > 0) return v;
  return { ...r, id: uuid() };
}

/**
 * RFC 4122 v4-ish. Not cryptographically secure, but booking-history ids
 * just need to be unique within a user's modest-sized log — Math.random
 * collisions are astronomically unlikely at this scale and the cost of
 * pulling in a crypto-grade uuid lib isn't worth it.
 */
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
