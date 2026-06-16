import Link from "next/link";

export function Nav() {
  return (
    <nav className="nav">
      <div className="wrap">
        <Link href="/" className="brandmark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.svg" alt="Onside" />
          <span className="name display">Onside</span>
        </Link>
        <div className="nav-links">
          <Link href="/venues">Find fields</Link>
          <a href="/#features">Features</a>
          <Link href="/support">Support</Link>
          <a href="/#get">Get the app</a>
        </div>
      </div>
    </nav>
  );
}
