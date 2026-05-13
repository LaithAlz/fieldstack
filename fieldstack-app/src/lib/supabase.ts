/**
 * Browser/RN-side Supabase client. Used today only for auth — every other
 * data path goes through our Fastify API, which talks to Supabase on the
 * server side with appropriate RLS context.
 *
 * Session tokens are persisted to AsyncStorage so the user stays signed in
 * across cold starts. `react-native-url-polyfill` patches `URL` so the
 * supabase-js fetch layer doesn't crash on RN < 0.74.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
// Side-effect import — must run before any URL construction in this module.
// Keep this line; an auto-import reorder that bumps it below would crash
// supabase-js's internal fetch on RN < 0.74.
import "react-native-url-polyfill/auto";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Hard fail at import time — without the env vars the auth surface
  // silently no-ops, which is a much harder bug to track down later.
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env"
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // AsyncStorage is the canonical storage adapter for supabase-js on RN.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Disable URL session detection — RN doesn't have window.location and
    // we don't use magic-link redirects yet.
    detectSessionInUrl: false,
  },
});
