#!/usr/bin/env node
// Generates fieldstack-app/src/theme/palette.ts and site/app/tokens.css from
// design/tokens.json — the single source of design tokens for both the app
// and the site. Run: `node design/generate.mjs` (plain Node, no deps).
//
// Do NOT hand-edit either generated file: edit design/tokens.json, then
// re-run this script. fieldstack-app/src/lib/__tests__/tokensDrift.test.ts
// fails CI if the two get out of sync.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const tokens = JSON.parse(
  readFileSync(path.join(__dirname, "tokens.json"), "utf8")
);

const GENERATED_HEADER =
  "GENERATED from design/tokens.json — do not edit by hand; run `node design/generate.mjs`.";

function tsObjectLiteral(obj, indent = "  ") {
  const lines = Object.entries(obj).map(
    ([key, value]) => `${indent}${key}: ${JSON.stringify(value)},`
  );
  return `{\n${lines.join("\n")}\n}`;
}

function writePaletteTs() {
  const { color, spacing, radius, fontSize } = tokens;
  const out = `// ${GENERATED_HEADER}

import type { ThemeColors } from "./tokens";

export const lightColors: ThemeColors = ${tsObjectLiteral(color.light)};

export const darkColors: ThemeColors = ${tsObjectLiteral(color.dark)};

export const spacingScale = ${tsObjectLiteral(spacing)} as const;

export const radiusScale = ${tsObjectLiteral(radius)} as const;

export const fontSizeScale = ${tsObjectLiteral(fontSize)} as const;
`;
  const outPath = path.join(repoRoot, "fieldstack-app/src/theme/palette.ts");
  writeFileSync(outPath, out);
  return outPath;
}

// camelCase -> kebab-case (textPrimary -> text-primary, onFoil -> on-foil).
function kebab(key) {
  return key.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function colorVars(colorTokens, indent) {
  return Object.entries(colorTokens)
    .map(([key, value]) => `${indent}--${kebab(key)}: ${value};`)
    .join("\n");
}

function scaleVars(scale, prefix, unit, indent) {
  return Object.entries(scale)
    .map(([key, value]) => `${indent}--${prefix}-${kebab(key)}: ${value}${unit};`)
    .join("\n");
}

function writeTokensCss() {
  const { color, spacing, radius, fontSize } = tokens;
  const out = `/* ${GENERATED_HEADER} */

:root {
${colorVars(color.light, "  ")}

${scaleVars(spacing, "space", "px", "  ")}

${scaleVars(radius, "radius", "px", "  ")}

${scaleVars(fontSize, "font-size", "px", "  ")}
}

@media (prefers-color-scheme: dark) {
  :root {
${colorVars(color.dark, "    ")}
  }
}

:root[data-theme="dark"] {
${colorVars(color.dark, "  ")}
}

:root[data-theme="light"] {
${colorVars(color.light, "  ")}
}
`;
  const outPath = path.join(repoRoot, "site/app/tokens.css");
  writeFileSync(outPath, out);
  return outPath;
}

const written = [writePaletteTs(), writeTokensCss()];
for (const file of written) {
  console.log(`wrote ${path.relative(repoRoot, file)}`);
}
