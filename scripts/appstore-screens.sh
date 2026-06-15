#!/usr/bin/env bash
# Resize raw simulator screenshots to an App Store slot size.
#
# Pairs with `.maestro/screenshots.yaml`, which captures the screens at the
# simulator's native resolution. App Store Connect requires exact pixel
# dimensions per device slot, so resample here.
#
# Usage:
#   scripts/appstore-screens.sh <src-dir> [out-dir] [WIDTHxHEIGHT]
#
# Defaults to the iPhone 6.5" slot (1284x2778), which — per App Store Connect —
# covers all iPhone display sizes if you provide only that set. Use 1320x2868
# for the 6.9" slot if you captured on an iPhone 16 Pro Max.
set -euo pipefail

SRC="${1:?usage: appstore-screens.sh <src-dir> [out-dir] [WxH]}"
OUT="${2:-$SRC/appstore}"
SIZE="${3:-1284x2778}"
W="${SIZE%x*}"
H="${SIZE#*x}"

mkdir -p "$OUT"
count=0
for f in "$SRC"/*.png; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  cp "$f" "$OUT/$base"
  sips -z "$H" "$W" "$OUT/$base" >/dev/null
  count=$((count + 1))
done

echo "Wrote $count screenshot(s) to $OUT at ${W}x${H}"
