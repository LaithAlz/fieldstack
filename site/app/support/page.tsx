import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Support | Onside",
  description: "Help and support for the Onside soccer-field app.",
};

export default function Support() {
  return (
    <>
      <article className="doc">
        <Link className="back" href="/">← Onside</Link>
        <h1 className="display">Support</h1>
        <p className="updated">We usually reply within 1–2 business days.</p>

        <div className="contact-card">
          <p style={{ marginBottom: 6 }}><strong>Email us</strong></p>
          <p style={{ marginBottom: 0 }}>
            <a href="mailto:support@getonside.ca">support@getonside.ca</a> for questions, bug
            reports, or a field we should add.
          </p>
        </div>

        <h2>Frequently asked</h2>

        <h3>Do I need an account?</h3>
        <p>
          No. You can browse every field, filter, and open an operator&apos;s booking page
          without signing in. An account only adds saving favourites, a preferred time,
          posting reviews, and syncing across devices.
        </p>

        <h3>How do I book a field?</h3>
        <p>
          Onside doesn&apos;t take bookings itself. Tapping “Book on operator&apos;s site”
          opens the field operator&apos;s own website, where you reserve and pay directly
          with them.
        </p>

        <h3>A field is missing or the details are wrong.</h3>
        <p>
          Email <a href="mailto:support@getonside.ca">support@getonside.ca</a> with the field
          name and what&apos;s off. We add and correct venues across the GTA regularly.
        </p>

        <h3>How do I delete my account?</h3>
        <p>
          In the app: <strong>Me → Settings → Delete account</strong>. This permanently
          removes your account and personal data. Reviews you posted are kept but anonymized
          so venue ratings stay accurate.
        </p>

        <h3>How do I report a review or block a user?</h3>
        <p>
          Open any review&apos;s “⋯” menu to report it or block its author. Blocked users&apos;
          reviews stop appearing for you.
        </p>

        <h3>Why does the app want my location?</h3>
        <p>
          Only to rank fields by distance and show how far each one is. You can use the app
          without granting location by picking an area manually.
        </p>

        <p style={{ marginTop: 32 }}>
          <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link>
        </p>
      </article>
      <Footer />
    </>
  );
}
