import { parseTokensFromRedirect } from "../socialAuth";

// The module under test imports ./supabase, which throws at load without the
// EXPO_PUBLIC_* env. We only exercise the pure URL parser here, so stub it.
// (jest.mock is hoisted above the import by babel-jest, so this still works.)
jest.mock("../supabase", () => ({ supabase: {} }));

describe("parseTokensFromRedirect", () => {
  it("extracts implicit-flow tokens from the URL fragment", () => {
    const url = "onside://#access_token=abc.def.ghi&refresh_token=r123&token_type=bearer";
    expect(parseTokensFromRedirect(url)).toEqual({
      access_token: "abc.def.ghi",
      refresh_token: "r123",
    });
  });

  it("returns null when there's no fragment", () => {
    expect(parseTokensFromRedirect("onside://")).toBeNull();
    expect(parseTokensFromRedirect("onside://?code=xyz")).toBeNull();
  });

  it("returns null when either token is missing", () => {
    expect(parseTokensFromRedirect("onside://#access_token=only")).toBeNull();
    expect(parseTokensFromRedirect("onside://#refresh_token=only")).toBeNull();
  });

  it("ignores unrelated fragment params", () => {
    const url = "onside://#expires_in=3600&access_token=a&refresh_token=b&provider_token=p";
    expect(parseTokensFromRedirect(url)).toEqual({ access_token: "a", refresh_token: "b" });
  });
});
