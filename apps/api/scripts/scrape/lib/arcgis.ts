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
  type?: "FeatureCollection";
  features?: Feature[];
  properties?: { exceededTransferLimit?: boolean };
  /** ArcGIS REST reports query errors (bad `where`, renamed field, moved
   *  layer) as HTTP 200 with an error body — without this check they'd be
   *  indistinguishable from a legitimately empty layer. */
  error?: { code?: number; message?: string };
};

const USER_AGENT = "FieldStack-scraper/1.0 (https://fieldstack.app)";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET an ArcGIS/GeoJSON endpoint with the standard UA. Retries transient
 * failures (429/5xx, network errors) with 5s/15s backoff — a single blip
 * from a city GIS server shouldn't cost that source its weekly run. Throws
 * on non-transient errors and on ArcGIS 200-with-error bodies. Warns if the
 * response carries exceededTransferLimit (paging not implemented — our
 * layers are well under server page caps).
 */
export async function fetchGeoJsonFeatures(
  url: string,
  sourceTag: string
): Promise<Feature[]> {
  const backoffsMs = [0, 5000, 15000];
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
    const delayMs = backoffsMs[attempt] ?? 0;
    if (delayMs > 0) {
      console.log(`[${sourceTag}]   backing off ${delayMs / 1000}s before retry`);
      await sleep(delayMs);
    }
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT },
      });
    } catch (err) {
      lastErr = err;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`HTTP ${res.status}`);
      continue;
    }
    if (!res.ok) {
      throw new Error(`${sourceTag} fetch failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as GeoJsonResponse;
    if (body.error) {
      throw new Error(
        `${sourceTag} query error (HTTP 200): ${body.error.message ?? `code ${body.error.code}`}`
      );
    }
    if (body.properties?.exceededTransferLimit) {
      console.warn(
        `[${sourceTag}] response exceededTransferLimit — paging not implemented, results may be truncated`
      );
    }
    return body.features ?? [];
  }
  throw new Error(
    `${sourceTag} fetch failed after ${backoffsMs.length} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}
