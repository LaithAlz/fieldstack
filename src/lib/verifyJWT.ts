/**
 * Permissive Authorization bearer verification for Fastify routes.
 *
 * Parses the `Authorization: Bearer <token>` header (if present), validates
 * the token via supabase-js's `auth.getUser(token)`, and attaches the
 * resulting user onto `req.user` for downstream handlers.
 *
 * Intentionally non-rejecting on missing / invalid tokens — the public read
 * surface (venues, fields, search) must keep working for unauthenticated
 * guest browsing. Routes that genuinely require auth should check `req.user`
 * themselves and respond 401 explicitly.
 */

import type { User } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";

import { supabase } from "./supabase.js";

// Augment FastifyRequest with the `user` field. Fastify recommends a single
// declaration somewhere in the project tree; doing it here keeps the type +
// the runtime that populates it co-located.
declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

const BEARER_RE = /^Bearer\s+(.+)$/i;

export async function verifyJWT(
  req: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  req.user = null;

  const header = req.headers.authorization;
  if (!header) return;

  const match = BEARER_RE.exec(header);
  const token = match?.[1]?.trim();
  if (!token) return;

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return;
    req.user = data.user;
  } catch (err) {
    // Network failures shouldn't kill the request; the route runs
    // unauthenticated. Debug-level so a Supabase outage doesn't spam paged
    // logs — warn is reserved for unexpected conditions.
    req.log.debug({ err }, "verifyJWT: supabase.auth.getUser threw");
  }
}
