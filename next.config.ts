import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // cheerio pulls in Node-only parsers; keep it out of the bundler.
  serverExternalPackages: ['cheerio', 'pg'],
};

export default nextConfig;
