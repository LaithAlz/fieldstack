import Link from "next/link";

import { getCities } from "@/lib/venues";

export async function Footer() {
  const cities = (await getCities()).slice(0, 8);
  return (
    <footer>
      <div className="wrap">
        <Link href="/" className="brandmark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.svg" alt="Onside" />
          <span className="name display">Onside</span>
        </Link>
        {cities.length > 0 && (
          <nav className="foot-cities" aria-label="Soccer fields by city">
            {cities.map((c) => (
              <Link key={c.slug} href={`/soccer-fields/${c.slug}`}>
                Soccer fields in {c.name}
              </Link>
            ))}
          </nav>
        )}
        <div className="foot-links">
          <Link href="/venues">Find fields</Link>
          <Link href="/support">Support</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="mailto:support@getonside.ca">Contact</a>
        </div>
        <p className="foot-legal">
          © 2026 Allaith Alzoubi. Onside is a field-discovery app; bookings are made
          directly with each field&apos;s operator.
        </p>
        <p className="foot-data">
          Field data from{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>{" "}
          contributors (ODbL), the Cities of{" "}
          <a href="https://open.toronto.ca/" target="_blank" rel="noopener noreferrer">Toronto</a>,{" "}
          <a href="https://data.mississauga.ca/" target="_blank" rel="noopener noreferrer">Mississauga</a>, and{" "}
          <a href="https://geohub.brampton.ca/" target="_blank" rel="noopener noreferrer">Brampton</a>{" "}
          (open data, Brampton under CC BY 4.0), and Google.
        </p>
      </div>
    </footer>
  );
}
