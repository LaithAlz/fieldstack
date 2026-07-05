import Link from "next/link";

import type { PriceState } from "@/lib/venues";

/** Slim, serializable venue shape the card needs — shared by the finder and the city pages. */
export type VenueCardData = {
  slug: string;
  name: string;
  city: string;
  surfaces: string[];
  sizes: string[];
  fieldCount: number;
  price: PriceState;
};

/**
 * The card grammar: name, surface/size meta, and a condensed price — or the
 * FREE foil chip for free public-park fields, or "Rates on site" when an
 * operator hasn't listed one.
 */
export function VenueCard({ v }: { v: VenueCardData }) {
  return (
    <Link className="venue-card" href={`/venues/${v.slug}`}>
      <div className="vc-top">
        <strong>{v.name}</strong>
        <span className="vc-city">{v.city}</span>
      </div>
      {v.surfaces.length > 0 && (
        <div className="vc-badges">
          {v.surfaces.map((s) => (
            <span className="badge" key={s}>{s}</span>
          ))}
        </div>
      )}
      <div className="vc-foot">
        <span className="vc-meta">
          {v.fieldCount} {v.fieldCount === 1 ? "field" : "fields"}
          {v.sizes.length ? ` · ${v.sizes.join(", ")}` : ""}
        </span>
        {v.price.kind === "price" && <span className="vc-price">{v.price.text}</span>}
        {v.price.kind === "free" && <span className="price-free">FREE</span>}
        {v.price.kind === "onsite" && <span className="price-onsite">Rates on site</span>}
      </div>
    </Link>
  );
}
