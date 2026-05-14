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

import { useAuth } from "./auth";
import { supabase } from "./supabase";

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
  const { user } = useAuth();
  // Tracks which user we've already merged for, so we don't re-pull cloud
  // on every render. Cleared on sign-out.
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
          // eslint-disable-next-line no-console
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
            void supabase
              .from("user_saved_venues")
              .insert(
                localOnly.map((venue_id) => ({ user_id: user.id, venue_id }))
              )
              .then(({ error: upsertErr }) => {
                if (upsertErr) {
                  // eslint-disable-next-line no-console
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
        // eslint-disable-next-line no-console
        console.warn("[savedVenues] sync threw", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, user]);

  const isSaved = useCallback((id: string) => saved.has(id), [saved]);

  // Functional setter pattern — rapid taps must not race on a stale snapshot.
  // Persist locally inside the updater; cloud write fires when signed in.
  const toggle = useCallback(
    async (id: string) => {
      setSaved((prev) => {
        const next = new Set(prev);
        const wasSaved = next.has(id);
        if (wasSaved) next.delete(id);
        else next.add(id);

        void AsyncStorage.setItem(KEY, JSON.stringify(Array.from(next))).catch(
          () => undefined
        );

        // Write-through to cloud if signed in. Failures don't block local
        // state — eventual consistency is acceptable for "is this saved."
        if (user) {
          if (wasSaved) {
            void supabase
              .from("user_saved_venues")
              .delete()
              .eq("user_id", user.id)
              .eq("venue_id", id)
              .then(({ error }) => {
                if (error) {
                  // eslint-disable-next-line no-console
                  console.warn("[savedVenues] cloud delete failed", error.message);
                }
              });
          } else {
            void supabase
              .from("user_saved_venues")
              .insert({ user_id: user.id, venue_id: id })
              .then(({ error }) => {
                if (error) {
                  // eslint-disable-next-line no-console
                  console.warn("[savedVenues] cloud insert failed", error.message);
                }
              });
          }
        }

        return next;
      });
    },
    [user]
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
