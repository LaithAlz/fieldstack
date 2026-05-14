/**
 * Tracks the user's recently viewed venues so we can surface a quick-jump row
 * at the top of the venue list. Stored as a JSON array of venue IDs in MRU
 * order, capped at MAX_ENTRIES.
 *
 * When signed in, also writes to `user_recently_viewed` (composite PK so
 * re-views upsert in place). On sign-in we union cloud + local by venue id;
 * local order wins for overlapping ids (post-recordView local is fresher
 * than whatever cloud's viewed_at says), and cloud-only ids append after.
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

  // Cloud sync on sign-in. Composite-PK upsert per view; merge prefers
  // more-recent viewed_at on conflict.
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
          .from("user_recently_viewed")
          .select("venue_id, viewed_at")
          .eq("user_id", user.id)
          .order("viewed_at", { ascending: false })
          .limit(MAX_ENTRIES * 2);
        if (cancelled) return;
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[recentlyViewed] pull failed", error.message);
          return;
        }
        const cloudIds = (data ?? []).map((r) => r.venue_id as string);

        setRecent((prev) => {
          // Merge: prev wins for venues in both (preserves the local order,
          // which is fresher post-record-view). Any cloud-only venues append
          // after the local ones; final list capped at MAX_ENTRIES.
          const seen = new Set<string>();
          const merged: string[] = [];
          for (const id of prev) {
            if (!seen.has(id)) {
              merged.push(id);
              seen.add(id);
            }
          }
          for (const id of cloudIds) {
            if (!seen.has(id)) {
              merged.push(id);
              seen.add(id);
            }
            if (merged.length >= MAX_ENTRIES) break;
          }
          const capped = merged.slice(0, MAX_ENTRIES);

          // Push any local-only venues up so they sync to other devices.
          const cloudSet = new Set(cloudIds);
          const localOnly = capped.filter((id) => !cloudSet.has(id));
          if (localOnly.length > 0) {
            // Note: we don't have the original local viewed_at timestamps
            // (the local store only keeps order, not times). Stamping the
            // upload with `now` is intentional — these are venues the user
            // has seen recently from this device's perspective.
            void supabase
              .from("user_recently_viewed")
              .upsert(
                localOnly.map((venue_id) => ({
                  user_id: user.id,
                  venue_id,
                  viewed_at: new Date().toISOString(),
                })),
                { onConflict: "user_id,venue_id" }
              )
              .then(({ error: upErr }) => {
                if (upErr) {
                  // eslint-disable-next-line no-console
                  console.warn(
                    "[recentlyViewed] upload failed",
                    upErr.message
                  );
                }
              });
          }
          return capped;
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[recentlyViewed] sync threw", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, user]);

  const recordView = useCallback(
    (venueId: string) => {
      setRecent((prev) => {
        if (prev[0] === venueId) return prev;
        const without = prev.filter((id) => id !== venueId);
        return [venueId, ...without].slice(0, MAX_ENTRIES);
      });
      // Write-through to cloud when signed in. Composite PK + upsert means
      // re-viewing the same venue just bumps viewed_at.
      if (user) {
        void supabase
          .from("user_recently_viewed")
          .upsert(
            {
              user_id: user.id,
              venue_id: venueId,
              viewed_at: new Date().toISOString(),
            },
            { onConflict: "user_id,venue_id" }
          )
          .then(({ error }) => {
            if (error) {
              // eslint-disable-next-line no-console
              console.warn(
                "[recentlyViewed] cloud upsert failed",
                error.message
              );
            }
          });
      }
    },
    [user]
  );

  const clear = useCallback(async () => {
    setRecent([]);
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    // Cloud rows left alone — Settings 'Clear data' is device-scoped.
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
