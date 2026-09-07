import type { NextConfig } from "next";

/** The host the site lived on before the domain; it hands over permanently. */
const LEGACY_HOST = "kinetiqui.vercel.app";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: LEGACY_HOST }],
        destination: "https://www.kinetiqui.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
