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
};

type OperatorsFile = {
  operators: Array<{
    name: string;
    website?: string;
    booking_url?: string;
    integration_type?: IntegrationType;
    aliases?: string[];
  }>;
};

export function loadOperators(): Operator[] {
  const raw = fs.readFileSync(path.join(DATA_DIR, "operators.yaml"), "utf8");
  const parsed = parse(raw) as OperatorsFile;
  if (!parsed?.operators || !Array.isArray(parsed.operators)) {
    throw new Error("operators.yaml: expected top-level `operators:` list");
  }
  return parsed.operators.map((o) => ({
    name: o.name,
    website: o.website || undefined,
    bookingUrl: o.booking_url || undefined,
    integrationType: o.integration_type ?? "none",
    aliases: o.aliases ?? [],
  }));
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
