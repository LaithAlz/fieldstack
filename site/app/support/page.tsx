import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Support | Onside",
  description:
    "Help with the Onside soccer-field app: accounts, booking, missing fields, deleting your account, and getting in touch.",
};

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Do I need an account?",
    a: (
      <>
        No. You can browse every field, filter, and open an operator&apos;s booking page without
        signing in. An account only adds saved favourites, a preferred time, posting reviews, and
        syncing across devices.
      </>
    ),
  },
  {
    q: "How do I book a field?",
    a: (
      <>
        Onside doesn&apos;t take bookings itself. Tapping &ldquo;Book on operator&apos;s site&rdquo;
        opens the field operator&apos;s own website, where you reserve and pay directly with them.
      </>
    ),
  },
  {
    q: "A field is missing or a detail is wrong.",
    a: (
      <>
        Email <a href="mailto:support@getonside.ca">support@getonside.ca</a> with the field name and
        what&apos;s off. We add and correct venues across the GTA regularly.
      </>
    ),
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        In the app: <strong>Me → Settings → Delete account</strong>. This permanently removes your
        account and personal data. Reviews you posted are kept but anonymized so venue ratings stay
        accurate.
      </>
    ),
  },
  {
    q: "How do I report a review or block a user?",
    a: (
      <>
        Open any review&apos;s &ldquo;⋯&rdquo; menu to report it or block its author. A blocked
        user&apos;s reviews stop appearing for you.
      </>
    ),
  },
  {
    q: "Why does the app want my location?",
    a: (
      <>
        Only to rank fields by distance and show how far each one is. You can use the app without it
        by picking an area manually.
      </>
    ),
  },
];

export default function Support() {
  return (
    <>
      <Nav />
      <article className="doc">
        <header className="doc-head">
          <Link className="back" href="/">← Back to Onside</Link>
          <h1 className="display">Support</h1>
          <p className="lede">
            Answers to the common questions, and a direct line if you need one. We usually reply
            within 1&ndash;2 business days.
          </p>
        </header>

        <div className="contact">
          <div className="contact-tile">
            <div className="ic" aria-hidden>✉️</div>
            <b>Email us</b>
            <p>Questions, bug reports, or a field we should add.</p>
            <div className="act">
              <a href="mailto:support@getonside.ca">support@getonside.ca</a>
            </div>
          </div>
          <div className="contact-tile">
            <div className="ic" aria-hidden>⚡</div>
            <b>Fastest fixes</b>
            <p>Most issues clear up by updating the app, then reopening it. Still stuck? Email us.</p>
          </div>
        </div>

        <h2>Frequently asked</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p className="faq-body">{f.a}</p>
            </details>
          ))}
        </div>

        <nav className="doc-foot">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </nav>
      </article>
      <Footer />
    </>
  );
}
