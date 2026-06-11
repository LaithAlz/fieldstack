import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { ApiError } from "./lib/errors.js";
import { redis } from "./lib/redis.js";
import { verifyJWT } from "./lib/verifyJWT.js";
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

// Global rate limit: 60 req/min per IP. The search endpoint has a tighter
// per-route limit set in searchRoutes (20 req/min) because it hits PostGIS.
await app.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: "1 minute",
  errorResponseBuilder: (_req, context) => ({
    data: null,
    error: {
      message: `Too many requests — slow down (limit: ${context.max} per ${context.after}).`,
      code: "RATE_LIMITED",
    },
  }),
});

// Global JWT preHandler. Permissive: attaches `req.user` when the
// Authorization bearer token validates, leaves it null otherwise. Public
// reads (venues / fields / search) keep working for guests; future
// user-scoped endpoints opt in by checking `req.user` themselves.
//
// No server-side auth routes exist today (the client talks to Supabase
// directly for sign-in / sign-up / sign-out), so the "skip auth routes"
// exemption is moot. If we ever add /auth/* on this server, exempt them
// explicitly via app.register with a scoped preHandler instead.
app.addHook("preHandler", verifyJWT);

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
