import type { Availability, AuthorityData } from '../types';
import { fetchJson } from '../util/http';

/**
 * Open PageRank (DomCop) — a free, Common Crawl-derived 0–10 authority score.
 *
 * It is explicitly a *proxy*, not Ahrefs DR or Moz DA, and every surface that
 * shows this number labels it as such. Free tier covers ~30k domains/month at
 * up to 100 domains per request.
 */

interface OprResponse {
  status_code: number;
  response?: {
    domain: string;
    page_rank_integer?: number;
    page_rank_decimal?: number;
    rank?: string | null;
    status_code: number;
    error?: string;
  }[];
}

export async function fetchAuthority(
  hosts: string[],
  apiKey: string | undefined,
): Promise<Record<string, Availability<AuthorityData>>> {
  const unique = [...new Set(hosts.map((h) => h.replace(/^www\./, '').toLowerCase()))].slice(0, 100);
  const empty = (reason: string): Record<string, Availability<AuthorityData>> =>
    Object.fromEntries(unique.map((h) => [h, { available: false, reason } as Availability<AuthorityData>]));

  if (!apiKey) return empty('Open PageRank key not configured');
  if (unique.length === 0) return {};

  const url = new URL('https://openpagerank.com/api/v1.0/getPageRank');
  for (const host of unique) url.searchParams.append('domains[]', host);

  const res = await fetchJson<OprResponse>(url.toString(), {
    timeoutMs: 12_000,
    init: { headers: { 'API-OPR': apiKey } },
  });
  if (!res.ok || !res.data?.response) {
    return empty(`Open PageRank: ${res.error ?? 'no response'}`);
  }

  const out: Record<string, Availability<AuthorityData>> = {};
  for (const host of unique) out[host] = { available: false, reason: 'Domain not returned' };
  for (const entry of res.data.response) {
    const host = entry.domain.toLowerCase();
    if (entry.status_code !== 200) {
      out[host] = { available: false, reason: entry.error ?? 'Not indexed by Open PageRank' };
      continue;
    }
    out[host] = {
      available: true,
      data: {
        host,
        openPageRank: entry.page_rank_decimal ?? entry.page_rank_integer ?? null,
        rank: entry.rank ? Number(entry.rank) : null,
      },
    };
  }
  return out;
}
