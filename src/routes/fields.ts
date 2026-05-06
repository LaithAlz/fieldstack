import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getFieldWithVenue } from "../lib/queries/fields.js";
import { ApiError } from "../lib/errors.js";

const FieldIdParams = z.object({ id: z.string().uuid() });

export async function fieldsRoutes(app: FastifyInstance) {
  // GET /fields/:id — single field with its parent venue nested.
  app.get("/fields/:id", async (req) => {
    const { id } = FieldIdParams.parse(req.params);

    const field = await getFieldWithVenue(id);
    if (!field) throw new ApiError(404, "field not found", "FIELD_NOT_FOUND");

    return { data: field, error: null };
  });
}
