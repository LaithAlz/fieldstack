/**
 * Coordinated wipe of every persistence layer in the app. Used by the
 * Settings "Clear app data" action so the user doesn't have to relaunch to
 * see the reset land in-memory.
 *
 * Each provider already exposes its own `clear()` that nukes both the cache
 * and the persisted blob; this hook just fans the call out. We don't also
 * call `AsyncStorage.clear()` because that would wipe future keys this hook
 * doesn't know about — keeping the contract scoped to keys we own.
 */

import { useCallback } from "react";

import { useBookingHistory } from "./bookingHistory";
import { cancelAllBookingReminders } from "./notifications";
import { usePreferredSlot } from "./preferredSlot";
import { useRecentlyViewed } from "./recentlyViewed";
import { useSavedVenues } from "./savedVenues";

export function useAppReset() {
  const { clear: clearSlot } = usePreferredSlot();
  const { clear: clearSaved } = useSavedVenues();
  const { clear: clearHistory } = useBookingHistory();
  const { clear: clearRecent } = useRecentlyViewed();

  return useCallback(async () => {
    await Promise.all([
      clearSlot(),
      clearSaved(),
      clearHistory(),
      clearRecent(),
      cancelAllBookingReminders(),
    ]);
  }, [clearSlot, clearSaved, clearHistory, clearRecent]);
}
