import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // `sharp` has native bindings — bundling them into Next's server chunks breaks
  // Vercel cold starts for every SSR function. Keep it external so only routes
  // that actually import it (the thumbs API) load the native module.
  serverExternalPackages: ['sharp'],
  outputFileTracingIncludes: {
    '/api/**': ['./projects/**/*'],
    '/api/export': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
};

export default nextConfig;
