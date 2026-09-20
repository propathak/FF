import type { PageSignals, RobotsTxt, SitemapInfo } from '../types';
import { CRAWL_DEFAULTS } from '../config';
import type { Fetcher } from '../util/http';
import { canonicaliseUrl, looksLikeHtmlUrl, pathDepth, sameSite } from '../util/url';
import { isAllowed } from './robots';
import { parsePage } from './parse';

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  concurrency?: number;
  pageTimeoutMs?: number;
  onPage?: (page: PageSignals, crawled: number, queued: number) => void;
}

export interface CrawlOutcome {
  pages: PageSignals[];
  discoveredUrlCount: number;
  blockedByRobots: string[];
}

interface QueueItem {
  url: string;
  depth: number;
  /** Sitemap-sourced URLs get priority: they're the pages the site cares about. */
  priority: number;
}

/**
 * Breadth-first crawl with a fixed page budget.
 *
 * Seeding strategy: homepage first, then sitemap URLs ordered to sample breadth
 * (a spread across path prefixes) rather than the first N alphabetically —
 * auditing 25 blog posts from the same category tells you much less than
 * auditing 25 pages spread across the site.
 */
export async function crawlSite(
  startUrl: string,
  robots: RobotsTxt,
  sitemap: SitemapInfo,
  fetcher: Fetcher,
  options: CrawlOptions = {},
): Promise<CrawlOutcome> {
  const maxPages = options.maxPages ?? CRAWL_DEFAULTS.maxPages;
  const maxDepth = options.maxDepth ?? CRAWL_DEFAULTS.maxDepth;
  const concurrency = options.concurrency ?? CRAWL_DEFAULTS.concurrency;
  const timeoutMs = options.pageTimeoutMs ?? CRAWL_DEFAULTS.pageTimeoutMs;

  const start = canonicaliseUrl(startUrl);
  if (!start) return { pages: [], discoveredUrlCount: 0, blockedByRobots: [] };

  const visited = new Set<string>([start]);
  const discovered = new Set<string>([start]);
  const blockedByRobots: string[] = [];
  const pages: PageSignals[] = [];

  const queue: QueueItem[] = [{ url: start, depth: 0, priority: 0 }];

  for (const url of spreadByPathPrefix(sitemap.sampledUrls, maxPages * 2)) {
    if (!visited.has(url) && sameSite(url, start) && looksLikeHtmlUrl(url)) {
      visited.add(url);
      discovered.add(url);
      queue.push({ url, depth: Math.min(pathDepth(url), maxDepth), priority: 1 });
    }
  }

  const fetchOne = async (item: QueueItem): Promise<PageSignals | null> => {
    const path = new URL(item.url).pathname;
    if (!isAllowed(robots, CRAWL_DEFAULTS.userAgent, path).allowed) {
      blockedByRobots.push(item.url);
      return null;
    }
    const res = await fetcher(item.url, { timeoutMs });
    const page = parsePage(item.url, item.depth, res);
    return page;
  };

  while (queue.length > 0 && pages.length < maxPages) {
    // Priority 0 (link-discovered, shallower) before priority 1 (sitemap fill-in).
    queue.sort((a, b) => a.priority - b.priority || a.depth - b.depth);
    const batch = queue.splice(0, Math.min(concurrency, maxPages - pages.length));

    const results = await Promise.all(batch.map(fetchOne));

    for (const page of results) {
      if (!page) continue;
      pages.push(page);
      options.onPage?.(page, pages.length, queue.length);

      if (page.depth >= maxDepth) continue;
      for (const link of page.internalLinks) {
        discovered.add(link);
        if (visited.has(link) || !sameSite(link, start)) continue;
        visited.add(link);
        if (pages.length + queue.length < maxPages * 3) {
          queue.push({ url: link, depth: page.depth + 1, priority: 0 });
        }
      }
    }
  }

  // Everything still queued was discovered but not fetched — this is what makes
  // "sampled 25 of 4,120 URLs" an honest statement rather than a guess.
  for (const item of queue) discovered.add(item.url);

  return {
    pages,
    discoveredUrlCount: Math.max(discovered.size, sitemap.urlCount),
    blockedByRobots,
  };
}

/** Round-robins URLs across their first path segment to maximise coverage. */
function spreadByPathPrefix(urls: string[], limit: number): string[] {
  const buckets = new Map<string, string[]>();
  for (const url of urls) {
    let prefix = '/';
    try {
      prefix = new URL(url).pathname.split('/')[1] ?? '/';
    } catch {
      continue;
    }
    const bucket = buckets.get(prefix);
    if (bucket) bucket.push(url);
    else buckets.set(prefix, [url]);
  }
  const out: string[] = [];
  const lists = [...buckets.values()];
  for (let i = 0; out.length < limit; i++) {
    let added = false;
    for (const list of lists) {
      const url = list[i];
      if (url) {
        out.push(url);
        added = true;
        if (out.length >= limit) break;
      }
    }
    if (!added) break;
  }
  return out;
}
