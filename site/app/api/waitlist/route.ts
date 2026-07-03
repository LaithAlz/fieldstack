import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Waitlist capture. Inserts into the `waitlist` table that has existed since
 * migration 001 (RLS: anon may insert, nobody may read — reads are
 * service-role only from private tooling). Runs server-side so the env vars
 * stay out of the client bundle; the anon key + RLS make the write safe.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    body && typeof body === "object" && typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";
  const city =
    body && typeof body === "object" && typeof (body as { city: unknown }).city === "string"
      ? (body as { city: string }).city.trim().slice(0, 80)
      : null;

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase
    .from("waitlist")
    .insert({ email, city, source: "site" });

  // 23505 = unique_violation on lower(email): already signed up. That's a
  // success from the visitor's point of view — don't leak membership either.
  if (error && error.code !== "23505") {
    return NextResponse.json(
      { error: "Something went wrong. Try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
