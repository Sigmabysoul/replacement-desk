import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hostinger's Docker image uses the minimal standalone server. Other hosts
  // retain their native Next.js output and deployment adapter behavior.
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
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
