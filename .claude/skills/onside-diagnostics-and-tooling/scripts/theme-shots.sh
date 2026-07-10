#!/usr/bin/env bash
# Screenshot a web page in BOTH color schemes with Playwright.
# The Onside site is theme-aware (prefers-color-scheme + data-theme override),
# so every visual check must cover light and dark.
#
# Usage (any cwd):
#   theme-shots.sh <url> [out-prefix] [WxH]
# Examples:
#   theme-shots.sh https://getonside.ca site
#   theme-shots.sh http://localhost:3001/venues venues 1280x2400
#
# Requires: node/npx. First run downloads the playwright package via npx;
# if Chromium is missing, run: npx -y playwright@1.61.1 install chromium
set -euo pipefail

URL="${1:?usage: theme-shots.sh <url> [out-prefix] [WxH]}"
PREFIX="${2:-shot}"
SIZE="${3:-1280,900}"
SIZE="${SIZE/x/,}"

for SCHEME in light dark; do
  npx -y playwright@1.61.1 screenshot \
    --color-scheme="$SCHEME" \
    --viewport-size="$SIZE" \
    --wait-for-timeout=1500 \
    "$URL" "${PREFIX}-${SCHEME}.png"
done

echo "wrote ${PREFIX}-light.png and ${PREFIX}-dark.png"
