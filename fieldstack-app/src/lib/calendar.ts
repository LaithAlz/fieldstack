/**
 * Native-calendar export helpers. Used by the booking sheets after a
 * successful `Linking.openURL` handoff so the user can drop the slot they
 * just initiated into their phone's calendar in one tap.
 *
 * Permission is requested on demand (we don't ask at app launch). If the
 * user denies, the function returns `false` and the caller can fall back
 * to a toast — no native settings deep-link, the user can re-enable in
 * Settings → FieldStack → Calendars whenever.
 */

import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

export type AddEventInput = {
  title: string;
  /** Local start time as a Date object. */
  startDate: Date;
  /** Hours, fractional allowed (1, 1.5, 2, …). */
  durationHours: number;
  /** Free-text location (typically venue address). */
  location?: string;
  /** Long-form note (operator name, "Booked through FieldStack", etc.). */
  notes?: string;
};

/**
 * Add an event to the user's default calendar. Returns true on success,
 * false on permission denial, and throws for actual SDK errors so the
 * caller can show an "Couldn't add to calendar" toast.
 */
export async function addEventToCalendar(input: AddEventInput): Promise<boolean> {
  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (perm.status !== "granted") return false;

  // iOS distinguishes calendar vs reminders permissions; we only need the
  // calendar one. Android collapses them.
  const calendarId = await getDefaultCalendarId();
  if (!calendarId) return false;

  const endDate = new Date(
    input.startDate.getTime() + Math.round(input.durationHours * 60 * 60 * 1000)
  );

  await Calendar.createEventAsync(calendarId, {
    title: input.title,
    startDate: input.startDate,
    endDate,
    location: input.location,
    notes: input.notes,
    // Defaults to local time on both platforms — RN bridges Date as a
    // wall-clock value relative to the device timezone.
    timeZone: undefined,
  });

  return true;
}

/**
 * Pick a writable calendar to drop the event into. On iOS we prefer the
 * `defaultCalendarSource`'s primary calendar (iCloud → Local fallback). On
 * Android we look for any local-account calendar that's writable.
 */
async function getDefaultCalendarId(): Promise<string | null> {
  if (Platform.OS === "ios") {
    try {
      const defaultCal = await Calendar.getDefaultCalendarAsync();
      if (defaultCal?.id) return defaultCal.id;
    } catch {
      // Fall through to scanning.
    }
  }

  const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = all.find(
    (c) => c.allowsModifications && c.accessLevel !== Calendar.CalendarAccessLevel.READ
  );
  return writable?.id ?? null;
}
