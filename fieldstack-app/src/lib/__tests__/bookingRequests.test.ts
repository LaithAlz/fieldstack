import { buildBookingRequestInsert } from "../bookingRequests";

// bookingRequests.ts pulls in ./supabase, which throws at import time under
// Node's Jest environment (no native WebSocket — see bookingHistory.test.ts
// for the same workaround). buildBookingRequestInsert is a pure function, so
// stub the client out entirely rather than exercising it.
jest.mock("../supabase", () => ({ supabase: {} }));

const BASE = {
  userId: "user-1",
  fieldId: "field-1",
  venueId: "venue-1",
  requestedDate: "2026-07-10",
  startTime: "19:00",
  durationHours: 1.5,
};

describe("buildBookingRequestInsert", () => {
  it("maps camelCase inputs to the snake_case DB row shape", () => {
    expect(buildBookingRequestInsert({ ...BASE, note: "Bring pinnies please" })).toEqual({
      user_id: "user-1",
      field_id: "field-1",
      venue_id: "venue-1",
      requested_date: "2026-07-10",
      start_time: "19:00",
      duration_hours: 1.5,
      note: "Bring pinnies please",
    });
  });

  it("trims a note with surrounding whitespace", () => {
    const result = buildBookingRequestInsert({ ...BASE, note: "  Side entrance only  " });
    expect(result.note).toBe("Side entrance only");
  });

  it("collapses an empty note to null", () => {
    expect(buildBookingRequestInsert({ ...BASE, note: "" }).note).toBeNull();
  });

  it("collapses a whitespace-only note to null", () => {
    expect(buildBookingRequestInsert({ ...BASE, note: "   " }).note).toBeNull();
  });

  it("treats a missing note as null", () => {
    expect(buildBookingRequestInsert({ ...BASE }).note).toBeNull();
  });

  it("treats an explicit null note as null", () => {
    expect(buildBookingRequestInsert({ ...BASE, note: null }).note).toBeNull();
  });
});
