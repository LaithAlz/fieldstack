import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Security headers applied to every route. CSP is defense-in-depth behind the
// JSON-LD output-encoding fix (scraped venue names could otherwise break out of
// a <script> block): frame-ancestors/object-src/base-uri close the highest-
// value gaps without a nonce pipeline. script-src keeps 'unsafe-inline' because
// the theme-init and JSON-LD blocks are inline and statically generated; img/
// connect allow https so googleusercontent photos and Vercel analytics work.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this dir so Next doesn't pick up a stray
  // package-lock.json elsewhere on the machine (e.g. in $HOME) as the root.
  turbopack: { root: __dirname },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};
export default nextConfig;
