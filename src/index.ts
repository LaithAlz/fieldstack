import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { ApiError } from "./lib/errors.js";
import { redis } from "./lib/redis.js";
import { venuesRoutes } from "./routes/venues.js";
import { fieldsRoutes } from "./routes/fields.js";
import { searchRoutes } from "./routes/search.js";
import { healthRoute } from "./routes/health.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    transport: process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
  },
});

await app.register(cors, { origin: true });

// Centralized error → response shape. Routes throw ApiError for known cases;
// Zod parse failures bubble up as ZodError; anything else is a 500.
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ApiError) {
    return reply.code(err.statusCode).send({
      data: null,
      error: { message: err.message, ...(err.code ? { code: err.code } : {}) },
    });
  }

  if (err instanceof ZodError) {
    return reply.code(400).send({
      data: null,
      error: {
        message: err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
        code: "VALIDATION_ERROR",
      },
    });
  }

  app.log.error(err);
  return reply.code(500).send({
    data: null,
    error: { message: "internal server error" },
  });
});

await app.register(healthRoute);
await app.register(venuesRoutes);
await app.register(fieldsRoutes);
await app.register(searchRoutes);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    redis.disconnect();
  } catch (err) {
    app.log.error(err, "error during shutdown");
  }
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
