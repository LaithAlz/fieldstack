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
  return `${v.name} is a ${surfacePhrase}soccer field in ${v.city}, ON. See sizes, pricing, hours, and how to book on Onside.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const v = await getVenueBySlug(slug);
  if (!v) return { title: "Venue not found | Onside" };

  const title = `${v.name}: Soccer Field in ${v.city} | Onside`;
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
  const related = all.filter((x) => x.city === v.city && x.id !== v.id).slice(0, 6);

  const hasCoords = v.lat != null && v.lng != null;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name}, ${v.address}`)}`;
  // Free OpenStreetMap embed (no API key) — small bbox around the pin.
  const d = 0.006;
  const embedUrl = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${v.lng! - d}%2C${v.lat! - d}%2C${v.lng! + d}%2C${v.lat! + d}&layer=mapnik&marker=${v.lat}%2C${v.lng}`
    : null;

  const surfaces = [...new Set(v.fields.map((f) => surfaceLabel(f.surface)))];
  const sizes = [...new Set(v.fields.map((f) => sizeLabel(f.size)))];
  const prices = v.fields.map((f) => f.pricePerHour).filter((p): p is number => p != null);
  const priceFrom = prices.length ? Math.min(...prices) : null;
  const venueTypeLabel =
    v.venueType === "private" ? "Private facility" : v.venueType === "public" ? "Public park" : null;

  const facts: { label: string; value: string }[] = [
    { label: v.fields.length === 1 ? "Field" : "Fields", value: String(v.fields.length) },
    ...(surfaces.length ? [{ label: "Surface", value: surfaces.join(", ") }] : []),
    ...(sizes.length ? [{ label: "Sizes", value: sizes.join(", ") }] : []),
    ...(priceFrom != null ? [{ label: "From", value: `$${priceFrom}/hr` }] : []),
    ...(venueTypeLabel ? [{ label: "Type", value: venueTypeLabel }] : []),
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: v.name,
    description: summary(v),
    url: `https://getonside.ca/venues/${v.slug}`,
    address: { "@type": "PostalAddress", streetAddress: v.address, addressRegion: "ON", addressCountry: "CA" },
    ...(hasCoords ? { geo: { "@type": "GeoCoordinates", latitude: v.lat, longitude: v.lng } } : {}),
    ...(v.bookingUrl ? { sameAs: v.bookingUrl } : {}),
    sport: "Soccer",
    ...(v.amenities.length
      ? { amenityFeature: v.amenities.map((a) => ({ "@type": "LocationFeatureSpecification", name: a })) }
      : {}),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Soccer fields", item: "https://getonside.ca/venues" },
      { "@type": "ListItem", position: 2, name: v.city, item: `https://getonside.ca/venues` },
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
          <Link href="/venues">Find fields</Link>
          <span>›</span>
          <span>{v.city}</span>
        </nav>

        <header className="venue-head">
          <span className="eyebrow">Soccer field · {v.city}, ON</span>
          <h1 className="display">{v.name}</h1>
          <p className="venue-addr">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">📍 {v.address}</a>
          </p>
          {v.bookingUrl && (
            <div className="cta-row">
              <BookButton href={v.bookingUrl} venue={v.name} city={v.city}>
                Book on operator&apos;s site ↗
              </BookButton>
              <a className="btn-secondary" href={mapsUrl} target="_blank" rel="noopener noreferrer">
                Directions ↗
              </a>
            </div>
          )}
        </header>

        {/* Scannable quick facts */}
        <div className="quickfacts">
          {facts.map((f) => (
            <div className="qf" key={f.label}>
              <b>{f.value}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </div>

        <section className="venue-body">
          <div className="venue-main">
            {embedUrl && (
              <div className="venue-map">
                <iframe
                  src={embedUrl}
                  title={`Map showing ${v.name}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <a className="map-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  Open in Google Maps ↗
                </a>
              </div>
            )}

            <h2 className="sub">{v.fields.length === 1 ? "Field" : "Fields"} at this venue</h2>
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
                <h2 className="sub">Amenities</h2>
                <ul className="amenities">
                  {v.amenities.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </>
            )}
          </div>

          <aside className="venue-aside">
            <div className="aside-card">
              <h3>Play here</h3>
              <p>
                See {v.name} on the live map, check hours and reviews, and save it in the free Onside app.
              </p>
              <AppStoreButton />
            </div>
          </aside>
        </section>

        {related.length > 0 && (
          <section className="related">
            <h2 className="sub">More soccer fields in {v.city}</h2>
            <div className="related-grid">
              {related.map((r) => (
                <Link className="related-card" href={`/venues/${r.slug}`} key={r.id}>
                  <strong>{r.name}</strong>
                  <span>{[...new Set(r.fields.map((f) => surfaceLabel(f.surface)))].join(" · ") || "Soccer field"}</span>
                </Link>
              ))}
            </div>
            <p className="related-all"><Link href="/venues">← Back to all GTA soccer fields</Link></p>
          </section>
        )}
      </article>

      <Footer />
    </>
  );
}
