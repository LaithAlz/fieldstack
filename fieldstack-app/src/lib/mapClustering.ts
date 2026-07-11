/**
 * Pure grid-binning for Explore's map pins.
 *
 * This is deliberately NOT supercluster or any other clustering library — no
 * new dependency, just a pure function (onside-change-control section 1).
 * It exists to fit however many venues are visible in the current viewport
 * (downtown Toronto alone can have 700+) into the FIXED MAX_MARKERS
 * always-mounted marker-pool slots in ExploreScreen.tsx without ever
 * changing the pool's length: ExploreScreen computes placements here once
 * per settled pan/zoom (`onRegionChangeComplete`) and maps each placement
 * onto an existing pool slot as a prop update only (see
 * onside-architecture-contract invariant 11 and
 * onside-failure-archaeology incidents 1/2 for why the pool itself must
 * never mount/unmount a Marker).
 *
 * Determinism matters as much as correctness: two calls with the same
 * venues + region + maxItems MUST produce the same placements in the same
 * order, or slot contents would churn (and therefore re-rasterize) on every
 * identical recompute, e.g. a settled pan that didn't actually change
 * anything. That's why binning uses an absolute (viewport-independent) grid
 * anchored at lat/lng 0,0 rather than one anchored to the current region,
 * and every output is sorted by cell key before being handed back.
 */

export type ClusterableVenue = {
  id: string;
  lat: number;
  lng: number;
};

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type PlacedSingle = {
  kind: "single";
  venueId: string;
  lat: number;
  lng: number;
};

export type PlacedCluster = {
  kind: "cluster";
  /** Stable across identical recomputes — derived from the grid cell key. */
  id: string;
  memberIds: string[];
  count: number;
  /** Centroid: average of member coordinates. */
  lat: number;
  lng: number;
  /** Bounding box of members — feeds the "fit members with padding" region
   *  ExploreScreen animates to when a cluster is tapped. */
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
};

export type PlacedItem = PlacedSingle | PlacedCluster;

// Target on-screen cell size. Deliberately much larger than the ~44pt pin
// footprint: product direction is aggressive aggregation (few, chunky
// clusters that scream density) rather than a pin-per-venue salt shaker, so
// singles and clusters don't visually overlap at a given zoom.
const TARGET_CELL_PT = 110;
// This pure function has no real pixel-width input (ExploreScreen doesn't
// measure the MapView's rendered width), so points-per-degree is
// approximated from a typical phone map width. This only affects how
// aggressively the grid clusters at a given zoom, never correctness: the
// adaptive coarsening loop below always converges under maxItems regardless
// of how good this guess is.
const ASSUMED_MAP_WIDTH_PT = 390;
// Viewport margin so pins just outside the visible edge don't pop in/out on
// a tiny pan — a fraction of each delta, same idea as
// ExploreScreen's REFETCH_PAN_THRESHOLD_KM guarding micro-pans.
const VIEWPORT_MARGIN_RATIO = 0.15;
// Doubling the cell size this many times comfortably covers any real
// viewport (a starting ~110pt cell doubled 24 times is planet-scale), so this
// bounds the coarsening loop without ever being the reason it stops in
// practice.
const MAX_COARSEN_ITERATIONS = 24;

function initialCellSizeDeg(region: MapRegion): number {
  const perPointDeg = region.longitudeDelta / ASSUMED_MAP_WIDTH_PT;
  return Math.max(perPointDeg * TARGET_CELL_PT, 1e-9);
}

function cellKey(lat: number, lng: number, cellSizeDeg: number): string {
  const row = Math.floor(lat / cellSizeDeg);
  const col = Math.floor(lng / cellSizeDeg);
  return `${row}:${col}`;
}

function inViewport(v: ClusterableVenue, region: MapRegion): boolean {
  const latMargin = region.latitudeDelta * VIEWPORT_MARGIN_RATIO;
  const lngMargin = region.longitudeDelta * VIEWPORT_MARGIN_RATIO;
  const latMin = region.latitude - region.latitudeDelta / 2 - latMargin;
  const latMax = region.latitude + region.latitudeDelta / 2 + latMargin;
  const lngMin = region.longitude - region.longitudeDelta / 2 - lngMargin;
  const lngMax = region.longitude + region.longitudeDelta / 2 + lngMargin;
  return v.lat >= latMin && v.lat <= latMax && v.lng >= lngMin && v.lng <= lngMax;
}

function bin(venues: readonly ClusterableVenue[], cellSizeDeg: number): PlacedItem[] {
  const cells = new Map<string, ClusterableVenue[]>();
  for (const v of venues) {
    const key = cellKey(v.lat, v.lng, cellSizeDeg);
    const bucket = cells.get(key);
    if (bucket) bucket.push(v);
    else cells.set(key, [v]);
  }

  // Sort by cell key (not insertion order) so identical inputs always
  // produce identical output order, regardless of the caller's array order.
  const keys = Array.from(cells.keys()).sort();
  const items: PlacedItem[] = [];

  for (const key of keys) {
    const members = cells.get(key)!;
    // Stable member order within a cell too — id ascending.
    members.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    if (members.length === 1) {
      const only = members[0]!;
      items.push({ kind: "single", venueId: only.id, lat: only.lat, lng: only.lng });
      continue;
    }

    let sumLat = 0;
    let sumLng = 0;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const m of members) {
      sumLat += m.lat;
      sumLng += m.lng;
      if (m.lat < minLat) minLat = m.lat;
      if (m.lat > maxLat) maxLat = m.lat;
      if (m.lng < minLng) minLng = m.lng;
      if (m.lng > maxLng) maxLng = m.lng;
    }
    items.push({
      kind: "cluster",
      id: `cluster:${key}`,
      memberIds: members.map((m) => m.id),
      count: members.length,
      lat: sumLat / members.length,
      lng: sumLng / members.length,
      bounds: { minLat, maxLat, minLng, maxLng },
    });
  }

  return items;
}

/**
 * Bin visible venues into placed pins/clusters for the fixed marker pool.
 *
 * - Venues outside the viewport (plus a small margin) are excluded.
 * - The grid cell size starts near TARGET_CELL_PT on screen, derived from
 *   the region's longitudeDelta.
 * - If the binned result still has more entries than maxItems, the cell
 *   size doubles and rebinning repeats (bounded) until it fits.
 * - Deterministic: identical (venues, region, maxItems) always produce the
 *   same items in the same order, so slot assignment in ExploreScreen does
 *   not churn between identical recomputes (e.g. a settled pan that landed
 *   back on the same region).
 *
 * Note this does not itself guarantee `result.length <= maxItems` in every
 * pathological case (the coarsening loop is bounded); ExploreScreen's pool
 * assignment still slices to MAX_MARKERS defensively, same as before
 * clustering existed.
 */
export function computeMapPlacements(
  venues: readonly ClusterableVenue[],
  region: MapRegion,
  maxItems: number
): PlacedItem[] {
  const visible = venues.filter((v) => inViewport(v, region));
  if (visible.length === 0) return [];

  let cellSizeDeg = initialCellSizeDeg(region);
  let items = bin(visible, cellSizeDeg);

  let iterations = 0;
  while (items.length > maxItems && iterations < MAX_COARSEN_ITERATIONS) {
    cellSizeDeg *= 2;
    items = bin(visible, cellSizeDeg);
    iterations++;
  }

  return items;
}
