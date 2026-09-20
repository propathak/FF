import type { Availability, CitationHit, SerpData } from '../types';
import { CITATION_TIERS } from '../config';
import { fetchJson } from '../util/http';
import { hostOf, registrableDomain } from '../util/url';

/**
 * SERP enrichment (audit Mode B). Paid, so it is feature-flagged and — per the
 * cost model in docs/04 — only fired after email capture.
 *
 * Serper is the V1 default on unit price; DataForSEO is the Phase 3 target for
 * scheduled monitoring volume. Both expose Google AI Overview blocks.
 */

export interface SerpProvider {
  name: string;
  search(query: string, market: string): Promise<SerpSearchResult>;
}

export interface SerpSearchResult {
  ok: boolean;
  organic: { title: string; link: string; snippet?: string; position: number }[];
  aiOverview: { present: boolean; text: string; citedDomains: string[] } | null;
  error?: string;
}

interface SerperResponse {
  organic?: { title: string; link: string; snippet?: string; position?: number }[];
  aiOverview?: { text?: string; snippet?: string; references?: { link?: string; url?: string }[] };
  answerBox?: { snippet?: string; link?: string };
}

const MARKET_TO_GL: Record<string, { gl: string; hl: string }> = {
  global: { gl: 'us', hl: 'en' },
  us: { gl: 'us', hl: 'en' },
  in: { gl: 'in', hl: 'en' },
  uk: { gl: 'gb', hl: 'en' },
  ae: { gl: 'ae', hl: 'en' },
  au: { gl: 'au', hl: 'en' },
  ca: { gl: 'ca', hl: 'en' },
  sg: { gl: 'sg', hl: 'en' },
};

export function createSerperProvider(apiKey: string): SerpProvider {
  return {
    name: 'serper',
    async search(query, market) {
      const geo = MARKET_TO_GL[market] ?? MARKET_TO_GL['global'] as { gl: string; hl: string };
      const res = await fetchJson<SerperResponse>('https://google.serper.dev/search', {
        timeoutMs: 20_000,
        init: {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey, 'content-type': 'application/json' },
          // num<=10 keeps this at one credit per query; 11–100 results costs two.
          body: JSON.stringify({ q: query, gl: geo.gl, hl: geo.hl, num: 10 }),
        },
      });
      if (!res.ok || !res.data) {
        return { ok: false, organic: [], aiOverview: null, error: res.error ?? 'no response' };
      }
      const organic = (res.data.organic ?? []).map((o, i) => ({
        title: o.title,
        link: o.link,
        snippet: o.snippet,
        position: o.position ?? i + 1,
      }));
      const aio = res.data.aiOverview;
      return {
        ok: true,
        organic,
        aiOverview: aio
          ? {
              present: true,
              text: (aio.text ?? aio.snippet ?? '').slice(0, 4000),
              citedDomains: [
                ...new Set(
                  (aio.references ?? [])
                    .map((r) => hostOf(r.link ?? r.url ?? ''))
                    .filter(Boolean),
                ),
              ],
            }
          : { present: false, text: '', citedDomains: [] },
      };
    },
  };
}

export interface SerpEnrichmentInput {
  brandName: string;
  host: string;
  market: string;
  /** Category prompts used for AI Overview presence sampling. */
  prompts: string[];
  /** Hard ceiling on billable queries for this audit. */
  queryBudget: number;
}

function tierForHost(host: string): { tier: number; label: string } {
  const registrable = registrableDomain(host);
  for (const tier of CITATION_TIERS) {
    if (tier.hosts.some((h) => registrable === h || registrable.endsWith(`.${h}`))) {
      return { tier: tier.tier, label: tier.label };
    }
  }
  return { tier: 7, label: 'Directories & aggregators' };
}

/**
 * Runs two query families:
 *   1. Brand-name query → third-party citations, weighted by source authority.
 *   2. Category prompts → Google AI Overview presence and its cited domains.
 */
export async function enrichWithSerp(
  provider: SerpProvider,
  input: SerpEnrichmentInput,
): Promise<Availability<SerpData>> {
  const { brandName, host, market, prompts, queryBudget } = input;
  const bareHost = host.replace(/^www\./, '');

  let queriesRun = 0;
  const citations: CitationHit[] = [];
  const organicBrandPositions: { query: string; position: number | null }[] = [];
  let aiOverviewChecked = 0;
  let aiOverviewPresent = 0;
  let aiOverviewCitesBrand = 0;
  const aiOverviewCitedDomains = new Set<string>();
  const errors: string[] = [];

  const brandQueries = [`"${brandName}"`, `"${brandName}" review`, `"${brandName}" alternatives`];
  for (const query of brandQueries) {
    if (queriesRun >= queryBudget) break;
    const result = await provider.search(query, market);
    queriesRun++;
    if (!result.ok) {
      errors.push(result.error ?? 'query failed');
      continue;
    }
    for (const item of result.organic) {
      const itemHost = hostOf(item.link);
      if (!itemHost) continue;
      if (registrableDomain(itemHost) === registrableDomain(bareHost)) continue; // own site isn't a citation
      const { tier, label } = tierForHost(itemHost);
      citations.push({ tier, source: label, url: item.link, title: item.title });
    }
  }

  for (const prompt of prompts) {
    if (queriesRun >= queryBudget) break;
    const result = await provider.search(prompt, market);
    queriesRun++;
    if (!result.ok) {
      errors.push(result.error ?? 'query failed');
      continue;
    }
    const brandPosition = result.organic.find(
      (o) => registrableDomain(hostOf(o.link)) === registrableDomain(bareHost),
    );
    organicBrandPositions.push({ query: prompt, position: brandPosition?.position ?? null });

    if (result.aiOverview) {
      aiOverviewChecked++;
      if (result.aiOverview.present) {
        aiOverviewPresent++;
        for (const domain of result.aiOverview.citedDomains) aiOverviewCitedDomains.add(domain);
        const citesBrand =
          result.aiOverview.citedDomains.some(
            (d) => registrableDomain(d) === registrableDomain(bareHost),
          ) || result.aiOverview.text.toLowerCase().includes(brandName.toLowerCase());
        if (citesBrand) aiOverviewCitesBrand++;
      }
    }
  }

  if (queriesRun === 0) {
    return { available: false, reason: errors[0] ?? 'No SERP queries were executed' };
  }

  // De-duplicate citations by host, keeping the best (lowest) tier per source.
  const byHost = new Map<string, CitationHit>();
  for (const hit of citations) {
    const key = registrableDomain(hostOf(hit.url));
    const existing = byHost.get(key);
    if (!existing || hit.tier < existing.tier) byHost.set(key, hit);
  }

  return {
    available: true,
    data: {
      provider: provider.name,
      queriesRun,
      aiOverviewChecked,
      aiOverviewPresent,
      aiOverviewCitesBrand,
      aiOverviewCitedDomains: [...aiOverviewCitedDomains],
      organicBrandPositions,
      citations: [...byHost.values()].sort((a, b) => a.tier - b.tier),
    },
  };
}
