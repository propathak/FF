import type { DiscoveryResult } from '../types';
import type { Fetcher } from '../util/http';
import { hostVariants } from '../util/url';
import { evaluateAiCrawlers, fetchRobots } from './robots';
import { discoverSitemaps } from './sitemap';

/**
 * Stage 1. Establishes the canonical entry point and every zero-cost signal
 * available before a single content page is fetched.
 */
export async function runDiscovery(inputUrl: string, fetcher: Fetcher): Promise<DiscoveryResult> {
  const initial = new URL(inputUrl);
  const home = await fetcher(initial.toString(), { timeoutMs: 15_000 });

  const resolvedUrl = home.finalUrl || initial.toString();
  const resolved = new URL(resolvedUrl);
  const origin = resolved.origin;

  // Probe all four host variants concurrently — a HEAD each, cheap and fast.
  const variants = await Promise.all(
    hostVariants(origin).map(async (url) => {
      const res = await fetcher(url, { method: 'HEAD', timeoutMs: 8000 });
      return { url, status: res.status, finalUrl: res.finalUrl };
    }),
  );
  const reachable = variants.filter((v) => v.status > 0 && v.status < 400);
  const canonicalHosts = new Set(
    reachable.map((v) => {
      try {
        return new URL(v.finalUrl).origin;
      } catch {
        return v.finalUrl;
      }
    }),
  );

  const robots = await fetchRobots(origin, fetcher);
  const sitemap = await discoverSitemaps(origin, robots.sitemaps, fetcher);

  const llms = await fetcher(new URL('/llms.txt', origin).toString(), {
    accept: 'text/plain,*/*',
    timeoutMs: 6000,
  });
  const llmsFound = llms.ok && llms.body.trim().length > 0 && !/<html/i.test(llms.body.slice(0, 200));

  const feeds: string[] = [];
  for (const path of ['/feed', '/rss.xml', '/feed.xml', '/atom.xml']) {
    const res = await fetcher(new URL(path, origin).toString(), { method: 'HEAD', timeoutMs: 5000 });
    if (res.status >= 200 && res.status < 300) feeds.push(new URL(path, origin).toString());
  }

  return {
    inputUrl,
    resolvedUrl,
    origin,
    host: resolved.hostname.toLowerCase(),
    https: resolved.protocol === 'https:',
    // A successful TLS handshake is implicit in a 2xx over https; fetch does
    // not expose certificate detail, so we report what we can verify.
    tlsValid: resolved.protocol === 'https:' ? home.status > 0 : null,
    homepageStatus: home.status,
    redirectChain: home.redirectChain,
    hostVariants: variants,
    canonicalHostConsistent: canonicalHosts.size <= 1,
    robots,
    aiCrawlers: evaluateAiCrawlers(robots),
    sitemap,
    llmsTxt: {
      found: llmsFound,
      bytes: llmsFound ? llms.bytes : 0,
      hasSections: llmsFound && /^#{1,3}\s/m.test(llms.body),
    },
    feeds,
  };
}
