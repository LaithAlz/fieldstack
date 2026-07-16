/**
 * URL scheme validation for values sourced from external scrapes (OSM
 * `website`, Google `websiteUri`, Playtomic image URLs). These land in
 * `fields.booking_url` and `venues.photos`, which the app and site render into
 * `href`/`openURL`/`<img>`. A compromised or MITM'd source could inject a
 * `javascript:`/`data:` URL, so gate everything to http(s) at ingestion — the
 * single chokepoint that protects every downstream consumer.
 */

/** Return the URL if it is http(s), else null. */
export function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const { protocol } = new URL(u);
    return protocol === "http:" || protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Keep only the http(s) entries of a URL list (e.g. a photos array). */
export function safeHttpUrls(urls: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!urls) return [];
  return urls.map(safeHttpUrl).filter((u): u is string => u !== null);
}
