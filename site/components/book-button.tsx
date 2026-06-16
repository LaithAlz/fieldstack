"use client";

import { track } from "@vercel/analytics";

/**
 * Outbound "Book on operator site" CTA. Fires a `venue_book_click` analytics
 * event before sending the visitor to the operator — this is the intent/demand
 * signal we use to show operators how many ready-to-book players we send them.
 */
export function BookButton({
  href,
  venue,
  city,
  className = "btn-book",
  children,
}: {
  href: string;
  venue: string;
  city: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={className}
      onClick={() => track("venue_book_click", { venue, city })}
    >
      {children}
    </a>
  );
}
