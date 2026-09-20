import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // cheerio and pg pull in Node-only parsers; pdfkit resolves its font
  // metrics by path at runtime. Keep all three out of the bundler.
  serverExternalPackages: ['cheerio', 'pg', 'pdfkit'],
  outputFileTracingIncludes: {
    // The admin setup route reads the .sql files at runtime. Next traces
    // imports, not fs reads, so they have to be included explicitly or the
    // route works locally and 500s on Vercel.
    '/api/admin/migrate': ['./supabase/migrations/**/*.sql'],
    // pdfkit requires its standard-font metrics by constructed name
    // ('Helvetica-Bold' -> standard-fonts/HelveticaBold.cjs), which static
    // tracing cannot follow. Left out, the route renders locally and throws
    // MODULE_NOT_FOUND on the first download in production. The .afm files
    // are the pre-0.16 path to the same data, included because the lookup
    // falls back to them.
    '/api/audits/[id]/report.pdf': [
      './node_modules/pdfkit/js/standard-fonts/**',
      './node_modules/pdfkit/js/data/**',
    ],
  },
};

export default nextConfig;
