import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this dir so Next doesn't pick up a stray
  // package-lock.json elsewhere on the machine (e.g. in $HOME) as the root.
  turbopack: { root: __dirname },
};
export default nextConfig;
