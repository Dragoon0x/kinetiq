import type { NextConfig } from "next";

/**
 * On Vercel, bake the production domain into the public site URL so registry
 * install commands, machine metadata, and OG images point at the live
 * deployment. A custom domain overrides it with NEXT_PUBLIC_SITE_URL; local
 * dev falls back to the placeholder in lib/site-config.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(siteUrl ? { env: { NEXT_PUBLIC_SITE_URL: siteUrl } } : {}),
};

export default nextConfig;
