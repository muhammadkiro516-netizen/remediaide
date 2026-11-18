/**
 * Next.js Configuration — RemediAide
 *
 * Wraps the base Next.js config with @serwist/next for PWA / Workbox support.
 *
 * Service worker source: src/sw.ts
 * Service worker output: public/sw.js
 *
 * Caching strategies (defined in src/sw.ts):
 *  - Static assets: CacheFirst
 *  - Quiz API:       NetworkFirst
 *  - POST /api/responses: NetworkOnly + Background Sync (IndexedDB queue)
 *  - All other APIs: NetworkOnly
 *
 * NOTE: @serwist/next uses a default export, not a named export.
 * Use require("@serwist/next").default to avoid "withSerwist is not a function".
 */

const withSerwist = require("@serwist/next").default;

const withSerwistConfig = withSerwist({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  // Disable SW in development to avoid stale-cache debugging pain
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Treat Prisma and bcrypt as external packages so Next.js does not
  // attempt to bundle them into the Edge runtime or prerender them.
  // NOTE: Next.js 14 uses experimental.serverComponentsExternalPackages,
  // NOT the top-level serverExternalPackages (that is Next.js 15+).
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
};

module.exports = withSerwistConfig(nextConfig);
