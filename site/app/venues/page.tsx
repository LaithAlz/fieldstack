import type { Metadata } from "next";

import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { AppStoreButton } from "@/components/app-store-button";
import { PitchLines } from "@/components/pitch-lines";
import { VenueFinder, type FinderVenue } from "@/components/venue-finder";
import { getAllVenues, getVenuesByCity, surfaceLabel, sizeLabel, venuePriceState } from "@/lib/venues";
import { jsonLdScript } from "@/lib/safe";

const VENUES_TITLE = "Find Soccer Fields in the GTA: Indoor, Turf & Futsal | Onside";
const VENUES_DESCRIPTION =
  "Search and filter every soccer field in the Greater Toronto Area: indoor domes, turf, futsal, and outdoor pitches across Toronto, Mississauga, Brampton, Vaughan, Markham, Hamilton, and more. Free on Onside.";

export const metadata: Metadata = {
  title: VENUES_TITLE,
  description: VENUES_DESCRIPTION,
  alternates: { canonical: "https://getonside.ca/venues" },
  openGraph: {
    title: "Find your next pitch",
    description: "Search and filter every soccer field across the GTA, then book direct with the operator. Free on iPhone.",
    url: "https://getonside.ca/venues",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Find your next pitch",
    description: "Search and filter every soccer field across the GTA, then book direct with the operator. Free on iPhone.",
  },
};

export default async function VenuesIndex() {
  const all = await getAllVenues();
  const byCity = await getVenuesByCity();

  const finderVenues: FinderVenue[] = all.map((v) => ({
    slug: v.slug,
    name: v.name,
    city: v.city,
    surfaces: [...new Set(v.fields.map((f) => surfaceLabel(f.surface)))],
    sizes: [...new Set(v.fields.map((f) => sizeLabel(f.size)))],
    fieldCount: v.fields.length,
    price: venuePriceState(v),
  }));
  const cityNames = byCity.map(([c]) => c);

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListLd) }} />

      <header className="hero venues-hero">
        <div className="wrap">
          <div>
            <span className="eyebrow rise">Soccer fields · Greater Toronto Area</span>
            <h1 className="display rise d1">Find your<br />next pitch</h1>
            <p className="lede rise d2">
              {all.length > 0
                ? `Search and filter ${all.length} indoor domes, turf pitches, futsal courts, and outdoor fields across the GTA, then book direct with the operator.`
                : "Indoor domes, turf pitches, futsal courts, and outdoor fields across the Greater Toronto Area."}
            </p>
          </div>
        </div>
        <PitchLines className="pitch" />
      </header>

      {all.length === 0 ? (
        <section>
          <div className="wrap">
            <p className="muted-note">Field listings are coming soon.</p>
          </div>
        </section>
      ) : (
        <VenueFinder venues={finderVenues} cities={cityNames} />
      )}

      <section>
        <div className="band">
          <PitchLines className="pitch" />
          <h2 className="display">Get on the pitch</h2>
          <p>Download Onside and find a field near you in seconds.</p>
          <AppStoreButton />
        </div>
      </section>

      <Footer />
    </>
  );
}
