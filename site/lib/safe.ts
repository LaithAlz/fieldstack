/**
 * Output-encoding helpers for untrusted, scraped values (venue names,
 * addresses, booking URLs originate from world-editable OpenStreetMap and
 * Google Places).
 */

/**
 * Serialize a value for embedding inside a `<script type="application/ld+json">`
 * block. `JSON.stringify` alone is unsafe there: it does not escape `<`, `>`,
 * `&`, or the JS line separators U+2028/U+2029, so a value containing
 * `</script>` breaks out of the block and the rest executes as HTML. Escaping
 * those to `\uXXXX` is transparent inside a JSON string (the parsed value is
 * identical) but inert to the HTML parser.
 */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Return the URL only if it is http(s); otherwise null. Scraped booking and
 * operator URLs are untrusted, and a `javascript:` or `data:` value placed in
 * an `href` executes in our origin when clicked. Callers drop the link on null.
 */
export function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const { protocol } = new URL(u);
    return protocol === "http:" || protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}
