import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { AppStoreButton } from "@/components/app-store-button";

const FEATURES = [
  { ic: "⚽", h: "Every field, one map", p: "Indoor domes, outdoor turf, grass parks, and futsal courts across the GTA — as a list or a live map." },
  { ic: "⚙", h: "Filter to what fits", p: "Surface, size from 5-a-side to 11-a-side, and price. See distance, hours, amenities, and photos at a glance." },
  { ic: "↗", h: "Book direct", p: "One tap takes you to the operator's own booking page — you always reserve straight with the field." },
  { ic: "♥", h: "Save your spots", p: "Keep the fields you play at, set your usual day and time once, and pick up where you left off." },
  { ic: "★", h: "Real reviews", p: "See what other local players say about a pitch before you commit — and add your own." },
  { ic: "⚡", h: "Built for last-minute", p: "Made for pickup organizers and league captains chasing a free slot tonight. Free to use." },
];

const SHOTS = [
  ["/screens/01-explore.png", "Explore venues"],
  ["/screens/02-venue-detail.png", "Venue detail"],
  ["/screens/03-field-search.png", "Field search and filters"],
  ["/screens/04-profile.png", "Your profile"],
];

export default function Home() {
  return (
    <>
      <Nav />

      <header className="hero">
        <div className="wrap">
          <div>
            <span className="eyebrow">Soccer fields · Greater Toronto Area</span>
            <h1 className="display">
              Find your
              <br />
              next pitch.
            </h1>
            <p className="lede">
              Every soccer field in the GTA, in one app. Browse turf, indoor, and outdoor
              pitches, filter by size and price, and book direct with the operator.
            </p>
            <div className="cta-row" id="get">
              <AppStoreButton />
              <span className="cta-note">Free · iPhone · No account needed to browse</span>
            </div>
          </div>
          <div className="hero-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/screens/01-explore.png" alt="Onside app showing soccer venues across the GTA" />
          </div>
        </div>
      </header>

      <section id="features">
        <div className="wrap">
          <div className="section-head">
            <h2 className="display">Stop texting around for a field</h2>
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
          <h2 className="display">Get on the pitch</h2>
          <p>Download Onside and find a field near you in seconds.</p>
          <AppStoreButton />
        </div>
      </section>

      <Footer />
    </>
  );
}
