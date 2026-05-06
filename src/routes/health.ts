import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/supabase.js";
import { redis } from "../lib/redis.js";

type Health = "ok" | "error";

async function checkSupabase(): Promise<Health> {
  // HEAD count against `operators` — cheap, exists in every environment, and
  // exercises both PostgREST and the connection pool.
  const { error } = await supabase
    .from("operators")
    .select("id", { count: "exact", head: true });
  return error ? "error" : "ok";
}

async function checkRedis(): Promise<Health> {
  try {
    const pong = await redis.ping();
    return pong === "PONG" ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function healthRoute(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    const [supabaseStatus, redisStatus] = await Promise.all([
      checkSupabase(),
      checkRedis(),
    ]);

    const allOk = supabaseStatus === "ok" && redisStatus === "ok";
    if (!allOk) reply.code(503);

    return {
      data: { supabase: supabaseStatus, redis: redisStatus },
      error: null,
    };
  });
}
