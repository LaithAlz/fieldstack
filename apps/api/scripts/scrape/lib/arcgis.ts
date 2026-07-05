/**
 * Shared ArcGIS/GeoJSON fetch helper for municipal open-data sources
 * (mississauga.ts, toronto.ts, brampton.ts). Every layer we query today is
 * verified well under its service's maxRecordCount, so paging is not
 * implemented — `exceededTransferLimit` only ever warns, it never triggers
 * a follow-up request.
 */

/** Minimal GeoJSON feature shape — enough for every ArcGIS layer we read. */
export type Feature = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
};

type GeoJsonResponse = {
  type: "FeatureCollection";
  features?: Feature[];
  properties?: { exceededTransferLimit?: boolean };
};

const USER_AGENT = "FieldStack-scraper/1.0 (https://fieldstack.app)";

/** GET an ArcGIS/GeoJSON endpoint with the standard UA; throws on !ok.
 *  Warns if the response carries exceededTransferLimit (paging not
 *  implemented — our layers are well under server page caps). */
export async function fetchGeoJsonFeatures(
  url: string,
  sourceTag: string
): Promise<Feature[]> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`${sourceTag} fetch failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as GeoJsonResponse;
  if (body.properties?.exceededTransferLimit) {
    console.warn(
      `[${sourceTag}] response exceededTransferLimit — paging not implemented, results may be truncated`
    );
  }
  return body.features ?? [];
}
