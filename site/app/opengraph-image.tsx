import { ImageResponse } from "next/og";

import tokens from "../lib/tokens.generated.json";

// Default social card for every route that doesn't define its own.
// Built with the site palette (warm cream + tangerine + navy ink) so shares
// in iMessage/WhatsApp/Slack read unmistakably as Onside. Rendered once at
// build — no runtime cost.
//
// Colors pull from design/tokens.json (the single source of truth shared
// with the app) rather than hand-copied hexes, so this can't drift from the
// rest of the site the way the old inline values had.

export const alt = "Onside: every soccer field in the GTA, on one map";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// #RRGGBB -> rgba(r, g, b, alpha), so the pitch-line strokes can reuse a
// solid token color at reduced opacity without hand-picking a new hex.
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const { light } = tokens.color;

const BG = light.surface;
const INK = light.textPrimary;
const INK_2 = light.textSecondary;
const BRAND = light.brand;
const ON_BRAND = light.onBrand;
// The pitch illustration's green is decorative-only and has no equivalent
// in the shared token set (there's no "pitch green" token), so it stays a
// local constant. The line strokes are derived from the onBrand token so
// they track the same near-white rather than a second hand-picked hex.
const PITCH = "#2f7d43";
const LINE = hexToRgba(ON_BRAND, 0.9);

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: BG,
          padding: 72,
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
        }}
      >
        {/* Left: wordmark + pitch line */}
        <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 40,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: BRAND,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: ON_BRAND,
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              O
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, color: INK }}>
              Onside
            </div>
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: BRAND,
              letterSpacing: 4,
              marginBottom: 18,
            }}
          >
            SOCCER FIELDS · GREATER TORONTO
          </div>
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.02,
              marginBottom: 26,
            }}
          >
            Find your next pitch.
          </div>
          <div style={{ fontSize: 32, color: INK_2, lineHeight: 1.35 }}>
            Every field in the GTA on one map: turf, indoor, outdoor.
            Free on iPhone.
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: BRAND,
              marginTop: 40,
            }}
          >
            getonside.ca
          </div>
        </div>

        {/* Right: stylized pitch */}
        <div
          style={{
            width: 330,
            height: 470,
            background: PITCH,
            borderRadius: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            boxShadow: "0 24px 60px rgba(26, 29, 43, 0.25)",
          }}
        >
          {/* Outer touchline */}
          <div
            style={{
              position: "absolute",
              top: 24,
              left: 24,
              right: 24,
              bottom: 24,
              border: `4px solid ${LINE}`,
              borderRadius: 10,
            }}
          />
          {/* Halfway line */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 24,
              right: 24,
              height: 4,
              background: LINE,
            }}
          />
          {/* Centre circle */}
          <div
            style={{
              width: 110,
              height: 110,
              border: `4px solid ${LINE}`,
              borderRadius: 999,
            }}
          />
          {/* Penalty boxes */}
          <div
            style={{
              position: "absolute",
              top: 24,
              left: 92,
              width: 146,
              height: 64,
              borderLeft: `4px solid ${LINE}`,
              borderRight: `4px solid ${LINE}`,
              borderBottom: `4px solid ${LINE}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: 92,
              width: 146,
              height: 64,
              borderLeft: `4px solid ${LINE}`,
              borderRight: `4px solid ${LINE}`,
              borderTop: `4px solid ${LINE}`,
            }}
          />
          {/* Location pin */}
          <div
            style={{
              position: "absolute",
              top: 96,
              right: 52,
              width: 44,
              height: 44,
              background: BRAND,
              borderRadius: "50% 50% 50% 0",
              transform: "rotate(-45deg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 18px rgba(26, 29, 43, 0.35)",
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                background: ON_BRAND,
                borderRadius: 999,
                transform: "rotate(45deg)",
              }}
            />
          </div>
        </div>
      </div>
    ),
    size
  );
}
