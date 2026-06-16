/**
 * Manual venues adapter — reads data/manual-venues.yaml and produces
 * ScrapedVenue records via the same pipeline as the OSM adapter.
 * Catches private facilities OSM doesn't have.
 *
 * Run with: bun run scrape -- manual
 */

import type { ScrapeAdapter, ScrapedVenue } from "../types.js";
import { loadManualVenues } from "../lib/registry.js";

export const manualAdapter: ScrapeAdapter = {
  source: "manual",
  label: "Manual venues (data/manual-venues.yaml)",
  async run(): Promise<ScrapedVenue[]> {
    const entries = loadManualVenues();
    console.log(`[manual] ${entries.length} venues from YAML`);
    // ManualVenue is shaped to match ScrapedVenue exactly, modulo the
    // optional `operator` field which the runner picks up separately
    // (it's not part of ScrapedVenue's contract).
    return entries.map((v) => ({
      externalId: v.externalId,
      name: v.name,
      address: v.address,
      lat: v.lat,
      lng: v.lng,
      photos: [],
      amenities: v.amenities,
      venueType: v.venueType,
      fields: v.fields.map((f) => ({
        externalId: f.externalId,
        name: f.name,
        surface: f.surface,
        size: f.size,
        pricePerHour: f.pricePerHour,
        bookingUrl: null, // manual venues inherit operator URL via runner
      })),
    }));
  },
};
