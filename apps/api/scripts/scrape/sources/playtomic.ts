/**
 * Playtomic discovery adapter — sweeps GTA cities via the internal `tenants`
 * search API for soccer/futsal venues and maps them to the deep-link
 * booking tier (venue identity + `playtomic.com` club page). NO
 * availability/price calls — those require the official, credentialed
 * Club API; see docs/scraping.md §3.2 for that partnership path.
 *
 * Verified against the live API (2026-07-04):
 *   - `playtomic.io/api/v1/tenants` is dead (redirects, 404s). Working
 *     endpoint: `GET https://api.playtomic.io/v1/tenants` (public, no auth).
 *   - Valid soccer sport ids: `FUTSAL`, `FOOTBALL7`. `SOCCER`/`FOOTBALL`/
 *     `FOOTBALL11`/`INDOOR_FOOTBALL` all 400 with `VALIDATION_ERROR`.
 *   - The server-side `sport_id` filter is loose (returns padel-only
 *     tenants nearby) — client-side filtering on `resources[].sport_id`
 *     is mandatory.
 *   - `playtomic.com/clubs/<slug>` 200s only for `playtomic_status:
 *     "ACTIVE"` tenants; others (INACTIVE, UNBOOKABLE) 404.
 *   - Measured: 0 soccer/futsal tenants within 75km of Toronto (2026-07) —
 *     Playtomic is padel-dominant here today. Zero is the expected steady
 *     state; this source exists so a future GTA adopter surfaces
 *     automatically.
 *
 * ToS posture (docs/scraping.md §4.4): undocumented consumer API — used
 * sparingly, discovery only, clear User-Agent, conservative rate limit.
 */

import type { FieldSize, FieldSurface } from "../fieldEnums.js";
import { loadCities } from "../lib/registry.js";
import type { ScrapeAdapter, ScrapedField, ScrapedVenue } from "../types.js";

const TENANTS_URL = "https://api.playtomic.io/v1/tenants";
const SOCCER_SPORT_IDS = new Set(["FUTSAL", "FOOTBALL7"]);
const SEARCH_RADIUS_M = 20_000;
const PAGE_SIZE = 40;
const USER_AGENT = "FieldStack-scraper/1.0 (https://fieldstack.app)";

export type PlaytomicResource = {
  resource_id?: string;
  name?: string;
  sport_id?: string;
  is_active?: boolean;
  properties?: {
    resource_type?: string;
    resource_size?: string;
  };
};

export type PlaytomicTenant = {
  tenant_id?: string;
  tenant_uid?: string;
  slug?: string;
  tenant_name?: string;
  tenant_status?: string;
  playtomic_status?: string;
  address?: {
    street?: string;
    city?: string;
    coordinate?: { lat?: number; lon?: number };
  };
  images?: string[];
  resources?: PlaytomicResource[];
  opening_hours?: Record<
    string,
    { opening_time?: string; closing_time?: string } | undefined
  >;
  default_cancelation_policy?: { amount?: number; unit?: string };
  sport_ids?: string[];
};

/** Playtomic weekday key -> app's lowercase 3-letter key (venueHours.ts shape). */
const DAY_KEYS: Record<string, string> = {
  SUNDAY: "sun",
  MONDAY: "mon",
  TUESDAY: "tue",
  WEDNESDAY: "wed",
  THURSDAY: "thu",
  FRIDAY: "fri",
  SATURDAY: "sat",
};

const TIME_RE = /^\d{1,2}:\d{2}$/;

export function isSoccerResource(r: PlaytomicResource): boolean {
  return (
    !!r.sport_id && SOCCER_SPORT_IDS.has(r.sport_id) && r.is_active !== false
  );
}

export function clubUrl(slugOrUid: string): string {
  return `https://playtomic.com/clubs/${encodeURIComponent(slugOrUid)}`;
}

export function mapOpeningHours(
  oh: PlaytomicTenant["opening_hours"] | null | undefined
): Record<string, string | null> | null {
  if (!oh || typeof oh !== "object") return null;
  const out: Record<string, string> = {};
  for (const [ptKey, appKey] of Object.entries(DAY_KEYS)) {
    const entry = oh[ptKey];
    const opening = entry?.opening_time;
    const closing = entry?.closing_time;
    if (!opening || !closing || !TIME_RE.test(opening) || !TIME_RE.test(closing)) {
      continue;
    }
    out[appKey] = `${opening}-${closing}`;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function buildAddress(t: PlaytomicTenant, tenantName: string): string {
  const parts = [t.address?.street, t.address?.city].filter(
    (p): p is string => !!p && p.length > 0
  );
  return parts.length > 0 ? parts.join(", ") : tenantName;
}

function buildCancellationPolicy(
  policy: PlaytomicTenant["default_cancelation_policy"]
): string | null {
  if (!policy || typeof policy.amount !== "number" || !policy.unit) return null;
  return `Cancel up to ${policy.amount} ${policy.unit.toLowerCase()} before the booking`;
}

function fieldFromResource(
  tenantId: string,
  slug: string,
  r: PlaytomicResource & { resource_id: string }
): ScrapedField {
  const isIndoor = r.properties?.resource_type === "indoor";
  const surface: FieldSurface = isIndoor
    ? "indoor"
    : r.sport_id === "FUTSAL"
      ? "concrete"
      : "turf";
  const size: FieldSize = r.sport_id === "FUTSAL" ? "futsal" : "7v7";
  return {
    externalId: `playtomic:${tenantId}:${r.resource_id}`,
    name: r.name ?? "Field",
    surface,
    size,
    pricePerHour: null,
    bookingUrl: clubUrl(slug),
    bookingPlatform: "playtomic",
  };
}

export function tenantToVenue(t: PlaytomicTenant): ScrapedVenue | null {
  if (t.playtomic_status !== "ACTIVE") return null;

  const slug = t.slug ?? t.tenant_uid;
  if (!slug) return null;

  const tenantId = t.tenant_id;
  const tenantName = t.tenant_name;
  if (!tenantId || !tenantName) return null;

  const lat = t.address?.coordinate?.lat;
  const lng = t.address?.coordinate?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const soccerResources = (t.resources ?? []).filter(
    (r): r is PlaytomicResource & { resource_id: string } =>
      isSoccerResource(r) && !!r.resource_id
  );
  if (soccerResources.length === 0) return null;

  const hasIndoor = soccerResources.some(
    (r) => r.properties?.resource_type === "indoor"
  );

  return {
    externalId: `playtomic:${tenantId}`,
    name: tenantName,
    address: buildAddress(t, tenantName),
    lat: lat as number,
    lng: lng as number,
    photos: t.images ?? [],
    amenities: hasIndoor ? ["indoor"] : [],
    venueType: "private",
    hours: mapOpeningHours(t.opening_hours),
    cancellationPolicy: buildCancellationPolicy(t.default_cancelation_policy),
    confidence: 3,
    fields: soccerResources.map((r) => fieldFromResource(tenantId, slug, r)),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch with retry on 429 / 503 / 504 (transient), backoff 0s/5s/15s. A
 * non-retryable non-OK response (e.g. 400 VALIDATION_ERROR) throws
 * immediately with the status — it won't be fixed by waiting.
 */
async function fetchTenants(
  centre: { lat: number; lng: number },
  sportId: string
): Promise<PlaytomicTenant[]> {
  const backoffsMs = [0, 5000, 15000];
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
    const delayMs = backoffsMs[attempt] ?? 0;
    if (delayMs > 0) {
      console.log(`[playtomic]   backing off ${delayMs / 1000}s before retry`);
      await sleep(delayMs);
    }
    let res: Response;
    try {
      const params = new URLSearchParams({
        coordinate: `${centre.lat},${centre.lng}`,
        radius: String(SEARCH_RADIUS_M),
        sport_id: sportId,
        size: String(PAGE_SIZE),
      });
      res = await fetch(`${TENANTS_URL}?${params.toString()}`, {
        headers: { "User-Agent": USER_AGENT },
      });
    } catch (err) {
      lastErr = err;
      continue;
    }
    if (res.status === 429 || res.status === 503 || res.status === 504) {
      lastErr = new Error(`HTTP ${res.status}`);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Playtomic tenants fetch failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? (body as PlaytomicTenant[]) : [];
  }
  throw new Error(
    `Playtomic tenants fetch failed after ${backoffsMs.length} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}

export const playtomicAdapter: ScrapeAdapter = {
  source: "playtomic",
  label: "Playtomic (soccer/futsal tenant discovery)",
  async run(): Promise<ScrapedVenue[]> {
    const cities = loadCities();
    const tenantsById = new Map<string, PlaytomicTenant>();
    let queries = 0;

    for (const city of cities) {
      try {
        for (const sportId of SOCCER_SPORT_IDS) {
          const tenants = await fetchTenants(
            { lat: city.lat, lng: city.lng },
            sportId
          );
          queries++;
          for (const t of tenants) {
            if (t.tenant_id) tenantsById.set(t.tenant_id, t);
          }
          await sleep(1500);
        }
      } catch (err) {
        console.warn(
          `[playtomic]   ${city.name}: failed —`,
          err instanceof Error ? err.message : err
        );
      }
    }

    const venues: ScrapedVenue[] = [];
    for (const t of tenantsById.values()) {
      const v = tenantToVenue(t);
      if (v) venues.push(v);
    }

    console.log(
      `[playtomic] ${venues.length} soccer tenants (${tenantsById.size} raw) from ${queries} queries`
    );
    if (venues.length === 0) {
      console.log(
        "[playtomic] 0 is expected while Playtomic has no GTA soccer/futsal presence (padel-dominant) — this source lights up automatically once a facility adopts the platform"
      );
    }
    return venues;
  },
};
