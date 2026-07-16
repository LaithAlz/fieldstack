/**
 * Guarded external-URL opener for values that originate from the scrape
 * pipeline (a field's `booking_url`, a venue's `website`). Those are untrusted,
 * and `Linking.openURL` will hand a non-http(s) scheme to the OS — another
 * app's deep link, `javascript:`, etc. The pipeline now rejects such URLs at
 * ingestion, but this is the defense-in-depth layer for rows written before
 * that and for any path that reaches openURL directly.
 *
 * A simple scheme regex (not `new URL`) keeps this independent of the
 * react-native-url-polyfill load order.
 */
import * as Linking from "expo-linking";

const HTTP_URL_RE = /^https?:\/\//i;

/** True only for http(s) URLs. */
export function isHttpUrl(u: string | null | undefined): u is string {
  return !!u && HTTP_URL_RE.test(u);
}

/**
 * Open `url` only if it is http(s). Returns true if it was opened, false if the
 * scheme was rejected (caller shows its own message). Throws only if
 * `Linking.openURL` itself throws, matching the existing try/catch call sites.
 */
export async function openHttpUrl(url: string | null | undefined): Promise<boolean> {
  if (!isHttpUrl(url)) return false;
  await Linking.openURL(url);
  return true;
}
