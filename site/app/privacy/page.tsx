import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Privacy Policy | Onside",
  description:
    "What Onside collects, why, and the controls you have. We don't sell your data or track you across other apps.",
  alternates: { canonical: "/privacy" },
};

const COLLECT = [
  {
    ic: "👤",
    t: "Account info",
    d: "If you sign up, your email (or the Apple / Google identifier) and a display name. We never see your password; our provider handles sign-in.",
  },
  {
    ic: "🗂️",
    t: "Your activity",
    d: "Venues you save, your preferred play time, booking attempts, recently viewed venues, and reviews. It lives on your device and syncs to your account when signed in.",
  },
  {
    ic: "📍",
    t: "Location",
    d: "With permission, your location is used on-device to rank fields by distance. You can decline and pick an area by hand instead.",
  },
  {
    ic: "📊",
    t: "Diagnostics & usage",
    d: "Crash reports and anonymous events like screens viewed, so we can fix bugs and see what to improve.",
  },
];

export default function Privacy() {
  return (
    <>
      <Nav />
      <article className="doc">
        <header className="doc-head">
          <Link className="back" href="/">← Back to Onside</Link>
          <h1 className="display">Privacy Policy</h1>
          <p className="lede">
            What we collect, why, and the controls you have, in plain language.
          </p>
          <span className="doc-meta">Last updated June 15, 2026</span>
        </header>

        <div className="callout">
          <span className="k">The short version</span>
          <p>
            We collect only what runs the app, and keep it minimal. We don&apos;t sell your data,
            we don&apos;t track you across other apps, and you can delete everything from Settings
            whenever you want.
          </p>
        </div>

        <h2>What we collect</h2>
        <div className="info-grid">
          {COLLECT.map((c) => (
            <div className="info-card" key={c.t}>
              <div className="ic" aria-hidden>{c.ic}</div>
              <b>{c.t}</b>
              <p>{c.d}</p>
            </div>
          ))}
        </div>

        <h2>What we don&apos;t do</h2>
        <ul className="guard-list">
          <li>We don&apos;t sell your personal information.</li>
          <li>We don&apos;t track you across other companies&apos; apps or websites.</li>
          <li>
            We don&apos;t process payments. Bookings happen on each operator&apos;s own website,
            under their policies.
          </li>
        </ul>

        <h2>How we use it</h2>
        <p>
          To run the app&apos;s features (saving, syncing, reviews, distance ranking), to keep it
          stable (crash reports), and to understand which features get used so we can improve them.
        </p>

        <h2>Third parties</h2>
        <p>
          We rely on service providers who process data on our behalf: Supabase (account data and
          storage), Sentry (crash reporting), and PostHog (product analytics). Tapping a
          &ldquo;Book&rdquo; link opens an operator&apos;s own website, which has its own privacy
          policy.
        </p>

        <h2>Your choices &amp; rights</h2>
        <ul className="guard-list">
          <li>
            <strong>Delete your account and data</strong> any time in the app: Me → Settings →
            Delete account. Reviews you posted are kept but anonymized so venue ratings stay
            accurate.
          </li>
          <li>
            <strong>Clear local data</strong> from Me → Settings → Clear app data.
          </li>
          <li>
            <strong>Manage location</strong> permission in your device Settings.
          </li>
          <li>
            To request access to or deletion of your data, email{" "}
            <a href="mailto:support@getonside.ca">support@getonside.ca</a>.
          </li>
        </ul>

        <h2>Children</h2>
        <p>
          Onside isn&apos;t directed to children under 13, and we don&apos;t knowingly collect their
          personal information.
        </p>

        <h2>Changes</h2>
        <p>
          We&apos;ll update this page when our practices change and revise the date above. Questions?{" "}
          <a href="mailto:support@getonside.ca">support@getonside.ca</a>.
        </p>

        <nav className="doc-foot">
          <Link href="/support">Support</Link>
          <Link href="/terms">Terms of Service</Link>
        </nav>
      </article>
      <Footer />
    </>
  );
}
