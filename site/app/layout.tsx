import type { Metadata, Viewport } from "next";
import { Figtree, Barlow_Condensed } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-figtree",
  display: "swap",
});

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://getonside.ca"),
  title: "Onside: Every soccer field in the GTA",
  description:
    "Find every soccer field across the Greater Toronto Area. Browse turf, indoor, and outdoor pitches, filter by size and price, and book direct with the operator.",
  icons: { icon: "/mark.svg" },
  openGraph: {
    title: "Onside: Every soccer field in the GTA",
    description:
      "Browse every pitch in the GTA, filter by surface, size, and price, and jump straight to the operator's booking page.",
    url: "https://getonside.ca",
    type: "website",
  },
  // Card type only — the image itself comes from app/opengraph-image.tsx via
  // the file convention (Twitter/X falls back to the OG image).
  twitter: {
    card: "summary_large_image",
    title: "Onside: Every soccer field in the GTA",
    description:
      "Every field in the GTA on one map — turf, indoor, outdoor. Free on iPhone.",
  },
};

export const viewport: Viewport = { themeColor: "#f7f2e8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${barlow.variable}`}>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
