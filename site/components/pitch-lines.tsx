/**
 * Decorative pitch markings — the site's signature graphic. Draws the corner
 * of a soccer pitch (touchline, center circle + spot, halfway line, penalty
 * box + arc) as thin strokes. Rendered low-opacity behind hero/section content
 * so the whole site reads as a floodlit field. Purely decorative → aria-hidden.
 */
export function PitchLines({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 600"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <g stroke="currentColor" strokeWidth="1.5" opacity="0.9">
        {/* Halfway line (top edge of this "half") */}
        <line x1="0" y1="60" x2="600" y2="60" />
        {/* Center circle + spot, sitting on the halfway line */}
        <circle cx="300" cy="60" r="92" />
        <circle cx="300" cy="60" r="3.5" fill="currentColor" stroke="none" />
        {/* Penalty box at the bottom (the goal end) */}
        <rect x="170" y="470" width="260" height="130" />
        <rect x="240" y="560" width="120" height="40" />
        {/* Penalty spot + arc */}
        <circle cx="300" cy="500" r="3.5" fill="currentColor" stroke="none" />
        <path d="M 224 470 A 92 92 0 0 1 376 470" />
        {/* Corner arcs */}
        <path d="M 0 588 A 12 12 0 0 0 12 600" />
        <path d="M 600 588 A 12 12 0 0 1 588 600" />
      </g>
    </svg>
  );
}
