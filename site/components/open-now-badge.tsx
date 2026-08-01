"use client";

import { useEffect, useState } from "react";

import { isOpenNow, type VenueHours } from "@/lib/hours";

/**
 * "Open now" / "Closed" pill. Computed client-side from the current time so it
 * stays correct on a statically-generated page. Renders nothing on the server
 * (and until mounted) to avoid a hydration mismatch — the weekly schedule
 * beside it is server-rendered and carries the SEO content regardless.
 */
export function OpenNowBadge({ hours }: { hours: VenueHours }) {
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    setOpen(isOpenNow(hours, new Date()));
    const id = setInterval(() => setOpen(isOpenNow(hours, new Date())), 60_000);
    return () => clearInterval(id);
  }, [hours]);

  if (open === null) return null;
  return (
    <span className={`open-badge ${open ? "is-open" : "is-closed"}`}>
      {open ? "Open now" : "Closed"}
    </span>
  );
}
