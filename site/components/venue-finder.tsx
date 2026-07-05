"use client";

import { useMemo, useState } from "react";

import { VenueCard, type VenueCardData } from "@/components/venue-card";

/** Slim, serializable venue shape the finder needs for cards + filtering. */
export type FinderVenue = VenueCardData;

const SURFACES = ["Indoor", "Turf", "Grass", "Concrete"];
const SIZES = ["5-a-side", "7-a-side", "11-a-side", "Futsal", "3v3"];

export function VenueFinder({
  venues,
  cities,
}: {
  venues: FinderVenue[];
  cities: string[];
}) {
  const [q, setQ] = useState("");
  const [surface, setSurface] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [city, setCity] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return venues.filter((v) => {
      if (needle && !`${v.name} ${v.city}`.toLowerCase().includes(needle)) return false;
      if (city && v.city !== city) return false;
      if (surface && !v.surfaces.includes(surface)) return false;
      if (size && !v.sizes.includes(size)) return false;
      return true;
    });
  }, [venues, q, surface, size, city]);

  const active = Boolean(q || surface || size || city);

  // Re-group the filtered set by city, biggest city first (preserves the
  // "Soccer fields in <city>" headings that matter for search ranking).
  const byCity = useMemo(() => {
    const m = new Map<string, FinderVenue[]>();
    for (const v of filtered) m.set(v.city, (m.get(v.city) ?? []).concat(v));
    return [...m.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
    );
  }, [filtered]);

  const reset = () => {
    setQ("");
    setSurface(null);
    setSize(null);
    setCity("");
  };

  return (
    <section className="finder">
      <div className="wrap">
        <div className="finder-bar">
          <div className="finder-search">
            <span className="fs-icon" aria-hidden>⌕</span>
            <input
              type="search"
              placeholder="Search a venue or city…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search venues"
            />
          </div>
          <select
            className="finder-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label="Filter by city"
          >
            <option value="">All cities &amp; areas</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="finder-filters">
          <div className="chip-group">
            <span className="chip-label">Surface</span>
            {SURFACES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${surface === s ? "on" : ""}`}
                aria-pressed={surface === s}
                onClick={() => setSurface(surface === s ? null : s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="chip-group">
            <span className="chip-label">Size</span>
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${size === s ? "on" : ""}`}
                aria-pressed={size === s}
                onClick={() => setSize(size === s ? null : s)}
              >
                {s}
              </button>
            ))}
          </div>
          {active && (
            <button type="button" className="chip clear" onClick={reset}>
              Clear ✕
            </button>
          )}
        </div>

        <p className="finder-count">
          <b>{filtered.length}</b> {filtered.length === 1 ? "venue" : "venues"}
          {active ? " match your filters" : " across the GTA"}
        </p>

        {filtered.length === 0 ? (
          <div className="finder-empty">
            <p>No fields match those filters.</p>
            <button type="button" className="btn-secondary" onClick={reset}>
              Clear filters
            </button>
          </div>
        ) : (
          byCity.map(([c, vs]) => (
            <div className="city-block" key={c}>
              <h2 className="sub">
                Soccer fields in {c} <span className="count">{vs.length}</span>
              </h2>
              <div className="venue-grid">
                {vs.map((v) => (
                  <VenueCard v={v} key={v.slug} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
