/**
 * Local push notifications for booking reminders. Fires a one-hour-out heads
 * up so the user remembers the slot they redirected to book — even though we
 * never own the actual reservation, knowing they said "yes" is signal enough
 * to surface a reminder.
 *
 * Everything in here is local-only (no Expo push server, no token registration).
 * Permission is asked *just in time* — first time the user confirms a booking —
 * so we don't burn the prompt at app launch.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const ANDROID_CHANNEL = "booking-reminders";
/** Minimum time between "now" and the *trigger* (which is 1h before start). */
const MIN_LEAD_MS = 60 * 1000;

let handlerRegistered = false;
let pendingPermission: Promise<boolean> | null = null;
let androidChannelEnsured = false;

/**
 * Configure the foreground handler. Should run once at app startup. Safe to
 * call multiple times — we guard so re-renders don't re-register.
 */
export function initNotifications(): void {
  if (handlerRegistered) return;
  handlerRegistered = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Schedule a one-hour-before-start reminder. Returns the scheduler id or null
 * when we skipped scheduling.
 *
 * Skip cases — all silent, no toast or error:
 *   - notifications permission denied (we don't pester after the first ask)
 *   - the 1-hour-prior trigger is already <1 minute away or in the past, i.e.
 *     the slot itself is roughly less than an hour out. Last-minute bookings
 *     intentionally get no reminder — the user just opened the operator's
 *     site, they don't need a heads-up about a slot they're currently booking.
 */
export async function scheduleBookingReminder(input: {
  venueName: string;
  startDate: Date;
}): Promise<string | null> {
  const triggerMs = input.startDate.getTime() - 60 * 60 * 1000;
  const delta = triggerMs - Date.now();
  if (delta < MIN_LEAD_MS) return null;

  const granted = await ensurePermission();
  if (!granted) return null;
  await ensureAndroidChannel();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Booking reminder",
      body: `Your slot at ${input.venueName} starts in 1 hour.`,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(triggerMs),
      channelId: Platform.OS === "android" ? ANDROID_CHANNEL : undefined,
    },
  });
}

/**
 * Wipes every scheduled notification. Used by Settings → Clear data.
 *
 * TODO: scope by identifier once a second notification source exists. Today
 * booking reminders are the only thing we schedule, so the broad cancel is
 * accurate; if/when we add another scheduler, persist per-attempt ids and
 * cancel them individually.
 */
export async function cancelAllBookingReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Permissions revoked / module unavailable — nothing to clean up either.
  }
}

// ---------------------------------------------------------------------------

/**
 * Returns whether the app has notification permission. Re-queries the OS each
 * call so toggling the system setting takes effect without an app restart;
 * only the in-flight `request` is cached to prevent double-prompts during
 * back-to-back bookings.
 */
async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  if (pendingPermission) return pendingPermission;
  pendingPermission = (async () => {
    const req = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
      },
    });
    return req.granted;
  })();
  try {
    return await pendingPermission;
  } finally {
    pendingPermission = null;
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (androidChannelEnsured) return;
  androidChannelEnsured = true;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: "Booking reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
    description: "One-hour heads up before slots you booked through Onside.",
  });
}
