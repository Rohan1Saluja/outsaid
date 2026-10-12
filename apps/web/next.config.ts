import type { NextConfig } from 'next';

// Server-side build configuration only. Never prefix this with NEXT_PUBLIC_.
const origin = new URL(process.env.API_ORIGIN ?? (process.env.NODE_ENV === 'production'
  ? 'https://outsaid-api.vercel.app'
  : 'http://localhost:4000'));
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
    origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('API_ORIGIN must be an HTTP(S) origin without credentials or a path');
}
const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${origin.origin}/v1/:path*` }];
  },
};
export default config;
