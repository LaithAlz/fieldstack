import Link from "next/link";

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <Link href="/" className="brandmark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.svg" alt="Onside" />
          <span className="name display">Onside</span>
        </Link>
        <div className="foot-links">
          <Link href="/support">Support</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="mailto:support@getonside.ca">Contact</a>
        </div>
        <p className="foot-legal">
          © 2026 Allaith Alzoubi. Onside is a field-discovery app; bookings are made
          directly with each field&apos;s operator.
        </p>
      </div>
    </footer>
  );
}
