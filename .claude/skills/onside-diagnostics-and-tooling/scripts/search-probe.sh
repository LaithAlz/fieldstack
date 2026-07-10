#!/usr/bin/env bash
# Probe Onside's field-search API and print data-quality distributions.
#
# Usage (any cwd):
#   .claude/skills/onside-diagnostics-and-tooling/scripts/search-probe.sh [lat] [lng] [radius_km] [base_url]
#
# Defaults: downtown Toronto (Yonge & Queen area), 20 km, production API.
# Requires: curl, jq.
set -euo pipefail

LAT="${1:-43.6532}"
LNG="${2:--79.3832}"
RAD="${3:-20}"
BASE="${4:-https://api.getonside.ca}"

command -v jq >/dev/null || { echo "jq is required (brew install jq)"; exit 1; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

curl -sS --max-time 30 \
  "$BASE/search/fields?lat=$LAT&lng=$LNG&radius_km=$RAD&limit=200" -o "$TMP"

if ! jq -e '.error == null' "$TMP" >/dev/null 2>&1; then
  echo "API returned an error envelope:"
  jq . "$TMP" || cat "$TMP"
  exit 1
fi

echo "== $BASE  lat=$LAT lng=$LNG radius_km=$RAD =="
echo "total matches: $(jq .total "$TMP")   rows returned (limit 200): $(jq '.data|length' "$TMP")"
echo "distinct venues in page: $(jq '[.data[].venue.id] | unique | length' "$TMP")"

echo "-- venue_type distribution --"
jq -r '[.data[].venue.venue_type] | group_by(.) | map("\(.[0])\t\(length)") | .[]' "$TMP"

echo "-- price_per_hour --"
jq -r '{priced: [.data[].field.price_per_hour | select(. != null)] | length,
        null_price: [.data[].field.price_per_hour | select(. == null)] | length,
        min: ([.data[].field.price_per_hour | select(. != null)] | min),
        max: ([.data[].field.price_per_hour | select(. != null)] | max)}
       | to_entries[] | "\(.key)\t\(.value)"' "$TMP"

echo "-- booking_url coverage --"
jq -r '{with_booking_url: [.data[].field.booking_url | select(. != null)] | length,
        without: [.data[].field.booking_url | select(. == null)] | length}
       | to_entries[] | "\(.key)\t\(.value)"' "$TMP"

echo "-- booking_platform --"
jq -r '[.data[].field.booking_platform] | group_by(.) | map("\(.[0] // "null")\t\(length)") | .[]' "$TMP"

echo "-- distance_meters --"
jq -r '[.data[].distance_meters] | "min\t\(min | floor)\nmax\t\(max | floor)"' "$TMP"
