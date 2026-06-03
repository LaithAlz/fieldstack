import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listVenues, getVenueWithFields } from "../lib/queries/venues.js";
import { listFieldsByVenue } from "../lib/queries/fields.js";
import { ApiError } from "../lib/errors.js";

// `coerce.number` because query strings come in as strings.
const ListVenuesQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radius_km: z.coerce.number().positive().max(500).default(10),
  })
  .refine(
    (q) => (q.lat === undefined) === (q.lng === undefined),
    { message: "lat and lng must be provided together" }
  );

const VenueIdParams = z.object({ id: z.string().uuid() });

const FieldFiltersQuery = z.object({
  surface: z.enum(["turf", "grass", "concrete", "indoor"]).optional(),
  size: z.enum(["5v5", "7v7", "11v11", "futsal", "3v3"]).optional(),
});

export async function venuesRoutes(app: FastifyInstance) {
  // GET /venues — list active venues, optional proximity sort.
  app.get("/venues", async (req, reply) => {
    const q = ListVenuesQuery.parse(req.query);

    const result = await listVenues({
      lat: q.lat,
      lng: q.lng,
      // Only pass radiusKm when both coords are present; the query layer treats
      // (undefined, undefined, n) as "no proximity sort".
      radiusKm: q.lat !== undefined && q.lng !== undefined ? q.radius_km : undefined,
    });

    reply.header("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    return { data: result.venues, dropped: result.dropped, error: null };
  });

  // GET /venues/:id — single venue with active fields nested.
  app.get("/venues/:id", async (req, reply) => {
    const { id } = VenueIdParams.parse(req.params);

    const venue = await getVenueWithFields(id);
    if (!venue) throw new ApiError(404, "venue not found", "VENUE_NOT_FOUND");

    reply.header("Cache-Control", "public, max-age=60");
    return { data: venue, error: null };
  });

  // GET /venues/:id/fields — fields for a venue with optional filters.
  app.get("/venues/:id/fields", async (req, reply) => {
    const { id } = VenueIdParams.parse(req.params);
    const filters = FieldFiltersQuery.parse(req.query);

    const data = await listFieldsByVenue(id, filters);
    reply.header("Cache-Control", "public, max-age=60");
    return { data, error: null };
  });
}
