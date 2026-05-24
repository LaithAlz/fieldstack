#!/usr/bin/env bash
#
# Regenerate the FieldStack icon PNGs from their SVG sources.
# Run after editing any *.svg in assets/images/.
#
# Requires librsvg (rsvg-convert). Install via: brew install librsvg

set -euo pipefail

cd "$(dirname "$0")/../assets/images"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert not found. Install with: brew install librsvg" >&2
  exit 1
fi

echo "Regenerating icon PNGs from SVG..."

rsvg-convert -w 1024 -h 1024 icon.svg                       -o icon.png
rsvg-convert -w 1024 -h 1024 icon.svg                       -o splash-icon.png
rsvg-convert -w 1024 -h 1024 android-icon-background.svg    -o android-icon-background.png
rsvg-convert -w 1024 -h 1024 android-icon-foreground.svg    -o android-icon-foreground.png
rsvg-convert -w 1024 -h 1024 android-icon-monochrome.svg    -o android-icon-monochrome.png
rsvg-convert -w 48   -h 48   icon.svg                       -o favicon.png

echo "Done. Updated:"
ls -1 *.png
