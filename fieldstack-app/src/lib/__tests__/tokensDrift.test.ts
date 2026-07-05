/**
 * Guards against hand-editing the generated theme palette (or tokens.json)
 * without regenerating. design/tokens.json is the single source of truth for
 * color/spacing/radius/font-size tokens shared by the app and the site;
 * fieldstack-app/src/theme/palette.ts is generated from it via
 * `node design/generate.mjs`. If this test fails, someone edited one side
 * without regenerating — run the generator and commit the result.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  darkColors,
  fontSizeScale,
  lightColors,
  radiusScale,
  spacingScale,
} from "../../theme/palette";

type TokensJson = {
  color: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
  spacing: Record<string, number>;
  radius: Record<string, number>;
  fontSize: Record<string, number>;
};

// fieldstack-app/src/lib/__tests__ -> repo root -> design/tokens.json.
const tokensPath = path.join(__dirname, "../../../../design/tokens.json");
const tokens = JSON.parse(readFileSync(tokensPath, "utf8")) as TokensJson;

describe("design tokens drift guard", () => {
  it("palette.ts light colors match design/tokens.json", () => {
    expect(lightColors).toEqual(tokens.color.light);
  });

  it("palette.ts dark colors match design/tokens.json", () => {
    expect(darkColors).toEqual(tokens.color.dark);
  });

  it("palette.ts spacing/radius/font-size scales match design/tokens.json", () => {
    expect(spacingScale).toEqual(tokens.spacing);
    expect(radiusScale).toEqual(tokens.radius);
    expect(fontSizeScale).toEqual(tokens.fontSize);
  });
});
