/**
 * Shared filter option lists + bucket helpers used by every surface that
 * exposes the field-search filter UI (ExploreScreen, FiltersSheet).
 * Keeping these in one place means the label "Indoor" or "Under $80"
 * never drifts between screens.
 */

import type { FilterOption } from "../components/FilterBottomSheet";
import type { FieldSize, FieldSurface, VenueType } from "../types/api";

import type { SearchSort } from "../api/search";

export const SURFACE_OPTIONS: FilterOption<FieldSurface>[] = [
  { id: "turf", label: "Turf" },
  { id: "grass", label: "Grass" },
  { id: "concrete", label: "Concrete" },
  { id: "indoor", label: "Indoor" },
];

export const SIZE_OPTIONS: FilterOption<FieldSize>[] = [
  { id: "3v3", label: "3-a-side" },
  { id: "5v5", label: "5-a-side" },
  { id: "7v7", label: "7-a-side" },
  { id: "11v11", label: "11-a-side" },
  { id: "futsal", label: "Futsal" },
];

export const VENUE_TYPE_OPTIONS: FilterOption<VenueType>[] = [
  { id: "public_park", label: "Public park" },
  { id: "private", label: "Private facility" },
  { id: "community_centre", label: "Community centre" },
];

export function venueTypeLabel(t: VenueType): string {
  return VENUE_TYPE_OPTIONS.find((o) => o.id === t)?.label ?? t;
}

export const SORT_OPTIONS: FilterOption<SearchSort>[] = [
  { id: "distance", label: "Distance" },
  { id: "price_asc", label: "Price (low to high)" },
  { id: "price_desc", label: "Price (high to low)" },
];

export function sortLabel(sort: SearchSort): string {
  return SORT_OPTIONS.find((o) => o.id === sort)?.label ?? "Distance";
}

// Price encoded as the upper bound to keep `priceMax` semantics on the wire.
// `"any"` is the no-filter sentinel; `"120plus"` is also a no-filter request
// today because the API doesn't accept a min.
export type PriceBucket = "any" | "under80" | "to120" | "120plus";

export const PRICE_OPTIONS: FilterOption<PriceBucket>[] = [
  { id: "any", label: "Any price" },
  { id: "under80", label: "Under $80" },
  { id: "to120", label: "$80–$120" },
  { id: "120plus", label: "$120+" },
];

export function bucketToPriceMax(bucket: PriceBucket): number | null {
  if (bucket === "under80") return 80;
  if (bucket === "to120") return 120;
  // "any" and "120plus" both clear the cap. "$120+" should ideally pair with
  // a price_min filter — backend doesn't support that yet, so it behaves as
  // "any" until the API grows the field.
  return null;
}

export function priceMaxToBucket(priceMax: number | null): PriceBucket {
  if (priceMax === 80) return "under80";
  if (priceMax === 120) return "to120";
  return "any";
}

/**
 * The FREE rule for Explore's "Free" chip.
 *
 * `field.price_per_hour` is `null` in two very different situations across
 * the catalog: an operator hasn't published a rate ("Rates on site" — see
 * ExploreCard), or nobody ever recorded one because the field is an
 * unbookable public-park pitch that's simply free to walk onto. Treating
 * every `null` as free would mislabel every private/community-centre field
 * with an unpublished rate. The honest split:
 *
 *   - an explicit `$0` price is an unambiguous FREE signal, on any venue type.
 *   - a `null` price is FREE only when the venue itself is a `public_park`
 *     (the null there means "nobody charges," not "ask the operator").
 *   - a `null` price on a private facility / community centre is NOT free —
 *     it's unknown pricing.
 *
 * `minPrice` is the lowest price across a venue's matching fields (or the
 * single field's own price when called per-result), mirroring how the map's
 * venue markers already roll multiple fields up into one price.
 */
export function isFreeVenue(
  venueType: VenueType | null | undefined,
  minPrice: number | null
): boolean {
  if (minPrice === 0) return true;
  return minPrice === null && venueType === "public_park";
}
