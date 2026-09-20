import * as cheerio from 'cheerio';
import type { SitemapInfo } from '../types';
import type { Fetcher } from '../util/http';
import { canonicaliseUrl } from '../util/url';

interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

function parseSitemapXml(xml: string): { entries: SitemapEntry[]; indexes: string[] } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const indexes: string[] = [];
  $('sitemapindex > sitemap > loc').each((_, el) => {
    const loc = $(el).text().trim();
    if (loc) indexes.push(loc);
  });
  const entries: SitemapEntry[] = [];
  $('urlset > url').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    if (!loc) return;
    const lastmod = $(el).find('lastmod').first().text().trim() || null;
    entries.push({ loc, lastmod });
  });
  return { entries, indexes };
}

/**
 * Resolves the sitemap graph one level deep (index → children). Deeper nesting
 * is rare and the marginal signal doesn't justify the extra requests.
 */
export async function discoverSitemaps(
  origin: string,
  declaredSitemaps: string[],
  fetcher: Fetcher,
): Promise<SitemapInfo> {
  const candidates = [
    ...declaredSitemaps,
    new URL('/sitemap.xml', origin).toString(),
    new URL('/sitemap_index.xml', origin).toString(),
  ];
  const seen = new Set<string>();
  const sources: string[] = [];
  const errors: string[] = [];
  const allEntries: SitemapEntry[] = [];
  let isIndex = false;

  for (const candidate of candidates) {
    if (seen.has(candidate) || sources.length >= 3) continue;
    seen.add(candidate);
    const res = await fetcher(candidate, { accept: 'application/xml,text/xml,*/*', timeoutMs: 10_000 });
    if (!res.ok || !res.body.includes('<')) continue;
    sources.push(candidate);
    try {
      const { entries, indexes } = parseSitemapXml(res.body);
      allEntries.push(...entries);
      if (indexes.length > 0) {
        isIndex = true;
        // Sample up to 3 child sitemaps to estimate total size without
        // downloading a 50,000-URL corpus we would never crawl anyway.
        for (const child of indexes.slice(0, 3)) {
          if (seen.has(child)) continue;
          seen.add(child);
          const childRes = await fetcher(child, { accept: 'application/xml,*/*', timeoutMs: 10_000 });
          if (!childRes.ok) continue;
          sources.push(child);
          allEntries.push(...parseSitemapXml(childRes.body).entries);
        }
      }
    } catch (err) {
      errors.push(`${candidate}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (sources.length === 0) {
    return {
      found: false, sources: [], urlCount: 0, sampledUrls: [], hasLastmod: false,
      freshestLastmod: null, isIndex: false, errors,
    };
  }

  const withLastmod = allEntries.filter((e) => e.lastmod);
  const freshest = withLastmod
    .map((e) => e.lastmod as string)
    .sort()
    .at(-1) ?? null;

  const normalised = allEntries
    .map((e) => canonicaliseUrl(e.loc))
    .filter((u): u is string => Boolean(u));

  return {
    found: true,
    sources,
    urlCount: allEntries.length,
    sampledUrls: [...new Set(normalised)].slice(0, 200),
    hasLastmod: withLastmod.length > 0,
    freshestLastmod: freshest,
    isIndex,
    errors,
  };
}
