import type { NextConfig } from 'next';

/**
 * The Mini App is client-rendered and calls the Cloudflare Worker API by HTTPS.
 * `output: export` produces apps/web/out for Cloudflare Pages deployment.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'export',
};

export default nextConfig;
