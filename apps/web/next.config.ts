import type { NextConfig } from 'next';

/**
 * The Mini App is client-rendered and calls the Cloudflare Worker API by HTTPS.
 * `output: export` produces apps/web/out for Cloudflare Pages deployment.
 * In `next dev` we keep the Node server so /v1/* can proxy to the Worker.
 */
const apiProxyOrigin = process.env.API_PROXY_ORIGIN ?? 'http://127.0.0.1:8787';
const bridgeOrigin = process.env.BRIDGE_PROXY_ORIGIN ?? 'http://127.0.0.1:8788';
const agentkitOrigin = process.env.AGENTKIT_PROXY_ORIGIN ?? 'http://127.0.0.1:8000';
const isProdBuild = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  ...(isProdBuild ? { output: 'export' as const } : {}),
  ...(!isProdBuild
    ? {
        async rewrites() {
          return [
            { source: '/v1/:path*', destination: `${apiProxyOrigin}/v1/:path*` },
            { source: '/bridge/:path*', destination: `${bridgeOrigin}/bridge/:path*` },
            { source: '/agentkit', destination: `${agentkitOrigin}/` },
            { source: '/agentkit/:path*', destination: `${agentkitOrigin}/:path*` },
            { source: '/healthz', destination: `${apiProxyOrigin}/healthz` },
            { source: '/readyz', destination: `${apiProxyOrigin}/readyz` },
          ];
        },
      }
    : {}),
};

export default nextConfig;
