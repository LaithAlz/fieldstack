import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Privacy Policy | Onside",
};

export default function Privacy() {
  return (
    <>
      <article className="doc">
        <Link className="back" href="/">← Onside</Link>
        <h1 className="display">Privacy Policy</h1>
        <p className="updated">Last updated: June 15, 2026</p>

        <p>
          Onside (“we”, “us”) makes a mobile app for discovering soccer fields in the Greater
          Toronto Area. This policy explains what we collect, why, and your choices. Questions:{" "}
          <a href="mailto:support@getonside.ca">support@getonside.ca</a>.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Account info.</strong> If you create an account, your email address (or the identifier from Sign in with Apple / Google) and a display name. We never see your password; authentication is handled by our provider.</li>
          <li><strong>Your activity in the app.</strong> Venues you save, your preferred play time, booking attempts, recently viewed venues, and any reviews you post. Saved data lives on your device and, when signed in, syncs to your account.</li>
          <li><strong>Location.</strong> If you grant permission, your approximate or precise location is used on-device to rank fields by distance. You can decline and choose an area manually.</li>
          <li><strong>Diagnostics &amp; usage.</strong> Crash reports and anonymous product-usage events such as screens viewed, to fix bugs and improve the app.</li>
        </ul>

        <h2>What we don&apos;t do</h2>
        <ul>
          <li>We don&apos;t sell your personal information.</li>
          <li>We don&apos;t track you across other companies&apos; apps or websites.</li>
          <li>We don&apos;t process payments. Bookings happen on each field operator&apos;s own website, under their policies.</li>
        </ul>

        <h2>How we use it</h2>
        <p>To run the app&apos;s features (saving, syncing, reviews, distance ranking), to keep it stable (crash reports), and to understand which features are used so we can improve them.</p>

        <h2>Third parties</h2>
        <p>We rely on service providers who process data on our behalf: Supabase (account data and storage), Sentry (crash reporting), and PostHog (product analytics). Tapping a “Book” link opens a field operator&apos;s own website, which has its own privacy policy.</p>

        <h2>Your choices &amp; rights</h2>
        <ul>
          <li><strong>Delete your account and data</strong> any time: in the app, Me → Settings → Delete account. Reviews you posted are retained but anonymized so venue ratings remain accurate.</li>
          <li><strong>Clear local data</strong>: Me → Settings → Clear app data.</li>
          <li><strong>Location</strong>: manage permission in your device Settings.</li>
          <li>To request access to or deletion of your data, email <a href="mailto:support@getonside.ca">support@getonside.ca</a>.</li>
        </ul>

        <h2>Children</h2>
        <p>Onside is not directed to children under 13, and we don&apos;t knowingly collect their personal information.</p>

        <h2>Changes</h2>
        <p>We&apos;ll update this page when our practices change and revise the date above.</p>

        <p style={{ marginTop: 32 }}>
          <Link href="/support">Support</Link> · <Link href="/terms">Terms of Service</Link>
        </p>
      </article>
      <Footer />
    </>
  );
}
