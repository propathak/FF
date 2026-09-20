import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // cheerio pulls in Node-only parsers; keep it out of the bundler.
  serverExternalPackages: ['cheerio', 'pg'],
  // The admin setup route reads the .sql files at runtime. Next traces
  // imports, not fs reads, so they have to be included explicitly or the
  // route works locally and 500s on Vercel.
  outputFileTracingIncludes: {
    '/api/admin/migrate': ['./supabase/migrations/**/*.sql'],
  },
};

export default nextConfig;
