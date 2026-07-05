// Shared date/time formatting helpers. Hoisted out of the booking sheets +
// DateTimeRangePicker once a third caller needed the same logic.

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** "HH:mm" 24h → "H:MM AM/PM" (omits ":00" → "H AM/PM"-style is the caller's choice). */
export function formatTime12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const hour12 = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour12}:${pad(m)} ${ampm}`;
}

/** Start time + duration → end time in 12h display form. Wraps past midnight. */
export function formatEndTime(startTime24: string, durationHours: number): string {
  const [h, m] = startTime24.split(":").map(Number);
  const totalMinutes = h * 60 + m + Math.round(durationHours * 60);
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return formatTime12h(`${pad(endH)}:${pad(endM)}`);
}

/** 1 → "1 hour"; 1.5 → "1.5 hours"; 2 → "2 hours". */
export function formatDurationHours(hours: number): string {
  if (hours === 1) return "1 hour";
  return `${hours} hours`;
}

/** "Today" / "Tomorrow" / "Sat, Jul 5" relative to `now` (defaults to real now). */
export function formatRelativeDateLabel(date: Date, now: Date = new Date()): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === tomorrow.getTime()) return "Tomorrow";
  return target.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Full slot label for reserve-bar sublines, e.g. "Today · 7:00 PM – 8:30 PM".
 * Both detail screens' reserve bars need this exact "relative date + time
 * range" shape, so it's hoisted here per this module's own convention (see
 * file header) rather than duplicated a fourth time.
 */
export function formatSlotRange(
  date: Date,
  startTime: string,
  durationHours: number,
  now?: Date
): string {
  return `${formatRelativeDateLabel(date, now)} · ${formatTime12h(startTime)} – ${formatEndTime(startTime, durationHours)}`;
}
