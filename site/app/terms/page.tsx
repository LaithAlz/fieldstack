import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Terms of Service | Onside",
};

export default function Terms() {
  return (
    <>
      <article className="doc">
        <Link className="back" href="/">← Onside</Link>
        <h1 className="display">Terms of Service</h1>
        <p className="updated">Last updated: June 15, 2026</p>

        <p>By using the Onside app (“the app”) you agree to these terms. If you don&apos;t agree, please don&apos;t use the app.</p>

        <h2>What Onside is</h2>
        <p>Onside is a directory for discovering soccer fields in the Greater Toronto Area. It shows venue information and links you to each field operator&apos;s own website to book. We are not a party to any booking, payment, or rental. Those are strictly between you and the operator, under the operator&apos;s terms.</p>

        <h2>Accuracy of listings</h2>
        <p>We work to keep venue details (prices, hours, surfaces, availability) accurate, but they&apos;re sourced from public and operator-provided data and can change or be wrong. Always confirm details on the operator&apos;s site before relying on them. Onside is provided “as is,” without warranties.</p>

        <h2>Your account</h2>
        <p>You&apos;re responsible for activity under your account and for keeping your sign-in secure. You can delete your account any time from Me → Settings → Delete account.</p>

        <h2>Reviews and content</h2>
        <p>You&apos;re responsible for content you post. Don&apos;t post anything unlawful, abusive, misleading, or that infringes others&apos; rights. We may remove content and may suspend accounts that violate these terms. Reported content is reviewed; users can be blocked. Reviews posted by deleted accounts are retained in anonymized form.</p>

        <h2>Acceptable use</h2>
        <p>Don&apos;t misuse the app: no scraping, reverse engineering, interfering with its operation, or using it to break the law.</p>

        <h2>Limitation of liability</h2>
        <p>To the fullest extent permitted by law, Onside is not liable for any indirect or consequential damages, or for issues arising from your dealings with field operators. The app is provided without warranty of any kind.</p>

        <h2>Changes</h2>
        <p>We may update these terms; continued use after an update means you accept the revised terms.</p>

        <h2>Contact</h2>
        <p>Questions about these terms: <a href="mailto:support@getonside.ca">support@getonside.ca</a>.</p>

        <p style={{ marginTop: 32 }}>
          <Link href="/support">Support</Link> · <Link href="/privacy">Privacy Policy</Link>
        </p>
      </article>
      <Footer />
    </>
  );
}
