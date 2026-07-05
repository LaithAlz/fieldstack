/**
 * Mississauga city-owned soccer fields. Pulled from the city's Open Data
 * Hub (ArcGIS) — a public, no-auth GeoJSON download. ToS-safe: this is the
 * official "open data" channel, intended for redistribution.
 *
 * Each ArcGIS feature is one *field* row; we group by PARENTDESC (the
 * parent park name) so multiple fields in the same park collapse into one
 * venue with N children.
 */

import type { ScrapeAdapter, ScrapedField, ScrapedVenue } from "../types.js";
import type { FieldSize } from "../fieldEnums.js";
import { fetchGeoJsonFeatures } from "../lib/arcgis.js";

const GEOJSON_URL =
  "https://hub-mississauga.opendata.arcgis.com/datasets/mississauga::city-soccer-fields-1.geojson";

type ArcGISProps = {
  OBJECTID: number;
  UNITID?: number | null;
  GISKEY?: string | null;
  LANDMARKNAME?: string | null;
  TYPEDESC?: string | null;
  SERVSTAT?: string | null;
  // Address bits — Mississauga's dataset uses varying shapes. Try a few.
  ADDRESS?: string | null;
  STREETNUMBER?: number | null;
  STREETNAME?: string | null;
  PARENTDESC?: string | null;
  PARENTID?: number | null;
  LANDMARKPHONE?: string | null;
  LANDMARKWEBSITE?: string | null;
};

type ArcGISFeature = {
  type: "Feature";
  properties: ArcGISProps;
  geometry: { type: "Point"; coordinates: [number, number] } | null;
};

/** Map Mississauga's TYPEDESC to our field_size enum. */
function mapSize(typedesc: string | null | undefined): FieldSize {
  const t = (typedesc ?? "").toLowerCase();
  if (t.includes("11")) return "11v11";
  if (t.includes("7")) return "7v7";
  if (t.includes("5")) return "5v5";
  if (t.includes("box")) return "3v3"; // boxed soccer = small-sided pad
  if (t.includes("futsal")) return "futsal";
  return "7v7"; // sensible default for muni outdoor pitches
}

function deriveAddress(p: ArcGISProps): string {
  if (p.ADDRESS && p.ADDRESS.trim().length > 0) return p.ADDRESS.trim();
  const parts = [p.STREETNUMBER, p.STREETNAME].filter(
    (v) => v !== undefined && v !== null && String(v).length > 0
  );
  if (parts.length > 0) return parts.join(" ");
  // Fall back to the park name — better than empty string for trust.
  return p.PARENTDESC ?? "Mississauga (address unavailable)";
}

function venueKey(p: ArcGISProps): string {
  // PARENTID groups fields in the same park. When missing, fall back to
  // PARENTDESC slug — both bind multiple TYPEDESCs at the same site to
  // one venue.
  if (p.PARENTID !== undefined && p.PARENTID !== null) {
    return `mississauga:parent-${p.PARENTID}`;
  }
  const slug = (p.PARENTDESC ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `mississauga:park-${slug}`;
}

function fieldKey(p: ArcGISProps): string {
  if (p.GISKEY && p.GISKEY.length > 0) return `mississauga:field-${p.GISKEY}`;
  return `mississauga:field-${p.OBJECTID}`;
}

async function fetchFeatures(): Promise<ArcGISFeature[]> {
  return (await fetchGeoJsonFeatures(GEOJSON_URL, "mississauga")) as unknown as ArcGISFeature[];
}

export const mississaugaAdapter: ScrapeAdapter = {
  source: "mississauga",
  label: "City of Mississauga (Open Data)",
  async run() {
    const features = await fetchFeatures();
    // Filter to active fields only — Mississauga marks closed/retired as
    // anything other than "OPEN" or "RCNF" (recently constructed).
    const active = features.filter((f) => {
      const status = f.properties.SERVSTAT?.toUpperCase();
      return status === "OPEN" || status === "RCNF" || !status;
    });

    // Group fields by parent park → one venue per park.
    const byVenue = new Map<string, ScrapedVenue>();
    for (const f of active) {
      const p = f.properties;
      const vKey = venueKey(p);
      let venue = byVenue.get(vKey);
      if (!venue) {
        const coord = f.geometry?.coordinates ?? null;
        venue = {
          externalId: vKey,
          name: p.PARENTDESC ?? p.LANDMARKNAME ?? "Mississauga venue",
          address: deriveAddress(p),
          lat: coord ? coord[1] : null,
          lng: coord ? coord[0] : null,
          photos: [],
          amenities: [],
          venueType: "public_park",
          fields: [],
        };
        byVenue.set(vKey, venue);
      }
      const field: ScrapedField = {
        externalId: fieldKey(p),
        name: p.LANDMARKNAME ?? `Field ${p.OBJECTID}`,
        surface: "grass", // muni outdoor default; can refine when source carries surface
        size: mapSize(p.TYPEDESC),
        pricePerHour: null,
        bookingUrl: null,
      };
      venue.fields.push(field);
    }
    return [...byVenue.values()];
  },
};
