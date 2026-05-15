import { resolveFieldPhotos } from "../fieldPhotos";

describe("resolveFieldPhotos", () => {
  const venuePhotos = ["v1.jpg", "v2.jpg"];

  it("uses field photos when present", () => {
    expect(resolveFieldPhotos(["f1.jpg"], venuePhotos)).toEqual(["f1.jpg"]);
  });

  it("falls back to venue photos when field is null", () => {
    expect(resolveFieldPhotos(null, venuePhotos)).toBe(venuePhotos);
  });

  it("falls back to venue photos when field is undefined", () => {
    expect(resolveFieldPhotos(undefined, venuePhotos)).toBe(venuePhotos);
  });

  it("falls back to venue photos when field is empty array", () => {
    expect(resolveFieldPhotos([], venuePhotos)).toBe(venuePhotos);
  });

  it("returns empty array when both are empty", () => {
    expect(resolveFieldPhotos(null, [])).toEqual([]);
  });
});
