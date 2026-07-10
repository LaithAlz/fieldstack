#!/usr/bin/env bash
# Boot an iOS simulator, open the Onside app in Expo Go via Metro, and
# screenshot BOTH appearances (light + dark).
#
# Run from: fieldstack-app/ (Metro must serve this project's bundle).
# Usage:
#   ./../.claude/skills/onside-diagnostics-and-tooling/scripts/sim-verify.sh [device] [out-dir]
# Defaults: device "iPhone 15 Pro", out-dir ./sim-shots (gitignored territory:
# keep out-dir outside the repo or delete after use).
#
# Notes:
# - Uses `npx expo start` directly, NOT `npm start`, so the prestart
#   sync-api-url hook does not rewrite fieldstack-app/.env.
# - Deep links (onside://...) do NOT route inside Expo Go: the app's linking
#   prefixes are ["onside://"] only (App.tsx) and Expo Go owns the exp://
#   scheme. Verifying deep links needs a dev build.
set -euo pipefail

DEVICE="${1:-iPhone 15 Pro}"
OUT="${2:-$PWD/sim-shots}"
mkdir -p "$OUT"

if [ ! -f package.json ] || ! grep -q '"onside-app"' package.json; then
  echo "[sim-verify] run this from fieldstack-app/ (package name onside-app)"; exit 1
fi

# 1. Boot the simulator (idempotent) and wait for boot to finish.
xcrun simctl bootstatus "$DEVICE" -b
open -a Simulator || true   # show the window; screenshots work headless too

# 2. Metro: reuse a running server on :8081, else start one in background.
STARTED_METRO=0
if ! curl -s --max-time 2 http://127.0.0.1:8081/status | grep -q running; then
  echo "[sim-verify] starting Metro in background (log: $OUT/metro.log)"
  (npx expo start --port 8081 >"$OUT/metro.log" 2>&1 &)
  for _ in $(seq 1 30); do
    curl -s --max-time 2 http://127.0.0.1:8081/status 2>/dev/null | grep -q running && break
    sleep 2
  done
  curl -s --max-time 2 http://127.0.0.1:8081/status | grep -q running \
    || { echo "[sim-verify] Metro failed to start; see $OUT/metro.log"; exit 1; }
  STARTED_METRO=1
fi

# 3. Point Expo Go (host.exp.Exponent) at Metro. First bundle build ~60-90s.
xcrun simctl openurl booted "exp://127.0.0.1:8081"
echo "[sim-verify] waiting for the JS bundle to build and the app to load..."
sleep 90

# 4. Screenshot both appearances.
for MODE in light dark; do
  xcrun simctl ui booted appearance "$MODE"
  sleep 2
  xcrun simctl io booted screenshot "$OUT/app-$MODE.png"
done

echo "[sim-verify] wrote $OUT/app-light.png and $OUT/app-dark.png"
if [ "$STARTED_METRO" = "1" ]; then
  echo "[sim-verify] Metro left running on :8081 (stop with: pkill -f 'expo start')"
fi
