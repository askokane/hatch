import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint is run separately; do not fail production builds on lint.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
