import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { AppStoreButton } from "@/components/app-store-button";
import { BookButton } from "@/components/book-button";
import {
  getAllVenues,
  getVenueBySlug,
  surfaceLabel,
  sizeLabel,
  priceLabel,
  type Venue,
} from "@/lib/venues";

export const dynamicParams = false;

export async function generateStaticParams() {
  const venues = await getAllVenues();
  return venues.map((v) => ({ slug: v.slug }));
}

function summary(v: Venue): string {
  const surfaces = [...new Set(v.fields.map((f) => surfaceLabel(f.surface)))];
  const surfacePhrase = surfaces.length ? surfaces.join(" & ").toLowerCase() + " " : "";
  return `${v.name} in ${v.city}, ON — ${surfacePhrase}soccer field details, sizes, pricing, and booking. Find and book this pitch on Onside.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const v = await getVenueBySlug(slug);
  if (!v) return { title: "Venue not found — Onside" };

  const title = `${v.name} — Soccer Field in ${v.city} | Onside`;
  const description = summary(v);
  const url = `https://getonside.ca/venues/${v.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
}

export default async function VenuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const v = await getVenueBySlug(slug);
  if (!v) notFound();

  const all = await getAllVenues();
  const related = all
    .filter((x) => x.city === v.city && x.id !== v.id)
    .slice(0, 6);

  const mapsUrl = v.lat != null && v.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name}, ${v.address}`)}`;

  const surfaces = [...new Set(v.fields.map((f) => surfaceLabel(f.surface)))];
  const sizes = [...new Set(v.fields.map((f) => sizeLabel(f.size)))];

  // JSON-LD: SportsActivityLocation for rich results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: v.name,
    description: summary(v),
    url: `https://getonside.ca/venues/${v.slug}`,
    address: { "@type": "PostalAddress", streetAddress: v.address, addressRegion: "ON", addressCountry: "CA" },
    ...(v.lat != null && v.lng != null
      ? { geo: { "@type": "GeoCoordinates", latitude: v.lat, longitude: v.lng } }
      : {}),
    ...(v.bookingUrl ? { sameAs: v.bookingUrl } : {}),
    sport: "Soccer",
    ...(v.amenities.length ? { amenityFeature: v.amenities.map((a) => ({ "@type": "LocationFeatureSpecification", name: a })) } : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Soccer fields", item: "https://getonside.ca/venues" },
      { "@type": "ListItem", position: 2, name: v.city, item: `https://getonside.ca/venues?city=${encodeURIComponent(v.city)}` },
      { "@type": "ListItem", position: 3, name: v.name, item: `https://getonside.ca/venues/${v.slug}` },
    ],
  };

  return (
    <>
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <article className="venue">
        <nav className="crumbs">
          <Link href="/venues">Soccer fields</Link>
          <span>›</span>
          <Link href={`/venues?city=${encodeURIComponent(v.city)}`}>{v.city}</Link>
        </nav>

        <header className="venue-head">
          <span className="eyebrow">Soccer field · {v.city}, ON</span>
          <h1 className="display">{v.name}</h1>
          <p className="venue-addr">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">{v.address} ↗</a>
          </p>
          <div className="venue-tags">
            {v.venueType && <span className="tag">{v.venueType === "private" ? "Private facility" : v.venueType === "public" ? "Public park" : v.venueType}</span>}
            {surfaces.map((s) => <span className="tag" key={s}>{s}</span>)}
            {sizes.map((s) => <span className="tag" key={s}>{s}</span>)}
          </div>
          {v.bookingUrl && (
            <div className="cta-row">
              <BookButton href={v.bookingUrl} venue={v.name} city={v.city}>
                Book on operator&apos;s site ↗
              </BookButton>
            </div>
          )}
        </header>

        <section className="venue-body">
          <div className="venue-main">
            <h2 className="display sub">Fields at {v.name}</h2>
            <div className="field-list">
              {v.fields.map((f) => (
                <div className="field-row" key={f.id}>
                  <div>
                    <strong>{f.name}</strong>
                    <span className="field-meta">{surfaceLabel(f.surface)} · {sizeLabel(f.size)}</span>
                  </div>
                  <div className="field-right">
                    {priceLabel(f) && <span className="field-price">{priceLabel(f)}</span>}
                    {f.bookingUrl && (
                      <BookButton href={f.bookingUrl} venue={v.name} city={v.city} className="field-book">
                        Book ↗
                      </BookButton>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {v.amenities.length > 0 && (
              <>
                <h2 className="display sub">Amenities</h2>
                <ul className="amenities">
                  {v.amenities.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </>
            )}

            <div className="venue-prose">
              <h2 className="display sub">About this field</h2>
              <p>
                {v.name} is a soccer {v.venueType === "private" ? "facility" : "field"} in {v.city}, Ontario, with{" "}
                {v.fields.length} {v.fields.length === 1 ? "playable field" : "playable fields"}
                {surfaces.length ? ` (${surfaces.join(", ").toLowerCase()})` : ""}. Browse it on the Onside app to
                see it on the map, check distance and hours, read reviews from local players, and book direct with
                the operator. Onside is a free directory of every soccer field across the Greater Toronto Area.
              </p>
            </div>
          </div>

          <aside className="venue-aside">
            <div className="aside-card">
              <h3 className="display">Get directions</h3>
              <a className="btn-secondary" href={mapsUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
            </div>
            <div className="aside-card">
              <h3 className="display">Play here</h3>
              <p>Find {v.name} and every other GTA pitch in the Onside app.</p>
              <AppStoreButton />
            </div>
          </aside>
        </section>

        {related.length > 0 && (
          <section className="related">
            <h2 className="display sub">More soccer fields in {v.city}</h2>
            <div className="related-grid">
              {related.map((r) => (
                <Link className="related-card" href={`/venues/${r.slug}`} key={r.id}>
                  <strong>{r.name}</strong>
                  <span>{[...new Set(r.fields.map((f) => surfaceLabel(f.surface)))].join(" · ")}</span>
                </Link>
              ))}
            </div>
            <p className="related-all"><Link href="/venues">Browse all GTA soccer fields →</Link></p>
          </section>
        )}
      </article>

      <Footer />
    </>
  );
}
