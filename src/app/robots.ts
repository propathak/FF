import type { MetadataRoute } from 'next';

import { appUrl } from '@/lib/app-url';

const APP_URL = appUrl();

/**
 * Our own robots.txt. Individual reports are unguessable but public, so they
 * stay out of the index; everything else is open, including to AI retrieval
 * crawlers — it would be a poor look for a product that flags blocked
 * retrieval crawlers to block them itself.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/audit/'] },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
