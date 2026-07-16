import { describe, it, expect } from "bun:test";
import { safeHttpUrl, safeHttpUrls } from "../scripts/scrape/lib/safeUrl.js";

describe("safeHttpUrl", () => {
  it("passes http and https URLs unchanged", () => {
    expect(safeHttpUrl("https://example.com/book")).toBe("https://example.com/book");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com");
  });

  it("rejects javascript:, data:, and other schemes", () => {
    expect(safeHttpUrl("javascript:alert(document.cookie)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
    expect(safeHttpUrl("tel:+15551234567")).toBeNull();
  });

  it("returns null for empty / malformed / missing input", () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
});

describe("safeHttpUrls", () => {
  it("keeps only the http(s) entries", () => {
    expect(
      safeHttpUrls(["https://a.com", "javascript:x", null, "http://b.com", "data:y"])
    ).toEqual(["https://a.com", "http://b.com"]);
  });

  it("returns [] for null/undefined/empty", () => {
    expect(safeHttpUrls(null)).toEqual([]);
    expect(safeHttpUrls(undefined)).toEqual([]);
    expect(safeHttpUrls([])).toEqual([]);
  });
});
