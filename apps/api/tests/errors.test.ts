import { describe, expect, it } from "bun:test";

import { ApiError } from "../src/lib/errors.js";

// ApiError is the contract the global error handler in src/index.ts depends on:
// it reads `statusCode`, `message`, and the optional `code`. These tests pin
// that shape so a refactor of the class can't silently change the wire response.
describe("ApiError", () => {
  it("carries the status code and message", () => {
    const err = new ApiError(404, "venue not found");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("venue not found");
  });

  it("exposes an optional machine-readable code", () => {
    const err = new ApiError(404, "venue not found", "VENUE_NOT_FOUND");
    expect(err.code).toBe("VENUE_NOT_FOUND");
  });

  it("leaves code undefined when omitted", () => {
    expect(new ApiError(500, "boom").code).toBeUndefined();
  });

  it("is a real Error subclass named ApiError", () => {
    const err = new ApiError(400, "bad request");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe("ApiError");
  });

  it("is throwable and recoverable as an ApiError", () => {
    try {
      throw new ApiError(403, "nope", "FORBIDDEN");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).statusCode).toBe(403);
      expect((e as ApiError).code).toBe("FORBIDDEN");
    }
  });
});
