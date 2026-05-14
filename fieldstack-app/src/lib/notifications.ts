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
const MIN_LEAD_MS = 60 * 1000; // <1 min from now → don't bother

let handlerRegistered = false;
let permissionResolved: Promise<boolean> | null = null;
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
 * Schedule a one-hour-before-start reminder. Returns the scheduler id (so we
 * could cancel later) or null when we skipped scheduling.
 *
 * Skip cases — all silent, no toast or error:
 *   - notifications permission denied
 *   - start time is < 1 hour + 1 minute away (lead time already gone)
 *   - start time is in the past
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

/** Wipes every reminder we ever scheduled. Used by Settings → Clear data. */
export async function cancelAllBookingReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Permissions revoked / module unavailable — nothing to clean up either.
  }
}

// ---------------------------------------------------------------------------

async function ensurePermission(): Promise<boolean> {
  // Cache the in-flight / resolved permission so back-to-back bookings don't
  // re-prompt or re-query. iOS in particular caches the dialog answer but the
  // round-trip still costs us a few ms each call.
  if (permissionResolved) return permissionResolved;
  permissionResolved = (async () => {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const req = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
      },
    });
    return req.granted;
  })();
  return permissionResolved;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (androidChannelEnsured) return;
  androidChannelEnsured = true;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: "Booking reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
    description: "One-hour heads up before slots you booked through FieldStack.",
  });
}
