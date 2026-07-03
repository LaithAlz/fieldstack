import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { AppStoreButton } from "@/components/app-store-button";
import { PitchLines } from "@/components/pitch-lines";
import {
  getCities,
  getCityBySlug,
  surfaceLabel,
  sizeLabel,
  type Venue,
} from "@/lib/venues";

// The pSEO play for "indoor soccer <city>" / "soccer fields <city>" — one
// static page per city with enough venues to not be thin. Statically
// generated at build like the venue pages; unknown slugs 404.
export const dynamicParams = false;

export async function generateStaticParams() {
  const cities = await getCities();
  return cities.map((c) => ({ city: c.slug }));
}

type Props = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params;
  const city = await getCityBySlug(slug);
  if (!city) return {};
  const indoor = countIndoor(city.venues);
  return {
    title: `Soccer Fields in ${city.name}: Indoor, Turf & Outdoor | Onside`,
    description: `${city.venues.length} soccer ${
      city.venues.length === 1 ? "venue" : "venues"
    } in ${city.name}${
      indoor > 0 ? `, including ${indoor} indoor` : ""
    } — with surfaces, sizes, prices, and direct links to each operator's booking page. Free on Onside.`,
    alternates: { canonical: `/soccer-fields/${city.slug}` },
    openGraph: {
      title: `Soccer fields in ${city.name}`,
      description: `Every soccer field in ${city.name} on one map. Free on iPhone.`,
      url: `https://getonside.ca/soccer-fields/${city.slug}`,
      type: "website",
    },
  };
}

function countIndoor(venues: Venue[]): number {
  return venues.filter((v) =>
    v.fields.some((f) => f.surface === "indoor" || f.surface === "turf")
  ).length;
}

export default async function CityPage({ params }: Props) {
  const { city: slug } = await params;
  const city = await getCityBySlug(slug);
  if (!city) notFound();

  const { name, venues } = city;
  const cities = await getCities();
  const others = cities.filter((c) => c.slug !== slug).slice(0, 8);

  const prices = venues
    .flatMap((v) => v.fields.map((f) => f.pricePerHour))
    .filter((p): p is number => p != null);
  const priceFrom = prices.length ? Math.min(...prices) : null;
  const indoor = countIndoor(venues);

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Soccer fields in ${name}`,
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 100).map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://getonside.ca/venues/${v.slug}`,
      name: v.name,
    })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Onside", item: "https://getonside.ca" },
      { "@type": "ListItem", position: 2, name: "Fields", item: "https://getonside.ca/venues" },
      {
        "@type": "ListItem",
        position: 3,
        name: name,
        item: `https://getonside.ca/soccer-fields/${slug}`,
      },
    ],
  };

  return (
    <>
      <Nav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <header className="hero venues-hero">
        <div className="wrap">
          <div>
            <span className="eyebrow rise">Soccer fields · {name}</span>
            <h1 className="display rise d1">
              Soccer fields<br />in {name}
            </h1>
            <p className="lede rise d2">
              {venues.length} {venues.length === 1 ? "venue" : "venues"} in{" "}
              {name}
              {indoor > 0 ? `, ${indoor} with indoor or turf fields` : ""}
              {priceFrom != null ? `, from $${priceFrom}/hr` : ""}. Browse
              surfaces, sizes, and prices, then book direct with the operator.
            </p>
          </div>
        </div>
        <PitchLines className="pitch" />
      </header>

      <section className="finder">
        <div className="wrap">
          <div className="city-block">
            <div className="venue-grid">
              {venues.map((v) => {
                const surfaces = [
                  ...new Set(v.fields.map((f) => surfaceLabel(f.surface))),
                ];
                const sizes = [
                  ...new Set(v.fields.map((f) => sizeLabel(f.size))),
                ];
                const vPrices = v.fields
                  .map((f) => f.pricePerHour)
                  .filter((p): p is number => p != null);
                const from = vPrices.length ? Math.min(...vPrices) : null;
                return (
                  <Link
                    className="venue-card"
                    href={`/venues/${v.slug}`}
                    key={v.slug}
                  >
                    <div className="vc-top">
                      <strong>{v.name}</strong>
                      <span className="vc-city">{v.city}</span>
                    </div>
                    {surfaces.length > 0 && (
                      <div className="vc-badges">
                        {surfaces.map((s) => (
                          <span className="badge" key={s}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="vc-foot">
                      <span className="vc-meta">
                        {v.fields.length}{" "}
                        {v.fields.length === 1 ? "field" : "fields"}
                        {sizes.length ? ` · ${sizes.join(", ")}` : ""}
                      </span>
                      {from != null && (
                        <span className="vc-price">from ${from}/hr</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {others.length > 0 && (
            <div className="city-block">
              <h2 className="sub">Nearby cities</h2>
              <p style={{ color: "var(--text-2)" }}>
                {others.map((c, i) => (
                  <span key={c.slug}>
                    {i > 0 ? " · " : ""}
                    <Link href={`/soccer-fields/${c.slug}`}>
                      Soccer fields in {c.name}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="band">
          <PitchLines className="pitch" />
          <h2 className="display">Playing in {name} tonight?</h2>
          <p>
            Onside maps every field in {name} with live filters for surface,
            size, and price — free on iPhone.
          </p>
          <AppStoreButton />
        </div>
      </section>

      <Footer />
    </>
  );
}
