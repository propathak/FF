import type { Availability, EntityData } from '../types';
import { fetchJson } from '../util/http';
import { CRAWL_DEFAULTS } from '../config';

/**
 * Wikidata / Wikipedia entity resolution — free, and the single highest-weight
 * citation signal in the GEO pillar.
 *
 * Wikimedia require a descriptive, contactable User-Agent; non-compliant agents
 * are bucketed into a restrictive rate-limit tier, so the UA is set explicitly
 * on every call and responses are cached for 30 days upstream.
 */

interface SearchResponse {
  search?: { id: string; label: string; description?: string; concepturi?: string }[];
}

interface EntityResponse {
  entities?: Record<string, {
    labels?: Record<string, { value: string }>;
    descriptions?: Record<string, { value: string }>;
    sitelinks?: Record<string, { title: string; url?: string }>;
    claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
  }>;
}

/** P856 = official website. Used to confirm the entity is actually this brand. */
const OFFICIAL_WEBSITE = 'P856';

function claimStrings(
  claims: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> | undefined,
  prop: string,
): string[] {
  return (claims?.[prop] ?? [])
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((v): v is string => typeof v === 'string');
}

export async function lookupEntity(
  brandName: string,
  host: string,
): Promise<Availability<EntityData>> {
  const headers = { 'user-agent': CRAWL_DEFAULTS.userAgent };

  const searchUrl = new URL('https://www.wikidata.org/w/api.php');
  searchUrl.searchParams.set('action', 'wbsearchentities');
  searchUrl.searchParams.set('search', brandName);
  searchUrl.searchParams.set('language', 'en');
  searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('limit', '5');
  searchUrl.searchParams.set('origin', '*');

  const search = await fetchJson<SearchResponse>(searchUrl.toString(), {
    timeoutMs: 10_000,
    init: { headers },
  });
  if (!search.ok || !search.data) {
    return { available: false, reason: `Wikidata lookup failed: ${search.error ?? 'no response'}` };
  }

  const candidates = search.data.search ?? [];
  if (candidates.length === 0) {
    // A successful "no entity exists" answer IS the measurement — not an error.
    return {
      available: true,
      data: { wikidataQid: null, wikidataLabel: null, wikipediaUrl: null, description: null, sameAs: [] },
    };
  }

  const ids = candidates.slice(0, 5).map((c) => c.id).join('|');
  const entityUrl = new URL('https://www.wikidata.org/w/api.php');
  entityUrl.searchParams.set('action', 'wbgetentities');
  entityUrl.searchParams.set('ids', ids);
  entityUrl.searchParams.set('props', 'labels|descriptions|sitelinks/urls|claims');
  entityUrl.searchParams.set('languages', 'en');
  entityUrl.searchParams.set('format', 'json');
  entityUrl.searchParams.set('origin', '*');

  const entities = await fetchJson<EntityResponse>(entityUrl.toString(), {
    timeoutMs: 12_000,
    init: { headers },
  });
  if (!entities.ok || !entities.data?.entities) {
    return { available: false, reason: 'Wikidata entity fetch failed' };
  }

  const bareHost = host.replace(/^www\./, '');

  // Only accept a match whose official website (P856) is this domain. Name
  // matching alone produces confident, wrong entity attributions — the worst
  // possible failure mode for a report that claims to be evidence-based.
  for (const [qid, entity] of Object.entries(entities.data.entities)) {
    const sites = claimStrings(entity.claims, OFFICIAL_WEBSITE);
    const matches = sites.some((s) => {
      try {
        return new URL(s).hostname.replace(/^www\./, '') === bareHost;
      } catch {
        return false;
      }
    });
    if (!matches) continue;

    const sitelink = entity.sitelinks?.['enwiki'];
    return {
      available: true,
      data: {
        wikidataQid: qid,
        wikidataLabel: entity.labels?.['en']?.value ?? null,
        wikipediaUrl: sitelink?.url
          ?? (sitelink ? `https://en.wikipedia.org/wiki/${encodeURIComponent(sitelink.title.replace(/ /g, '_'))}` : null),
        description: entity.descriptions?.['en']?.value ?? null,
        sameAs: sites,
      },
    };
  }

  return {
    available: true,
    data: { wikidataQid: null, wikidataLabel: null, wikipediaUrl: null, description: null, sameAs: [] },
  };
}
