import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingIncludes: {
    '/api/**': ['./projects/**/*'],
    '/api/export': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
};

export default nextConfig;
