"use client";

import { useState, type FormEvent } from "react";
import { track } from "@vercel/analytics";

type Status = "idle" | "sending" | "done" | "error";

/**
 * Email capture for the visitors the App Store button loses: Android users
 * and the not-right-now crowd. Posts to /api/waitlist (anon-insert RLS table).
 */
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setStatus("done");
        track("waitlist_joined");
      } else {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Try again.");
    }
  };

  if (status === "done") {
    return (
      <p className="waitlist-done" role="status">
        You&apos;re on the list. We&apos;ll email you when it&apos;s your turn to play.
      </p>
    );
  }

  return (
    <form className="waitlist" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="waitlist-email">
        Email address
      </label>
      <input
        id="waitlist-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === "sending"}
      />
      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Joining…" : "Notify me"}
      </button>
      {message ? <span className="waitlist-err">{message}</span> : null}
    </form>
  );
}
