/** @type {import('next').NextConfig} */
const nextConfig = {
  // Marketing site isn't lint-gated on build (TypeScript checking still runs).
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
