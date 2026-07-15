import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
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
  // Behind a load balancer / reverse proxy every request arrives from the
  // proxy's IP, which would collapse the per-IP rate limit into one shared
  // bucket for all users. TRUST_PROXY=true makes Fastify honour
  // X-Forwarded-For so req.ip is the real client. Leave unset for direct
  // exposure (local dev) — trusting the header without a proxy lets clients
  // spoof their IP to dodge rate limits.
  trustProxy: process.env.TRUST_PROXY === "true",
});

// Security headers before CORS so they apply to preflight responses too.
// CSP disabled: API-only server with no HTML responses.
await app.register(helmet, { contentSecurityPolicy: false });

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim());
await app.register(cors, {
  origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : false,
});

// Global rate limit: 60 req/min per IP. The search endpoint sets its own
// per-route limit in searchRoutes (also 60/min — see the comment there); it
// inherits this keyGenerator.
//
// Key off Fly's `Fly-Client-IP`, not `req.ip`. With trustProxy=true (needed so
// req.ip is real behind Fly), Fastify honours the whole X-Forwarded-For chain,
// and Fly *appends* the client IP rather than replacing it — so a client that
// pre-seeds `X-Forwarded-For: <random>` makes req.ip the spoofed leftmost
// value and gets a fresh bucket per request, defeating the limit. Fly-Client-IP
// is set by the proxy and cannot be forged through it. Fall back to req.ip for
// local/direct runs where the header is absent.
await app.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: "1 minute",
  keyGenerator: (req) => {
    const flyIp = req.headers["fly-client-ip"];
    return (typeof flyIp === "string" && flyIp) || req.ip;
  },
  errorResponseBuilder: (_req, context) => ({
    data: null,
    error: {
      message: `Too many requests — slow down (limit: ${context.max} per ${context.after}).`,
      code: "RATE_LIMITED",
    },
  }),
});

// No global auth hook. Every route on this server serves public catalog data
// (venues / fields / search) and none reads `req.user`, so registering
// `verifyJWT` globally only added a blocking Supabase `auth.getUser()` round
// trip to every request that carries any bearer token — pure cost and a DoS
// amplifier. When a user-scoped route is added, register `verifyJWT` (still in
// src/lib/verifyJWT.ts) as a scoped preHandler on just that route.

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

  // Supabase/PostgREST errors carry `details` and `hint` fields that may
  // contain PostgreSQL constraint names, column references, or FK paths. Log
  // only the safe `code` field so we get a searchable signal without leaking
  // schema info to the log sink.
  if (err && typeof err === "object" && "details" in err) {
    app.log.warn({ pgCode: (err as Record<string, unknown>).code }, "supabase query failed");
    return reply.code(500).send({
      data: null,
      error: { message: "internal server error" },
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
