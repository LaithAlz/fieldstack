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
import { Alert, AppState, Linking, Platform } from "react-native";

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

// ---------------------------------------------------------------------------
// Booking-handoff prompt
// ---------------------------------------------------------------------------

export type CalendarPromptArgs = {
  venueName: string;
  venueAddress: string | null | undefined;
  operatorName: string;
  startDate: Date;
  durationHours: number;
  /** Toast surface — called with a user-facing message + severity. */
  onResult: (message: string, type: "success" | "error" | "info") => void;
};

/**
 * Show the "Add to calendar?" Alert. Booking handoff opens the operator's
 * URL via Linking, which on iOS resolves *as soon as the URL is dispatched*
 * — not when the user returns. Showing the Alert immediately would put it
 * behind the in-app browser. We defer until the AppState flips back to
 * `active`, so the dialog only appears once the user is looking at the app.
 *
 * Hoisted out of the two booking sheets once a second copy of the same
 * function appeared — three copies (Profile's "rebook" idea) is the next
 * smell that'd push us to bake this into a hook.
 */
export function promptAddToCalendarOnReturn(args: CalendarPromptArgs): void {
  const present = () => presentCalendarAlert(args);

  // If the app is already active when this is called (rare — handoff usually
  // backgrounds the app), show immediately. Otherwise wait for the foreground
  // transition.
  if (AppState.currentState === "active") {
    present();
    return;
  }

  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      sub.remove();
      present();
    }
  });

  // Safety: if the user never returns within 5 minutes, drop the listener.
  setTimeout(() => sub.remove(), 5 * 60 * 1000);
}

function presentCalendarAlert(args: CalendarPromptArgs): void {
  Alert.alert(
    "Add to your calendar?",
    "We'll save the slot you just opened on the operator's site so it doesn't slip your mind.",
    [
      { text: "Not now", style: "cancel" },
      {
        text: "Add",
        onPress: async () => {
          try {
            const ok = await addEventToCalendar({
              title: `Soccer at ${args.venueName}`,
              startDate: args.startDate,
              durationHours: args.durationHours,
              location: args.venueAddress ?? undefined,
              notes: `Booked through ${args.operatorName} · added from FieldStack`,
            });
            if (ok) {
              args.onResult("Added to your calendar.", "success");
              return;
            }
            // Permission was denied — offer a one-tap path to Settings so
            // the user isn't stranded digging through OS settings manually.
            Alert.alert(
              "Calendar access is off",
              "Enable it in Settings to let FieldStack add events.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Open Settings",
                  onPress: () => {
                    Linking.openSettings().catch(() => undefined);
                  },
                },
              ]
            );
          } catch {
            args.onResult("Couldn't add to your calendar.", "error");
          }
        },
      },
    ]
  );
}

export function combineDateAndTime(date: Date, time24: string): Date {
  const [h, m] = time24.split(":").map(Number);
  const out = new Date(date);
  out.setHours(h, m, 0, 0);
  return out;
}
