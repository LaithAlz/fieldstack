import { describe, expect, it } from "bun:test";

import {
  buildResolutionLookup,
  classifyName,
  evaluateFacilityEvidence,
  facilityScore,
  isStrongFacility,
  resolveAddressCluster,
  ORG_SIGNAL,
  DENY_SIGNAL,
  type ClusterVenue,
  type EvidenceField,
} from "../scripts/scrape/lib/refineClassifier.js";
import type { Operator } from "../scripts/scrape/lib/registry.js";

function operator(overrides: Partial<Operator>): Operator {
  return {
    name: "Example Operator",
    integrationType: "none",
    aliases: [],
    ...overrides,
  };
}

describe("classifyName — league/indoor gap (issue #497)", () => {
  it("classifies a league whose name happens to say 'indoor' as an org, not a facility", () => {
    // The concrete bug refine.ts shipped with: FACILITY_SIGNAL matched bare
    // "indoor", so this league read as a facility and was never a
    // deactivation candidate at all.
    expect(classifyName("Greater Toronto Indoor Soccer League")).toBe("org");
    expect(classifyName("Downsview Indoor Soccer League")).toBe("org");
  });

  it("still recognizes real facilities that use 'indoor' alongside a strong signal", () => {
    expect(classifyName("Infinite Sports | Brampton Indoor Turf")).toBe("facility");
    expect(classifyName("Milton Indoor Turf Centre")).toBe("facility");
  });

  it("keeps a bare-indoor facility name active when it isn't also an org name", () => {
    // No club/academy/league word here, so it was never an org candidate —
    // tightening the facility signal must not flip this to "org".
    expect(classifyName("Action Indoor Sports Hamilton")).toBe("facility");
    expect(classifyName("Durham Indoor Soccer Centre")).toBe("facility");
    expect(classifyName("Com Dev Indoor Soccer Park")).toBe("facility");
  });

  it("catches plural org tokens ('Leagues' escaped the singular-only pattern)", () => {
    // "Allstar Soccer Leagues" is a tenant league at 360 Soccer Centre
    // (data/dedupe-resolutions.yaml) — \bleague\b missed the plural.
    expect(classifyName("Allstar Soccer Leagues")).toBe("org");
    expect(classifyName("Toronto Soccer Clubs")).toBe("org");
  });
});

describe("classifyName — FC/SC word-boundary suffixes", () => {
  it("classifies 'FC Barcelona Academy' as an org (FC + academy, no strong facility word)", () => {
    expect(classifyName("FC Barcelona Academy")).toBe("org");
  });

  it("classifies 'Toronto FC' and 'Barcelona SC' style names as org candidates", () => {
    expect(classifyName("Toronto United FC")).toBe("org");
    expect(classifyName("Barcelona SC")).toBe("org");
  });

  // Documented decision: "Soccer FC Arena" is ambiguous on the name alone —
  // it has an org token (FC) AND a strong facility token (Arena). The
  // existing design rule (see refine.ts header) is that a STRONG facility
  // signal always wins, even alongside an org word, because false-negatives
  // there (dropping a real bookable arena) are worse than the reverse. So
  // this classifies as "facility" and is never even a deactivation
  // candidate. If a name like this turns out to actually be a club that
  // doesn't rent by the hour, it belongs on the ALLOWLIST-adjacent manual
  // review path, not a heuristic tightening that would risk real arenas.
  it("resolves the FC/Arena ambiguous case in favor of the strong facility signal", () => {
    expect(classifyName("Soccer FC Arena")).toBe("facility");
    expect(isStrongFacility("Soccer FC Arena")).toBe(true);
    expect(ORG_SIGNAL.test("Soccer FC Arena")).toBe(true);
  });

  it("does not false-positive plain words containing 'fc'/'sc' as substrings", () => {
    expect(ORG_SIGNAL.test("Scarborough Soccer Centre")).toBe(false);
    expect(ORG_SIGNAL.test("Discovery Sports Park")).toBe(false);
  });
});

describe("classifyName — deny signal", () => {
  it("denies retail/other-sport rows regardless of other words", () => {
    expect(classifyName("Soccer World Warehouse")).toBe("deny");
    expect(classifyName("FarAway Greens Indoor Golf")).toBe("deny");
  });

  it("denies kids'-playground rows the wide Google net pulls in (issue #497)", () => {
    expect(classifyName("Kidsports Indoor Playground in Mississauga")).toBe("deny");
    expect(
      classifyName("Air Riderz Mississauga - Kids Indoor Playground & Birthday Party Place")
    ).toBe("deny");
  });

  it("deny wins over a strong facility word if one is somehow present", () => {
    expect(DENY_SIGNAL.test("Playground Sports Complex")).toBe(true);
    expect(classifyName("Playground Sports Complex")).toBe("deny");
  });
});

describe("facilityScore", () => {
  it("scores a bare-indoor name above zero (dedupe tie-break still uses it)", () => {
    expect(facilityScore("Action Indoor Sports Hamilton")).toBeGreaterThan(0);
  });

  it("scores a name with no facility words at all as zero", () => {
    expect(facilityScore("Greater Toronto Soccer League")).toBe(0);
  });

  it("scores dome/turf/arena higher than bare indoor", () => {
    const indoorOnly = facilityScore("Some Indoor Place");
    expect(facilityScore("Some Sports Dome")).toBeGreaterThan(indoorOnly);
    expect(facilityScore("Some Turf Place")).toBeGreaterThan(indoorOnly);
    expect(facilityScore("Some Arena")).toBeGreaterThan(indoorOnly);
  });
});

describe("evaluateFacilityEvidence — override precedence (issue #497, mandatory)", () => {
  const noOperators: Operator[] = [];

  it("fires when an active field has a price", () => {
    const fields: EvidenceField[] = [{ price_per_hour: 120, booking_url: null }];
    const result = evaluateFacilityEvidence(
      { name: "Some Soccer Club", hours: null, fields },
      noOperators
    );
    expect(result.fires).toBe(true);
    expect(result.reason).toMatch(/price/);
  });

  it("fires when an active field has a genuine booking/reservation URL", () => {
    const fields: EvidenceField[] = [
      { price_per_hour: null, booking_url: "https://someclub.ca/book" },
    ];
    const result = evaluateFacilityEvidence(
      { name: "Some Soccer Club", hours: null, fields },
      noOperators
    );
    expect(result.fires).toBe(true);
    expect(result.reason).toMatch(/booking-intent/);
  });

  it("fires when an active field's booking_url is on a known booking platform", () => {
    const fields: EvidenceField[] = [
      {
        price_per_hour: null,
        booking_url: "https://www.catchcorner.com/facility-page/someclub/home",
      },
    ];
    const result = evaluateFacilityEvidence(
      { name: "Some Soccer Club", hours: null, fields },
      noOperators
    );
    expect(result.fires).toBe(true);
  });

  it("does NOT fire for a plain marketing homepage booking_url (the empirical false-positive)", () => {
    // A real prod dry run showed nearly every org candidate has its own
    // website (googlePlaces.ts fills a field's booking_url from the
    // place's scraped website), which would defeat the whole pass if any
    // non-null booking_url counted as evidence. A homepage is exactly what
    // an operator-inherited fallback link also looks like — "beyond" it
    // means an actual booking/reservation destination, not just a website.
    const fields: EvidenceField[] = [
      { price_per_hour: null, booking_url: "https://gtisl.ca/" },
    ];
    const result = evaluateFacilityEvidence(
      { name: "Greater Toronto Indoor Soccer League", hours: null, fields },
      noOperators
    );
    expect(result.fires).toBe(false);
  });

  it("does not fire for a plain org row with no price, booking_url, hours, or operator match", () => {
    const result = evaluateFacilityEvidence(
      { name: "Markham Soccer Club", hours: null, fields: [] },
      noOperators
    );
    expect(result.fires).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("fires when the name matches an operators.yaml entry by name", () => {
    const operators = [operator({ name: "GTA Soccer Club", aliases: [] })];
    const result = evaluateFacilityEvidence(
      { name: "GTA Soccer Club", hours: null, fields: [] },
      operators
    );
    expect(result.fires).toBe(true);
    expect(result.reason).toMatch(/operators\.yaml/);
  });

  it("fires when the name matches an operators.yaml entry by alias", () => {
    const operators = [
      operator({ name: "The Soccer Centre", aliases: ["Zanchin Automotive Soccer Centre"] }),
    ];
    const result = evaluateFacilityEvidence(
      { name: "Zanchin Automotive Soccer Centre", hours: null, fields: [] },
      operators
    );
    expect(result.fires).toBe(true);
  });

  it("fires when the venue carries hours, even with no operator or field evidence", () => {
    const result = evaluateFacilityEvidence(
      {
        name: "Some Soccer Club",
        hours: { mon: "09:00-21:00" },
        fields: [],
      },
      noOperators
    );
    expect(result.fires).toBe(true);
    expect(result.reason).toMatch(/hours/);
  });

  it("treats an empty hours object the same as no hours", () => {
    const result = evaluateFacilityEvidence(
      { name: "Some Soccer Club", hours: {}, fields: [] },
      noOperators
    );
    expect(result.fires).toBe(false);
  });

  it("ignores a zero price (falsy but not evidence-absent) correctly as real evidence", () => {
    // price_per_hour = 0 is a real (if odd) price, not "no price" — must not
    // be treated as absent via a falsy check.
    const fields: EvidenceField[] = [{ price_per_hour: 0, booking_url: null }];
    const result = evaluateFacilityEvidence(
      { name: "Some Soccer Club", hours: null, fields },
      noOperators
    );
    expect(result.fires).toBe(true);
  });

  it("handles a numeric-string price (as Postgres numeric columns often arrive over PostgREST)", () => {
    const fields: EvidenceField[] = [{ price_per_hour: "45.00", booking_url: null }];
    const result = evaluateFacilityEvidence(
      { name: "Some Soccer Club", hours: null, fields },
      noOperators
    );
    expect(result.fires).toBe(true);
    expect(result.reason).toMatch(/45/);
  });

  it("checks fields in order and finds evidence on a later field in the list", () => {
    const fields: EvidenceField[] = [
      { price_per_hour: null, booking_url: null },
      { price_per_hour: null, booking_url: "https://someclub.ca/book" },
    ];
    const result = evaluateFacilityEvidence(
      { name: "Some Soccer Club", hours: null, fields },
      noOperators
    );
    expect(result.fires).toBe(true);
  });
});

describe("end-to-end: org classification + override precedence together", () => {
  it("an org candidate with no evidence is a real deactivation target", () => {
    expect(classifyName("Markham Soccer Club")).toBe("org");
    const result = evaluateFacilityEvidence(
      { name: "Markham Soccer Club", hours: null, fields: [] },
      []
    );
    expect(result.fires).toBe(false);
  });

  it("an org candidate with a priced field is classified org but survives via override", () => {
    expect(classifyName("Oakville Soccer Club")).toBe("org");
    const result = evaluateFacilityEvidence(
      {
        name: "Oakville Soccer Club",
        hours: null,
        fields: [{ price_per_hour: 80, booking_url: null }],
      },
      []
    );
    expect(result.fires).toBe(true);
  });

  it("a deny row is never subject to the override, even with a price on it", () => {
    // Deny classification short-circuits before the evidence check ever
    // runs in refine.ts — evaluateFacilityEvidence isn't even reachable for
    // a "deny" nameClass. Documented here since it's a load-bearing branch
    // order in refine.ts's pass 1.
    expect(classifyName("Soccer World Warehouse")).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// Pass-2 protections (issue #497 extension): resolutions respect and the
// facility-evidence shield in refine.ts's address-cluster dedupe.
// ---------------------------------------------------------------------------

function clusterVenue(id: string, externalId: string, name: string): ClusterVenue {
  return { id, external_id: externalId, name };
}

const NO_RESOLUTION = () => null;
const NO_EVIDENCE = () => false;

describe("buildResolutionLookup", () => {
  it("matches a pair regardless of a/b order", () => {
    const lookup = buildResolutionLookup([
      { a: "google:aaa", b: "google:bbb", verdict: "distinct" },
    ]);
    expect(lookup("google:aaa", "google:bbb")).toEqual({
      verdict: "distinct",
      keep: undefined,
    });
    expect(lookup("google:bbb", "google:aaa")).toEqual({
      verdict: "distinct",
      keep: undefined,
    });
  });

  it("returns null for an unrecorded pair", () => {
    const lookup = buildResolutionLookup([
      { a: "google:aaa", b: "google:bbb", verdict: "distinct" },
    ]);
    expect(lookup("google:aaa", "google:ccc")).toBeNull();
  });

  it("carries the merge keeper through", () => {
    const lookup = buildResolutionLookup([
      { a: "google:aaa", b: "google:bbb", verdict: "merge", keep: "google:bbb" },
    ]);
    expect(lookup("google:bbb", "google:aaa")).toEqual({
      verdict: "merge",
      keep: "google:bbb",
    });
  });
});

describe("resolveAddressCluster — resolutions respect", () => {
  // THE regression case (issue #497 extension): both names score 0 on
  // facility signal ("Soccer Centre" matches no FACILITY_SIGNAL entry), so
  // the raw tie-break picked the SHORTER name, "East Toronto Soccer" — a
  // tenant club — and deactivated the real Scarborough Soccer Centre
  // facility, contradicting the human "distinct" verdict recorded in
  // data/dedupe-resolutions.yaml during the #495 adjudication.
  const scarborough = clusterVenue(
    "v1",
    "google:ChIJKWPS33nO1IkRLNyewXcZ2-I",
    "Scarborough Soccer Centre"
  );
  const eastToronto = clusterVenue(
    "v2",
    "google:ChIJQwIxnynP1IkRZJefwhdqnvY",
    "East Toronto Soccer"
  );

  it("documents the raw tie-break bug: without protections the facility loses", () => {
    const decisions = resolveAddressCluster(
      [scarborough, eastToronto],
      NO_RESOLUTION,
      NO_EVIDENCE
    );
    expect(decisions).toHaveLength(1);
    const d = decisions[0]!;
    expect(d.type).toBe("deactivate");
    if (d.type === "deactivate") {
      expect(d.venue).toBe(scarborough); // the real facility — the bug
      expect(d.winner).toBe(eastToronto);
    }
  });

  it("a distinct verdict protects both sides (the Scarborough regression)", () => {
    const lookup = buildResolutionLookup([
      {
        a: eastToronto.external_id,
        b: scarborough.external_id,
        verdict: "distinct",
      },
    ]);
    const decisions = resolveAddressCluster(
      [scarborough, eastToronto],
      lookup,
      NO_EVIDENCE
    );
    expect(decisions).toEqual([]); // nobody deactivated, nobody needs-human
  });

  it("a merge verdict defers to the registry keeper even when the tie-break disagrees", () => {
    // The Brampton case: "Soccer Centre Parking" (a parking-lot POI) beats
    // "Brampton Soccer Centre" on name length under the raw tie-break, but
    // the registry records the merge with the real facility as keeper.
    const bsc = clusterVenue(
      "v3",
      "google:ChIJEXH7IU8WK4gRncueD_nXOWY",
      "Brampton Soccer Centre"
    );
    const parking = clusterVenue(
      "v4",
      "google:ChIJI6wGnXcXK4gRuzGcl09Sn0c",
      "Soccer Centre Parking"
    );
    const lookup = buildResolutionLookup([
      { a: parking.external_id, b: bsc.external_id, verdict: "merge", keep: bsc.external_id },
    ]);
    const decisions = resolveAddressCluster([bsc, parking], lookup, NO_EVIDENCE);
    expect(decisions).toHaveLength(1);
    const d = decisions[0]!;
    expect(d.type).toBe("deactivate");
    if (d.type === "deactivate") {
      expect(d.venue).toBe(parking);
      expect(d.winner).toBe(bsc);
      expect(d.reason).toContain("dedupe-resolutions.yaml");
    }
  });

  it("after a merge deferral, later candidates are judged against the registry keeper", () => {
    const bsc = clusterVenue("v3", "google:bsc", "Brampton Soccer Centre");
    const parking = clusterVenue("v4", "google:parking", "Soccer Centre Parking");
    const dixie = clusterVenue(
      "v5",
      "google:dixie",
      "Dixie-Sandalwood Artificial Soccer fields"
    );
    const lookup = buildResolutionLookup([
      { a: "google:parking", b: "google:bsc", verdict: "merge", keep: "google:bsc" },
    ]);
    const decisions = resolveAddressCluster([bsc, parking, dixie], lookup, NO_EVIDENCE);
    expect(decisions).toHaveLength(2);
    const losers = decisions
      .filter((d) => d.type === "deactivate")
      .map((d) => (d.type === "deactivate" ? d.venue.external_id : ""));
    expect(losers).toContain("google:parking");
    expect(losers).toContain("google:dixie");
    for (const d of decisions) {
      if (d.type === "deactivate") expect(d.winner).toBe(bsc);
    }
  });
});

describe("resolveAddressCluster — facility-evidence shield", () => {
  const facility = clusterVenue("v1", "google:facility", "Scarborough Soccer Centre");
  const club = clusterVenue("v2", "google:club", "East Toronto Soccer");

  it("a venue with evidence never loses to one without (winner swaps)", () => {
    // No registry entry for the pair — the shield alone must save the
    // facility from the shortest-name tie-break.
    const hasEvidence = (v: ClusterVenue) => v.external_id === "google:facility";
    const decisions = resolveAddressCluster([facility, club], NO_RESOLUTION, hasEvidence);
    expect(decisions).toHaveLength(1);
    const d = decisions[0]!;
    expect(d.type).toBe("deactivate");
    if (d.type === "deactivate") {
      expect(d.venue).toBe(club);
      expect(d.winner).toBe(facility);
    }
  });

  it("a pair where BOTH sides carry evidence is skipped as needs-human", () => {
    const decisions = resolveAddressCluster([facility, club], NO_RESOLUTION, () => true);
    expect(decisions).toHaveLength(1);
    const d = decisions[0]!;
    expect(d.type).toBe("needs-human");
    if (d.type === "needs-human") {
      // Neither side deactivated; both surfaced for a human.
      expect([d.a, d.b]).toContain(facility);
      expect([d.a, d.b]).toContain(club);
    }
  });

  it("resolution verdicts take precedence over the evidence shield", () => {
    // Distinct pair where the tie-break loser has evidence: the resolution
    // is checked first and simply keeps both — no swap, no needs-human.
    const lookup = buildResolutionLookup([
      { a: "google:facility", b: "google:club", verdict: "distinct" },
    ]);
    const decisions = resolveAddressCluster([facility, club], lookup, () => true);
    expect(decisions).toEqual([]);
  });

  it("keeps the plain tie-break when neither side has evidence or a resolution", () => {
    const a = clusterVenue("v1", "google:a", "Some Sports Dome");
    const b = clusterVenue("v2", "google:b", "Some Sports Dome Annex Building");
    const decisions = resolveAddressCluster([a, b], NO_RESOLUTION, NO_EVIDENCE);
    expect(decisions).toHaveLength(1);
    const d = decisions[0]!;
    if (d.type === "deactivate") {
      expect(d.venue).toBe(b); // weaker/wordier name loses, unchanged behavior
      expect(d.winner).toBe(a);
    }
  });

  it("after an evidence swap, later candidates are judged against the new winner", () => {
    const noise = clusterVenue("v1", "google:noise", "Short Name");
    const real = clusterVenue("v2", "google:real", "A Real Facility Row");
    const extra = clusterVenue("v3", "google:extra", "Another Long Venue Name Row");
    const hasEvidence = (v: ClusterVenue) => v.external_id === "google:real";
    const decisions = resolveAddressCluster([noise, real, extra], NO_RESOLUTION, hasEvidence);
    const deactivated = decisions.filter((d) => d.type === "deactivate");
    expect(deactivated).toHaveLength(2);
    for (const d of deactivated) {
      if (d.type === "deactivate") expect(d.winner).toBe(real);
    }
  });
});
