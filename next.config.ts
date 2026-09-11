import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone", <-- Removed to fix the Vercel build error
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // Note: proxyClientMaxBodySize isn't a standard Next.js config. 
    // It shouldn't break the build, but you might see a warning about it in the console.
    proxyClientMaxBodySize: "100mb", 
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;