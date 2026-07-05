/**
 * Loads the YAML data files (cities, operators, manual venues) into
 * typed records. Everything in `data/*.yaml` is the source of truth
 * for the scraper — the registry is read fresh on every run, so
 * editing the YAML files and re-running the scrape is the entire
 * update cycle.
 *
 * Parse errors throw — better to fail loudly than silently scrape
 * stale data because someone broke the YAML.
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

import type { FieldSize, FieldSurface, VenueType } from "../fieldEnums.js";

const DATA_DIR = path.resolve(import.meta.dirname, "..", "data");

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

export type City = {
  name: string;
  osmRelationId: number;
  wikidata?: string;
  /** City-centre search coordinate for radius-based sources (Playtomic). */
  lat: number;
  lng: number;
};

type CitiesFile = {
  cities: Array<{
    name: string;
    osm_relation_id: number;
    wikidata?: string;
    lat?: number;
    lng?: number;
  }>;
};

export function loadCities(): City[] {
  const raw = fs.readFileSync(path.join(DATA_DIR, "cities.yaml"), "utf8");
  const parsed = parse(raw) as CitiesFile;
  if (!parsed?.cities || !Array.isArray(parsed.cities)) {
    throw new Error("cities.yaml: expected top-level `cities:` list");
  }
  return parsed.cities.map((c) => {
    if (typeof c.lat !== "number" || typeof c.lng !== "number") {
      throw new Error(`cities.yaml: "${c.name}" is missing lat/lng`);
    }
    return {
      name: c.name,
      osmRelationId: c.osm_relation_id,
      wikidata: c.wikidata,
      lat: c.lat,
      lng: c.lng,
    };
  });
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export type IntegrationType =
  | "none"
  | "playtomic"
  | "courtreserve"
  | "amilia";

export type Operator = {
  name: string;
  website?: string;
  bookingUrl?: string;
  integrationType: IntegrationType;
  aliases: string[];
  /** CourtReserve numeric OrgId — see data/operators.yaml header. */
  courtreserveOrgId?: number;
  /** Amilia storefront slug — see data/operators.yaml header. */
  amiliaRewriteUrl?: string;
  /** Playtomic club slug — see data/operators.yaml header. */
  playtomicSlug?: string;
};

type OperatorsFile = {
  operators: Array<{
    name: string;
    website?: string;
    booking_url?: string;
    integration_type?: IntegrationType;
    aliases?: string[];
    courtreserve_org_id?: number;
    amilia_rewrite_url?: string;
    playtomic_slug?: string;
  }>;
};

export function loadOperators(): Operator[] {
  const raw = fs.readFileSync(path.join(DATA_DIR, "operators.yaml"), "utf8");
  const parsed = parse(raw) as OperatorsFile;
  if (!parsed?.operators || !Array.isArray(parsed.operators)) {
    throw new Error("operators.yaml: expected top-level `operators:` list");
  }
  return parsed.operators.map((o) => {
    const integrationType = o.integration_type ?? "none";
    // Half-filled entries (a platform set without its id key) must be
    // visible, not silent — the operator still loads, but a deep link
    // can never be built for it until the id is filled in.
    if (integrationType === "courtreserve" && o.courtreserve_org_id == null) {
      console.warn(
        `[registry] operator "${o.name}" is integration_type: courtreserve but has no courtreserve_org_id`
      );
    }
    if (integrationType === "amilia" && !o.amilia_rewrite_url) {
      console.warn(
        `[registry] operator "${o.name}" is integration_type: amilia but has no amilia_rewrite_url`
      );
    }
    if (integrationType === "playtomic" && !o.playtomic_slug) {
      console.warn(
        `[registry] operator "${o.name}" is integration_type: playtomic but has no playtomic_slug`
      );
    }
    return {
      name: o.name,
      website: o.website || undefined,
      bookingUrl: o.booking_url || undefined,
      integrationType,
      aliases: o.aliases ?? [],
      courtreserveOrgId: o.courtreserve_org_id ?? undefined,
      amiliaRewriteUrl: o.amilia_rewrite_url || undefined,
      playtomicSlug: o.playtomic_slug || undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Manual venues — same shape the OSM scraper produces, so the runner
// can ingest both through the same upsert path.
// ---------------------------------------------------------------------------

export type ManualField = {
  externalId: string;
  name: string;
  surface: FieldSurface;
  size: FieldSize;
  pricePerHour?: number | null;
};

export type ManualVenue = {
  externalId: string;
  name: string;
  operator?: string;
  address: string;
  lat: number;
  lng: number;
  venueType?: VenueType;
  amenities: string[];
  fields: ManualField[];
};

type ManualVenuesFile = {
  venues: Array<{
    external_id: string;
    name: string;
    operator?: string;
    address: string;
    lat: number;
    lng: number;
    venue_type?: VenueType;
    amenities?: string[];
    fields: Array<{
      external_id: string;
      name: string;
      surface: FieldSurface;
      size: FieldSize;
      price_per_hour?: number | null;
    }>;
  }>;
};

export function loadManualVenues(): ManualVenue[] {
  const raw = fs.readFileSync(
    path.join(DATA_DIR, "manual-venues.yaml"),
    "utf8"
  );
  const parsed = parse(raw) as ManualVenuesFile;
  // Allow an empty file — `venues: []` is the normal "no manual entries
  // yet" state, and we don't want that to throw.
  if (!parsed?.venues) return [];
  if (!Array.isArray(parsed.venues)) {
    throw new Error("manual-venues.yaml: `venues:` must be a list");
  }
  return parsed.venues.map((v) => ({
    externalId: v.external_id,
    name: v.name,
    operator: v.operator,
    address: v.address,
    lat: v.lat,
    lng: v.lng,
    venueType: v.venue_type,
    amenities: v.amenities ?? [],
    fields: v.fields.map((f) => ({
      externalId: f.external_id,
      name: f.name,
      surface: f.surface,
      size: f.size,
      pricePerHour: f.price_per_hour ?? null,
    })),
  }));
}
