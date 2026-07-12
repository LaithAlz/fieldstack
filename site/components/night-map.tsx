/**
 * Decorative "every field" hero panel: a stylized map card with a faint
 * street grid and a scatter of field pins. Themed with the site (paper day
 * map in light, the app's night map in dark; the component name keeps the
 * dark-theme identity). Replaces a static app screenshot with pure CSS, and
 * doubles as the home for the real, statically-fetched venue count in the
 * display (numeral) face.
 */
export function NightMap({ count }: { count: number }) {
  return (
    <div className="night-map" role="img" aria-label="Stylized map of soccer fields across the GTA">
      <div className="night-map-grid" />
      <div className="night-map-glow" />
      <span className="nm-pin nm-pin-1" />
      <span className="nm-pin nm-pin-2" />
      <span className="nm-pin nm-pin-3" />
      <span className="nm-pin nm-pin-4 sel" />
      <span className="nm-pin nm-pin-5" />
      <span className="nm-pin nm-pin-6" />
      <span className="nm-pin nm-pin-7" />
      {count > 0 && (
        <div className="night-map-stat">
          <b>{count}</b>
          <span>venues ready for kickoff</span>
        </div>
      )}
    </div>
  );
}
