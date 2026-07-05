import Link from "next/link";

import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { PitchLines } from "@/components/pitch-lines";

// Custom 404. On brand (same hero + display face + tokens as every other
// landing page) rather than the framework default, and honest about what
// happened instead of a generic "not found" shrug.
export default function NotFound() {
  return (
    <>
      <Nav />
      <header className="hero venues-hero">
        <div className="wrap">
          <div>
            <span className="eyebrow rise">404</span>
            <h1 className="display rise d1">
              This pitch doesn&apos;t exist.
            </h1>
            <p className="lede rise d2">
              The page you followed isn&apos;t here. It may have moved, or the
              link was off. Try the homepage or browse every field in the GTA.
            </p>
            <div className="cta-row">
              <Link href="/" className="btn-secondary">Back home</Link>
              <Link href="/venues" className="btn-secondary">Browse soccer fields</Link>
            </div>
          </div>
        </div>
        <PitchLines className="pitch" />
      </header>
      <Footer />
    </>
  );
}
