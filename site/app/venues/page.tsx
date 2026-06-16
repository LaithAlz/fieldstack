import type { Metadata } from "next";
import Link from "next/link";

import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { AppStoreButton } from "@/components/app-store-button";
import { PitchLines } from "@/components/pitch-lines";
import { getAllVenues, getVenuesByCity, surfaceLabel } from "@/lib/venues";

export const metadata: Metadata = {
  title: "Soccer Fields in the GTA — Indoor, Turf & Futsal | Onside",
  description:
    "Browse every soccer field in the Greater Toronto Area: indoor domes, turf, futsal, and outdoor pitches across Toronto, Mississauga, Brampton, Vaughan, Markham, Hamilton, and more. Free on Onside.",
  alternates: { canonical: "https://getonside.ca/venues" },
};

export default async function VenuesIndex() {
  const all = await getAllVenues();
  const byCity = await getVenuesByCity();

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Soccer fields in the Greater Toronto Area",
    numberOfItems: all.length,
    itemListElement: all.slice(0, 100).map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://getonside.ca/venues/${v.slug}`,
      name: v.name,
    })),
  };

  return (
    <>
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />

      <header className="hero venues-hero">
        <div className="wrap">
          <div>
            <span className="eyebrow rise">Soccer fields · Greater Toronto Area</span>
            <h1 className="display rise d1">Every soccer field<br />in the GTA</h1>
            <p className="lede rise d2">
              {all.length > 0
                ? `${all.length} indoor domes, turf pitches, futsal courts, and outdoor fields across the Greater Toronto Area — browse by city, then book direct with the operator.`
                : "Indoor domes, turf pitches, futsal courts, and outdoor fields across the Greater Toronto Area."}
            </p>
            <div className="cta-row rise d3">
              <AppStoreButton />
              <span className="cta-note">Free · iPhone · No account needed to browse</span>
            </div>
          </div>
        </div>
        <PitchLines className="pitch" />
      </header>

      {byCity.length === 0 ? (
        <section>
          <div className="wrap">
            <p style={{ color: "var(--ink-2)" }}>Field listings are coming soon.</p>
          </div>
        </section>
      ) : (
        <section className="venues-index">
          <div className="wrap">
            {byCity.map(([city, venues]) => (
              <div className="city-block" key={city} id={slugAnchor(city)}>
                <h2 className="display sub">
                  Soccer fields in {city} <span className="count">{venues.length}</span>
                </h2>
                <div className="venue-grid">
                  {venues.map((v) => (
                    <Link className="venue-card" href={`/venues/${v.slug}`} key={v.id}>
                      <strong>{v.name}</strong>
                      <span className="vc-meta">
                        {[...new Set(v.fields.map((f) => surfaceLabel(f.surface)))].join(" · ") || "Soccer field"}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="band">
          <h2 className="display">Get on the pitch</h2>
          <p>Download Onside and find a field near you in seconds.</p>
          <AppStoreButton />
        </div>
      </section>

      <Footer />
    </>
  );
}

function slugAnchor(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
