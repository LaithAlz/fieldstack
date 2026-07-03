import type { Metadata } from "next";

import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { AppStoreButton } from "@/components/app-store-button";
import { PitchLines } from "@/components/pitch-lines";
import { getAllVenues, getVenuesByCity } from "@/lib/venues";

// Title/description inherit from the root layout; this only pins the
// homepage canonical.
export const metadata: Metadata = { alternates: { canonical: "/" } };

const FEATURES = [
  { ic: "⚽", h: "Every field, one map", p: "Indoor domes, outdoor turf, grass parks, and futsal courts across the GTA, as a list or a live map." },
  { ic: "⚙", h: "Filter to what fits", p: "Surface, size from 5-a-side to 11-a-side, and price. See distance, hours, amenities, and photos at a glance." },
  { ic: "↗", h: "Book direct", p: "One tap takes you to the operator's own booking page. You always reserve straight with the field." },
  { ic: "♥", h: "Save your spots", p: "Keep the fields you play at, set your usual day and time once, and pick up where you left off." },
  { ic: "★", h: "Real reviews", p: "See what other local players say about a pitch before you commit, and add your own." },
  { ic: "⚡", h: "Built for last-minute", p: "Made for pickup organizers and league captains chasing a free slot tonight. Free to use." },
];

const SHOTS = [
  ["/screens/01-explore.png", "Explore venues"],
  ["/screens/02-venue-detail.png", "Venue detail"],
  ["/screens/03-field-search.png", "Field search and filters"],
  ["/screens/04-profile.png", "Your profile"],
];

export default async function Home() {
  const venues = await getAllVenues();
  const cities = await getVenuesByCity();
  const count = venues.length;

  return (
    <>
      <Nav />

      <header className="hero">
        <div className="wrap">
          <div>
            <span className="eyebrow rise">Soccer fields · Greater Toronto Area</span>
            <h1 className="display rise d1">
              Find your<br />
              <span className="swipe">next pitch.</span>
            </h1>
            <p className="lede rise d2">
              Every soccer field in the GTA, in one app. Browse turf, indoor, and outdoor
              pitches, filter by size and price, and book direct with the operator.
            </p>
            <p className="stat-line rise d2">
              {count > 0 && <b>{count}</b>}
              <span>{count > 0 ? "venues mapped" : "Every venue in the city"}</span>
              <i className="dot" />
              <span>one map</span>
              <i className="dot" />
              <span>free</span>
            </p>
            <div className="cta-row rise d3" id="get">
              <AppStoreButton />
              <span className="cta-note">Free · iPhone · No account needed to browse</span>
            </div>
          </div>
          <div className="hero-art rise d2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/screens/01-explore.png" alt="Onside app showing soccer venues across the GTA" />
          </div>
        </div>
        <PitchLines className="pitch" />
      </header>

      {count > 0 && (
        <section className="stats">
          <div className="wrap">
            <div className="stat"><b>{count}</b><span>venues across the GTA</span></div>
            <div className="stat"><b>{cities.length}</b><span>cities &amp; areas covered</span></div>
            <div className="stat"><b>$0</b><span>free to browse &amp; book direct</span></div>
          </div>
        </section>
      )}

      <section id="features">
        <div className="wrap">
          <div className="section-head">
            <h2 className="display">Stop texting around <span className="accent">for a field</span></h2>
            <p>One place for every pitch in the city, with the details that actually decide where you play.</p>
          </div>
          <div className="features">
            {FEATURES.map((f) => (
              <div className="feature" key={f.h}>
                <div className="ic">{f.ic}</div>
                <h3>{f.h}</h3>
                <p>{f.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shots">
        <div className="wrap">
          <div className="section-head">
            <h2 className="display">A look inside</h2>
          </div>
          <div className="shot-strip">
            {SHOTS.map(([src, alt]) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt={alt} />
            ))}
          </div>
        </div>
      </section>

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
