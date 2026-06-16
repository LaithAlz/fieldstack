/**
 * Persistent set of "saved" venue IDs. Backed by AsyncStorage as a JSON array;
 * exposed as a Set-of-strings in memory for O(1) membership checks.
 *
 * When a user is signed in, the set also syncs to the `user_saved_venues`
 * Supabase table via direct supabase-js calls (RLS enforces ownership).
 *
 *   - On sign-in: cloud rows + local rows are unioned. Any local-only entries
 *     get uploaded so a guest who saves a few venues, then signs in, keeps
 *     them. Cloud is the source of truth from that point.
 *   - On toggle (signed in): write-through to cloud in parallel with the
 *     AsyncStorage write. Cloud failures are logged but don't block local
 *     state — eventual consistency is fine here.
 *   - On sign-out: cloud writes stop. Local state stays put on this device.
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

import { useToast } from "../components/Toast";
import { useAuth } from "./auth";
import { supabase } from "./supabase";

/**
 * Retry a cloud write up to `maxAttempts` times with exponential backoff.
 * Returns true if any attempt succeeds, false if all fail.
 */
async function retryCloudWrite(fn: () => Promise<void>, maxAttempts = 3): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await fn();
      return true;
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, 500 * Math.pow(2, attempt))
        );
      }
    }
  }
  return false;
}

const KEY = "@fieldstack/saved_venues";

type ContextValue = {
  saved: ReadonlySet<string>;
  hydrated: boolean;
  isSaved: (venueId: string) => boolean;
  toggle: (venueId: string) => Promise<void>;
  /** Wipe in-memory + persisted set. Used by Settings → Clear data. */
  clear: () => Promise<void>;
  /** IDs currently awaiting a cloud write confirmation. */
  pendingSync: Set<string>;
};

const SavedVenuesContext = createContext<ContextValue | null>(null);

export function SavedVenuesProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const [pendingSync, setPendingSync] = useState<Set<string>>(() => new Set());
  const { user } = useAuth();
  const toast = useToast();
  // Tracks which user we've already merged for, so we don't re-pull cloud
  // on every render. Cleared on sign-out.
  const mergedForUserId = useRef<string | null>(null);
  // Per-venue write chain. Rapid toggles on the same venue could otherwise
  // fire DELETE before the prior INSERT had landed at Supabase, leaving a
  // phantom row in cloud until the next sign-in merge. Awaiting the previous
  // write for that id serializes them.
  const writeChains = useRef(new Map<string, Promise<void>>());

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

  // Cloud sync on sign-in / sign-out. Re-runs only when the user identity
  // actually changes (not on every render of the provider).
  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      // Signed out — drop the merged marker so a future sign-in pulls fresh.
      mergedForUserId.current = null;
      return;
    }
    if (mergedForUserId.current === user.id) return;
    mergedForUserId.current = user.id;

    let cancelled = false;
    (async () => {
      try {
        // Pull cloud rows for this user.
        const { data, error } = await supabase
          .from("user_saved_venues")
          .select("venue_id")
          .eq("user_id", user.id);
        if (cancelled) return;
        if (error) {
           
          console.warn("[savedVenues] pull failed", error.message);
          return;
        }
        const cloud = new Set<string>(
          (data ?? []).map((r) => r.venue_id as string)
        );

        // Functional update so we union against the freshest local state in
        // case the user toggled while the network round-trip was in flight.
        setSaved((prev) => {
          const union = new Set<string>(prev);
          cloud.forEach((id) => union.add(id));

          // Push local-only entries up to the cloud.
          const localOnly: string[] = [];
          prev.forEach((id) => {
            if (!cloud.has(id)) localOnly.push(id);
          });
          if (localOnly.length > 0) {
            // upsert with ignoreDuplicates so a near-simultaneous sync from
            // another device that already pushed the same venue doesn't
            // surface as a unique-constraint violation in logs.
            void supabase
              .from("user_saved_venues")
              .upsert(
                localOnly.map((venue_id) => ({ user_id: user.id, venue_id })),
                { onConflict: "user_id,venue_id", ignoreDuplicates: true }
              )
              .then(({ error: upsertErr }) => {
                if (upsertErr) {
                   
                  console.warn("[savedVenues] upload failed", upsertErr.message);
                }
              });
          }

          // Persist the union locally too so a fresh-cloud, no-local sign-in
          // doesn't have to re-pull every cold start.
          void AsyncStorage.setItem(
            KEY,
            JSON.stringify(Array.from(union))
          ).catch(() => undefined);

          return union;
        });
      } catch (err) {
         
        console.warn("[savedVenues] sync threw", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, user]);

  const isSaved = useCallback((id: string) => saved.has(id), [saved]);

  const toggle = useCallback(
    async (id: string) => {
      const currentUser = user; // snapshot at call time, not at updater execution time

      // --- Optimistic update ---
      const wasSaved = saved.has(id);
      const optimisticNext = new Set(saved);
      if (wasSaved) optimisticNext.delete(id);
      else optimisticNext.add(id);
      setSaved(optimisticNext);
      void AsyncStorage.setItem(KEY, JSON.stringify(Array.from(optimisticNext))).catch(
        () => undefined
      );

      if (!currentUser) return;

      // --- Cloud write with retry ---
      setPendingSync((prev) => new Set([...prev, id]));

      const previous = writeChains.current.get(id) ?? Promise.resolve();
      const next$ = previous.then(async () => {
        const cloudWrite = async () => {
          if (wasSaved) {
            const { error } = await supabase
              .from("user_saved_venues")
              .delete()
              .eq("user_id", currentUser.id)
              .eq("venue_id", id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("user_saved_venues")
              .upsert(
                { user_id: currentUser.id, venue_id: id },
                { onConflict: "user_id,venue_id", ignoreDuplicates: true }
              );
            if (error) throw error;
          }
        };

        const succeeded = await retryCloudWrite(cloudWrite);
        setPendingSync((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });

        if (!succeeded) {
          // Roll back optimistic update — both in-memory and AsyncStorage.
          setSaved((current) => {
            const rolled = new Set(current);
            if (wasSaved) rolled.add(id);
            else rolled.delete(id);
            void AsyncStorage.setItem(KEY, JSON.stringify(Array.from(rolled))).catch(
              () => undefined
            );
            return rolled;
          });
          toast.show("Couldn't save venue. Check your connection.", { type: "error" });
        }
      });

      writeChains.current.set(id, next$);
      // Reap the chain once it resolves so the Map doesn't grow without
      // bound. Only clear if we're still the latest pending write for
      // this id — a newer toggle may have already replaced us.
      void next$.finally(() => {
        if (writeChains.current.get(id) === next$) {
          writeChains.current.delete(id);
        }
      });
    },
    [saved, user, toast]
  );

  const clear = useCallback(async () => {
    setSaved(new Set());
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    // Don't wipe cloud rows from clear() — Settings' "Clear data" is a
    // device-scoped reset (the alert copy promises that explicitly).
    // Account deletion is a separate flow.
  }, []);

  const value = useMemo<ContextValue>(
    () => ({ saved, hydrated, isSaved, toggle, clear, pendingSync }),
    [saved, hydrated, isSaved, toggle, clear, pendingSync]
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
