import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/**': ['./projects/**/*'],
  },
};

export default nextConfig;
