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

// Never throw at import. A missing env here would crash the entire app at
// launch (stuck on the native splash) even though only auth needs Supabase.
// Warn in dev and fall back to placeholders so the app still starts; auth calls
// then fail gracefully and the user can browse as a guest. Real builds get the
// values from eas.json.
if ((!SUPABASE_URL || !SUPABASE_ANON_KEY) && __DEV__) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / ANON_KEY are not set; auth is disabled"
  );
}

export const supabase = createClient(
  SUPABASE_URL ?? "https://unconfigured.supabase.co",
  SUPABASE_ANON_KEY ?? "unconfigured-anon-key",
  {
    auth: {
      // AsyncStorage is the canonical storage adapter for supabase-js on RN.
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Disable URL session detection. RN has no window.location and we don't
      // use magic-link redirects yet.
      detectSessionInUrl: false,
    },
  }
);
