/**
 * Tiny formatter for "data last refreshed X ago" badges. The visible text
 * deliberately stays vague — exact timestamps don't help the user, and
 * over-precise stamps ("3h 12m") feel anxious. Day-granularity past the
 * "hours ago" window is enough to set expectations.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Formats an ISO timestamp as a short "updated X ago" string. Returns null
 * when the input is missing, malformed, or in the future (clock skew).
 */
export function formatScrapedAgo(
  iso: string | null | undefined,
  now: number = Date.now()
): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const diff = now - ts;
  if (diff < 0) return null;
  if (diff < HOUR_MS) return "Updated just now";
  if (diff < DAY_MS) {
    const hours = Math.floor(diff / HOUR_MS);
    return `Updated ${hours}h ago`;
  }
  const days = Math.floor(diff / DAY_MS);
  if (days === 1) return "Updated yesterday";
  if (days < 7) return `Updated ${days}d ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "Updated 1w ago" : `Updated ${weeks}w ago`;
  }
  return "Updated 30+ days ago";
}
