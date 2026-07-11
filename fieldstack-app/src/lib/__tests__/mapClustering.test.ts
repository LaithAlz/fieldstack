import { computeMapPlacements, type ClusterableVenue, type MapRegion } from "../mapClustering";

// A generous, arbitrary viewport far from the antimeridian/poles — the
// clustering math is pure geometry, so real Toronto coordinates aren't
// required for correctness, only for the on-device verification pass.
const WIDE_REGION: MapRegion = {
  latitude: 0,
  longitude: 0,
  latitudeDelta: 1,
  longitudeDelta: 1,
};

// Matches computeMapPlacements' internal derivation: TARGET_CELL_PT(110) /
// ASSUMED_MAP_WIDTH_PT(390) * longitudeDelta.
function cellSizeDegFor(region: MapRegion): number {
  return (110 / 390) * region.longitudeDelta;
}

describe("computeMapPlacements", () => {
  it("bins venues within one grid cell into a single cluster", () => {
    const venues: ClusterableVenue[] = Array.from({ length: 6 }, (_, i) => ({
      id: `v${i}`,
      // Tiny offsets (0.0001 deg, ~11m) — far smaller than any cell size
      // derived from a 1-degree-wide viewport.
      lat: 0 + i * 0.0001,
      lng: 0 + i * 0.0001,
    }));

    const placements = computeMapPlacements(venues, WIDE_REGION, 50);

    expect(placements).toHaveLength(1);
    expect(placements[0]!.kind).toBe("cluster");
    if (placements[0]!.kind === "cluster") {
      expect(placements[0]!.count).toBe(6);
      expect(placements[0]!.memberIds.sort()).toEqual(
        venues.map((v) => v.id).sort()
      );
    }
  });

  it("keeps well-separated venues as distinct singles when they fit", () => {
    const cellSize = cellSizeDegFor(WIDE_REGION);
    const step = cellSize * 2;
    // A 2x2 grid, each point exactly 2 cell sizes from its neighbors: the
    // floor division that assigns grid cells always advances by exactly 2
    // with no rounding ambiguity, guaranteeing 4 distinct cells. A 2D grid
    // (not a line) keeps every point well inside the viewport regardless of
    // how large TARGET_CELL_PT makes a cell relative to the region.
    const venues: ClusterableVenue[] = [0, 1, 2, 3].map((i) => ({
      id: `v${i}`,
      lat: (Math.floor(i / 2) - 0.5) * step,
      lng: ((i % 2) - 0.5) * step,
    }));

    const placements = computeMapPlacements(venues, WIDE_REGION, 50);

    expect(placements).toHaveLength(4);
    expect(placements.every((p) => p.kind === "single")).toBe(true);
    const ids = placements
      .filter((p): p is Extract<typeof p, { kind: "single" }> => p.kind === "single")
      .map((p) => p.venueId)
      .sort();
    expect(ids).toEqual(venues.map((v) => v.id).sort());
  });

  it("adaptively coarsens the grid until placements fit under maxItems", () => {
    const cellSize = cellSizeDegFor(WIDE_REGION);
    const maxItems = 3;
    const step = cellSize * 1.1;
    // Eight venues as four co-located pairs on a 2x2 grid, offset into the
    // all-positive quadrant. The offset matters: a zero-centered grid
    // straddles the origin, and floor binning then splits it 2x2 at EVERY
    // cell scale, so coarsening could never converge. All-positive points
    // within a couple of cells of the origin land in 4 distinct initial
    // cells (over maxItems, so coarsening must run) and provably collapse
    // to a single cell once the cell size doubles past their span.
    const venues: ClusterableVenue[] = Array.from({ length: 8 }, (_, i) => ({
      id: `v${i}`,
      lat: 0.1 * cellSize + Math.floor((i % 4) / 2) * step,
      lng: 0.1 * cellSize + ((i % 4) % 2) * step,
    }));

    const placements = computeMapPlacements(venues, WIDE_REGION, maxItems);

    expect(placements.length).toBeLessThanOrEqual(maxItems);

    // No venue was dropped by coarsening — every input id shows up exactly
    // once across singles and cluster member lists.
    const seenIds = placements.flatMap((p) =>
      p.kind === "single" ? [p.venueId] : p.memberIds
    );
    expect(seenIds.sort()).toEqual(venues.map((v) => v.id).sort());

    // Pigeonhole: 8 venues packed into <= 3 placements can't all be
    // singles, so at least one placement must be a multi-member cluster —
    // i.e. coarsening actually merged something, not just happened to fit.
    expect(placements.some((p) => p.kind === "cluster")).toBe(true);
  });

  it("excludes venues outside the viewport, including its small margin", () => {
    const region: MapRegion = {
      latitude: 43.65,
      longitude: -79.4,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
    // Viewport half-extent is 0.05 + 15% margin (0.015) = 0.065 degrees.
    const inside: ClusterableVenue = { id: "inside", lat: 43.65, lng: -79.4 + 0.06 };
    const justOutside: ClusterableVenue = {
      id: "outside",
      lat: 43.65,
      lng: -79.4 + 0.09,
    };

    const placements = computeMapPlacements([inside, justOutside], region, 50);

    const ids = placements.flatMap((p) => (p.kind === "single" ? [p.venueId] : p.memberIds));
    expect(ids).toEqual(["inside"]);
  });

  it("is deterministic: identical inputs (in any order) produce identical, stably-ordered output", () => {
    const cellSize = cellSizeDegFor(WIDE_REGION);
    const venues: ClusterableVenue[] = [
      { id: "a", lat: 0, lng: 0 },
      { id: "b", lat: 0, lng: cellSize * 2 },
      { id: "c", lat: 0, lng: cellSize * 4 },
      { id: "d", lat: 0.00001, lng: 0.00001 }, // shares a's cell
      { id: "e", lat: 0, lng: cellSize * 6 },
    ];
    const shuffled = [venues[3]!, venues[0]!, venues[4]!, venues[1]!, venues[2]!];

    const first = computeMapPlacements(venues, WIDE_REGION, 50);
    const second = computeMapPlacements(shuffled, WIDE_REGION, 50);

    expect(second).toEqual(first);

    // Recomputing with the exact same inputs again must not churn either.
    const third = computeMapPlacements(venues, WIDE_REGION, 50);
    expect(third).toEqual(first);
  });

  it("returns an empty array when no venues are visible", () => {
    expect(computeMapPlacements([], WIDE_REGION, 50)).toEqual([]);
  });
});
