import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { searchFields } from "../lib/queries/search.js";

const SearchFieldsQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radius_km: z.coerce.number().positive().max(500).default(10),
    surface: z.enum(["turf", "grass", "concrete", "indoor"]).optional(),
    size: z.enum(["5v5", "7v7", "11v11"]).optional(),
    price_max: z.coerce.number().positive().optional(),
    sort: z.enum(["distance", "price_asc", "price_desc"]).default("distance"),
  })
  .refine(
    (q) => (q.lat === undefined) === (q.lng === undefined),
    { message: "lat and lng must be provided together", path: ["lat"] }
  );

export async function searchRoutes(app: FastifyInstance) {
  // GET /search/fields — composable field search with caching.
  // sort=distance with no coords falls back to name-order in SQL, so the
  // no-param case (`/search/fields`) is a valid "browse all" request.
  app.get("/search/fields", async (req) => {
    const q = SearchFieldsQuery.parse(req.query);

    const hasCoords = q.lat !== undefined && q.lng !== undefined;
    const result = await searchFields({
      lat: q.lat,
      lng: q.lng,
      radiusKm: hasCoords ? q.radius_km : undefined,
      surface: q.surface,
      size: q.size,
      priceMax: q.price_max,
      sort: q.sort,
    });

    return { data: result.data, total: result.total, error: null };
  });
}
