import type { BrandProfile, PageSignals } from './types';
import { contentTokens, topTerms } from './util/text';

/**
 * Deterministic brand identity extraction.
 *
 * This runs before any model call, and its output is what the LLM is allowed to
 * see. Getting the brand name wrong poisons entity lookup, citation queries and
 * the AI prompt set, so the precedence order below prefers machine-readable
 * sources over inference.
 */

function jsonLdOrganisations(pages: PageSignals[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const ORG_TYPES = /^(Organization|Corporation|LocalBusiness|OnlineBusiness|NGO|EducationalOrganization|GovernmentOrganization|SportsOrganization|MedicalOrganization|Store|Restaurant|ProfessionalService|WebSite)$/;

  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    const t = obj['@type'];
    const types = typeof t === 'string' ? [t] : Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : [];
    if (types.some((type) => ORG_TYPES.test(type))) out.push(obj);
    for (const value of Object.values(obj)) walk(value, depth + 1);
  };
  for (const page of pages) walk(page.jsonLd, 0);
  return out;
}

export function findOrganisationSchema(pages: PageSignals[]): Record<string, unknown> | null {
  const orgs = jsonLdOrganisations(pages);
  if (orgs.length === 0) return null;
  // Prefer the richest node — the one that actually disambiguates the entity.
  return orgs.sort((a, b) => Object.keys(b).length - Object.keys(a).length)[0] ?? null;
}

/** Strips the common "Page Title | Brand Name" tail from a title. */
function brandFromTitle(title: string | null): string | null {
  if (!title) return null;
  const parts = title.split(/\s[|\-–—·]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const tail = parts.at(-1);
  if (!tail || tail.length > 40 || tail.split(/\s+/).length > 5) return null;
  return tail;
}

function hostToBrand(host: string): string {
  const core = host.replace(/^www\./, '').split('.')[0] ?? host;
  return core
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Category phrase: the clearest short description of what the company sells.
 * Preference order is schema → OG description → meta description → H1, because
 * that is the order of decreasing authorial intent.
 */
function extractCategory(home: PageSignals | undefined, org: Record<string, unknown> | null): {
  category: string | null;
  descriptor: string | null;
} {
  const schemaDescription = typeof org?.['description'] === 'string' ? (org['description'] as string) : null;
  const ogDescription = home?.openGraph['og:description'] ?? null;
  const descriptor =
    schemaDescription ?? ogDescription ?? home?.metaDescription ?? home?.headings.find((h) => h.level === 1)?.text ?? null;

  if (!descriptor) return { category: null, descriptor: null };

  // The first clause of a descriptor is almost always the category statement.
  const firstClause = descriptor.split(/[.;]|\s[—–-]\s/)[0]?.trim() ?? descriptor;
  const category = firstClause.length > 8 && firstClause.length <= 140 ? firstClause : null;
  return { category, descriptor: descriptor.slice(0, 300) };
}

export function buildBrandProfile(pages: PageSignals[], host: string): BrandProfile {
  const home = pages.find((p) => p.depth === 0) ?? pages[0];
  const org = findOrganisationSchema(pages);

  const schemaName = typeof org?.['name'] === 'string' ? (org['name'] as string).trim() : null;
  const legalName = typeof org?.['legalName'] === 'string' ? (org['legalName'] as string).trim() : null;
  const ogSiteName = home?.openGraph['og:site_name']?.trim() ?? null;
  const titleBrand = brandFromTitle(home?.title ?? null);
  const hostBrand = hostToBrand(host);

  const name = schemaName || ogSiteName || titleBrand || hostBrand;

  const variants = [schemaName, legalName, ogSiteName, titleBrand, hostBrand]
    .filter((v): v is string => Boolean(v && v.length <= 60));
  const normalised = new Set(variants.map((v) => v.toLowerCase().replace(/[^a-z0-9]/g, '')));
  // Legal suffixes are an expected, harmless variation — don't flag them.
  const stripped = new Set(
    [...normalised].map((v) => v.replace(/(inc|llc|ltd|limited|pvt|private|gmbh|corp|corporation|co)$/, '')),
  );

  const { category, descriptor } = extractCategory(home, org);

  return {
    name,
    category,
    descriptor,
    topTerms: topTerms(pages.map((p) => p.excerpt), 18),
    nameVariants: [...new Set(variants)],
    nameConsistent: stripped.size <= 1,
  };
}

/** Naive competitor-name guesses used only to compute mention ordinals. */
export function competitorNamesFromHosts(hosts: string[]): string[] {
  return hosts.map(hostToBrand);
}

/** Keyword set used for question-gap matching against crawled content. */
export function corpusTokens(pages: PageSignals[]): Set<string> {
  const set = new Set<string>();
  for (const page of pages) {
    for (const token of contentTokens(`${page.title ?? ''} ${page.headings.map((h) => h.text).join(' ')} ${page.excerpt}`)) {
      set.add(token);
    }
  }
  return set;
}
