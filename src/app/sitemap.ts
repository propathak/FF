import type { MetadataRoute } from 'next';

import { appUrl } from '@/lib/app-url';

const APP_URL = appUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: APP_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${APP_URL}/methodology`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${APP_URL}/bot`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
