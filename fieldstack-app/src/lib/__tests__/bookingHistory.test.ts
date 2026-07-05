import { cloudSyncableAttempts, type BookingAttempt } from "../bookingHistory";

// bookingHistory.tsx pulls in ./auth -> ./supabase, which throws at import
// time under Node's Jest environment (no native WebSocket — see
// socialAuth.test.ts for the same workaround). We only exercise the pure
// merge-filter helper here, so stub the client out entirely.
jest.mock("../supabase", () => ({ supabase: {} }));

function attempt(
  id: string,
  startTime: string | null,
  duration: number | null
): BookingAttempt {
  return {
    id,
    fieldId: `field-${id}`,
    venueId: `venue-${id}`,
    attemptedAt: 1_700_000_000_000,
    date: "2026-07-04",
    startTime,
    duration,
  };
}

describe("cloudSyncableAttempts", () => {
  it("keeps a fully-slotted attempt", () => {
    const attempts = [attempt("a", "18:00", 60)];
    expect(cloudSyncableAttempts(attempts)).toEqual(attempts);
  });

  it("drops a slot-less attempt (null startTime and duration)", () => {
    const attempts = [attempt("a", null, null)];
    expect(cloudSyncableAttempts(attempts)).toEqual([]);
  });

  it("drops an attempt with only startTime null", () => {
    const attempts = [attempt("a", null, 60)];
    expect(cloudSyncableAttempts(attempts)).toEqual([]);
  });

  it("drops an attempt with only duration null", () => {
    const attempts = [attempt("a", "18:00", null)];
    expect(cloudSyncableAttempts(attempts)).toEqual([]);
  });

  it("filters a mixed batch without poisoning the whole thing — one bad row no longer drops every row", () => {
    const good = attempt("good", "19:00", 90);
    const bad = attempt("bad", null, null);
    const alsoGood = attempt("also-good", "07:00", 30);
    expect(cloudSyncableAttempts([good, bad, alsoGood])).toEqual([good, alsoGood]);
  });

  it("returns an empty array unchanged", () => {
    expect(cloudSyncableAttempts([])).toEqual([]);
  });
});
