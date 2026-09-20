import type { AuditContext, CheckResult, PageSignals } from '../types';
import { gradeStatus, makeCheck, notApplicable, unavailable, type CheckSpec } from './helpers';
import { CITATION_TIERS } from '../config';
import { findOrganisationSchema } from '../brand';
import { clamp01, ramp, ratio } from '../util/text';

const spec = (id: string, group: string, title: string, weight: number): CheckSpec => ({
  id, pillar: 'geo', group, title, weight,
});

function okPages(pages: PageSignals[]): PageSignals[] {
  return pages.filter((p) => p.statusCode >= 200 && p.statusCode < 300);
}

// ---------------------------------------------------------------------------
// geo.entity — can a machine work out who this company is?
// ---------------------------------------------------------------------------

/** Properties that actually disambiguate an organisation, weighted by value. */
const ORG_PROPERTIES: { key: string; weight: number; label: string }[] = [
  { key: 'name', weight: 2, label: 'name' },
  { key: 'url', weight: 1, label: 'url' },
  { key: 'logo', weight: 1, label: 'logo' },
  { key: 'description', weight: 2, label: 'description' },
  { key: 'sameAs', weight: 3, label: 'sameAs links' },
  { key: 'address', weight: 2, label: 'address' },
  { key: 'contactPoint', weight: 1, label: 'contact point' },
  { key: 'legalName', weight: 1, label: 'legal name' },
  { key: 'foundingDate', weight: 1, label: 'founding date' },
  { key: 'founder', weight: 1, label: 'founder' },
  { key: 'numberOfEmployees', weight: 1, label: 'employee count' },
];

function entityChecks(ctx: AuditContext): CheckResult[] {
  const good = okPages(ctx.pages);
  const org = findOrganisationSchema(good);
  const out: CheckResult[] = [];

  const orgSpec = spec('geo.entity.organization_schema', 'geo.entity', 'Organization structured data', 16);
  if (!org) {
    out.push(makeCheck(orgSpec, {
      status: 'fail',
      score: 0,
      summary: 'No Organization structured data found anywhere on the site. AI systems have no machine-readable statement of who you are, what you do, or where you operate.',
    }));
  } else {
    const totalWeight = ORG_PROPERTIES.reduce((n, p) => n + p.weight, 0);
    const present = ORG_PROPERTIES.filter((p) => {
      const v = org[p.key];
      return v !== undefined && v !== null && (!Array.isArray(v) || v.length > 0) && v !== '';
    });
    const score = present.reduce((n, p) => n + p.weight, 0) / totalWeight;
    out.push(makeCheck(orgSpec, {
      status: gradeStatus(score, { failBelow: 0.3, warnBelow: 0.75 }),
      score,
      summary: `Organization markup declares ${present.length} of ${ORG_PROPERTIES.length} identity properties.`,
      evidence: [
        { kind: 'list', label: 'Present', values: present.map((p) => p.label) },
        { kind: 'list', label: 'Missing', values: ORG_PROPERTIES.filter((p) => !present.includes(p)).map((p) => p.label) },
      ],
    }));
  }

  // sameAs is the machine-readable identity graph — the link between your site
  // and every other profile that corroborates you.
  const sameAs = Array.isArray(org?.['sameAs'])
    ? (org['sameAs'] as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const sameAsScore = ramp(sameAs.length, 0, 5);
  out.push(makeCheck(spec('geo.entity.sameas', 'geo.entity', 'sameAs identity links', 12), {
    status: sameAs.length === 0 ? 'fail' : gradeStatus(sameAsScore, { failBelow: 0.2, warnBelow: 0.8 }),
    score: sameAsScore,
    summary: sameAs.length === 0
      ? 'No sameAs links declared. There is nothing connecting your website to your LinkedIn, Wikidata, Crunchbase or social profiles in a way a machine can follow.'
      : `${sameAs.length} sameAs links connect your site to external profiles.`,
    evidence: [{ kind: 'list', label: 'sameAs targets', values: sameAs.slice(0, 10) }],
  }));

  out.push(makeCheck(spec('geo.entity.name_consistency', 'geo.entity', 'Consistent brand name', 10), {
    status: ctx.brand.nameConsistent ? 'pass' : 'warn',
    score: ctx.brand.nameConsistent ? 1 : 0.4,
    summary: ctx.brand.nameConsistent
      ? `Your brand name is written consistently as "${ctx.brand.name}" across titles, structured data and social tags.`
      : `Your brand name appears in ${ctx.brand.nameVariants.length} different forms across the site, which makes it harder for AI systems to resolve you as one entity.`,
    evidence: [{ kind: 'list', label: 'Name variants found', values: ctx.brand.nameVariants }],
  }));

  const home = good.find((p) => p.depth === 0) ?? good[0];
  const categoryStated = Boolean(ctx.brand.category && ctx.brand.category.length > 12);
  const inH1 = Boolean(home?.headings.some((h) => h.level === 1 && h.text.length > 10));
  const inMeta = Boolean(home?.metaDescription && home.metaDescription.length > 40);
  const clarityScore = (categoryStated ? 0.4 : 0) + (inH1 ? 0.3 : 0) + (inMeta ? 0.3 : 0);
  out.push(makeCheck(spec('geo.entity.category_clarity', 'geo.entity', 'What you do is stated plainly', 12), {
    status: gradeStatus(clarityScore, { failBelow: 0.4, warnBelow: 0.9 }),
    score: clarityScore,
    summary: categoryStated
      ? `Your category is stated as: "${ctx.brand.category}".`
      : 'Your homepage does not state plainly what the company does in a single readable sentence, so AI systems have to infer your category.',
  }));

  const peoplePages = good.filter((p) => p.jsonLdTypes.includes('Person'));
  out.push(makeCheck(spec('geo.entity.people', 'geo.entity', 'Key people as entities', 6), {
    status: peoplePages.length > 0 ? 'pass' : 'opportunity',
    score: peoplePages.length > 0 ? 1 : 0,
    summary: peoplePages.length > 0
      ? `${peoplePages.length} pages describe a person in structured data.`
      : 'No founders or executives are described in structured data. Named, verifiable people are a strong corroboration signal for AI systems.',
  }));

  const hasAddress = Boolean(org?.['address']) || good.some((p) => p.jsonLdTypes.includes('PostalAddress'));
  const hasArea = Boolean(org?.['areaServed']);
  const geoScore = (hasAddress ? 0.7 : 0) + (hasArea ? 0.3 : 0);
  out.push(makeCheck(spec('geo.entity.location', 'geo.entity', 'Where you operate', 8), {
    status: gradeStatus(geoScore, { failBelow: 0.3, warnBelow: 0.9, opportunity: true }),
    score: geoScore,
    summary: hasAddress
      ? 'Your location is declared in structured data.'
      : 'No machine-readable address or service area. AI answers to "near me" and market-specific questions cannot place you.',
  }));

  const productPages = good.filter((p) => p.jsonLdTypes.some((t) => /^(Product|Service|Offer|SoftwareApplication)$/.test(t)));
  const commercial = good.filter((p) => /\/(product|service|solution|pricing|plans|shop)/i.test(p.url));
  const prodSpec = spec('geo.entity.products', 'geo.entity', 'Products and services as entities', 10);
  out.push(
    commercial.length === 0
      ? notApplicable(prodSpec, 'No product or service pages were crawled.')
      : makeCheck(prodSpec, {
          status: gradeStatus(ratio(productPages.length, commercial.length), { failBelow: 0.2, warnBelow: 0.7 }),
          score: ratio(productPages.length, commercial.length),
          summary: `${productPages.length} of ${commercial.length} product or service pages declare what they sell in structured data.`,
          affectedUrls: commercial.filter((p) => !productPages.includes(p)).map((p) => p.url),
        }),
  );

  return out;
}

// ---------------------------------------------------------------------------
// geo.citation — independent corroboration, authority-weighted
// ---------------------------------------------------------------------------

function citationChecks(ctx: AuditContext): CheckResult[] {
  const out: CheckResult[] = [];

  const entitySpec = spec('geo.citation.wikidata', 'geo.citation', 'Recognised as an entity by Wikidata', 14);
  if (!ctx.entity.available) {
    out.push(unavailable(entitySpec, ctx.entity.reason));
  } else {
    const qid = ctx.entity.data.wikidataQid;
    out.push(makeCheck(entitySpec, {
      status: qid ? 'pass' : 'opportunity',
      score: qid ? 1 : 0,
      summary: qid
        ? `Your brand is a recognised Wikidata entity (${qid})${ctx.entity.data.wikipediaUrl ? ' with a Wikipedia article' : ''}. This is the single strongest corroboration signal available to AI systems.`
        : 'No Wikidata entity matches this domain. AI systems have no canonical, third-party record confirming your organisation exists and what it does.',
      evidence: qid
        ? [{ kind: 'url', url: `https://www.wikidata.org/wiki/${qid}` }]
        : [],
    }));
  }

  const authoritySpec = spec('geo.citation.domain_authority', 'geo.citation', 'Domain authority (proxy)', 8);
  if (!ctx.authority.available) {
    out.push(unavailable(authoritySpec, ctx.authority.reason));
  } else {
    const opr = ctx.authority.data.openPageRank ?? 0;
    out.push(makeCheck(authoritySpec, {
      status: gradeStatus(opr / 10, { failBelow: 0.2, warnBelow: 0.5 }),
      score: clamp01(opr / 10),
      // Open PageRank is a Common Crawl-derived proxy, not a link-graph metric.
      confidence: 0.7,
      summary: `Open PageRank authority proxy: ${opr.toFixed(2)}/10. This is a free, Common Crawl-derived estimate, not a backlink-graph score.`,
      evidence: [{ kind: 'metric', label: 'Open PageRank', value: Number(opr.toFixed(2)), source: 'openpagerank' }],
    }));
  }

  const thirdPartySpec = spec('geo.citation.third_party', 'geo.citation', 'Independent third-party coverage', 16);
  if (!ctx.serp.available) {
    out.push(unavailable(thirdPartySpec, ctx.serp.reason));
  } else {
    const hits = ctx.serp.data.citations;
    // Authority weighting, with Tier 7 capped so directory spam cannot inflate it.
    let weighted = 0;
    let tier7 = 0;
    for (const hit of hits) {
      const tierDef = CITATION_TIERS.find((t) => t.tier === hit.tier);
      if (!tierDef) continue;
      if (tierDef.cap !== undefined) {
        tier7 += tierDef.weight;
        continue;
      }
      weighted += tierDef.weight;
    }
    const tier7Contribution = Math.min(tier7, (CITATION_TIERS.at(-1)?.cap ?? 0.05) * 10);
    // 6 weighted points ≈ a brand with press, review-site and community presence.
    const score = clamp01((weighted + tier7Contribution) / 6);
    const byTier = new Map<number, number>();
    for (const hit of hits) byTier.set(hit.tier, (byTier.get(hit.tier) ?? 0) + 1);

    out.push(makeCheck(thirdPartySpec, {
      status: gradeStatus(score, { failBelow: 0.25, warnBelow: 0.7 }),
      score,
      summary: hits.length === 0
        ? 'No independent third-party sources mentioning your brand were found. AI systems have nothing outside your own website to verify your claims against.'
        : `${hits.length} independent sources mention your brand, weighted by authority: ${[...byTier.entries()].sort().map(([t, n]) => `${n} tier-${t}`).join(', ')}.`,
      evidence: hits.slice(0, 10).map((h) => ({
        kind: 'url' as const, url: h.url, note: `Tier ${h.tier} — ${h.source}`,
      })),
    }));
  }

  return out;
}

// ---------------------------------------------------------------------------
// geo.content — is the content worth quoting?
// ---------------------------------------------------------------------------

function contentChecks(ctx: AuditContext): CheckResult[] {
  const good = okPages(ctx.pages);
  const total = Math.max(good.length, 1);
  const out: CheckResult[] = [];
  const confidence = good.some((p) => p.csrDependent) ? 0.5 : 1;

  const stats = good.reduce((n, p) => n + p.statisticClaims, 0);
  const statScore = ramp(stats / total, 0, 3);
  out.push(makeCheck(spec('geo.content.statistics', 'geo.content', 'Original statistics and data', 14), {
    status: gradeStatus(statScore, { failBelow: 0.2, warnBelow: 0.65, opportunity: true }),
    score: statScore,
    confidence,
    summary: stats === 0
      ? 'No concrete statistics or data points were found in your content. Specific numbers are the most-cited content type in AI answers.'
      : `${stats} sentences contain a concrete statistic or data point (${(stats / total).toFixed(1)} per page).`,
  }));

  const quotable = good.reduce((n, p) => n + p.quotablePassages, 0);
  const quotableScore = ramp(quotable / total, 0.5, 8);
  out.push(makeCheck(spec('geo.content.quotable', 'geo.content', 'Quotable passages', 12), {
    status: gradeStatus(quotableScore, { failBelow: 0.2, warnBelow: 0.65 }),
    score: quotableScore,
    confidence,
    summary: `${quotable} self-contained, quotable sentences across the crawled pages (${(quotable / total).toFixed(1)} per page). These are the passages an AI answer can lift and attribute.`,
  }));

  const comparison = good.filter((p) =>
    /\b(vs|versus|compare|comparison|alternative)\b/i.test(`${p.url} ${p.title ?? ''}`),
  );
  out.push(makeCheck(spec('geo.content.comparisons', 'geo.content', 'Comparison and alternatives content', 12), {
    status: comparison.length >= 2 ? 'pass' : comparison.length === 1 ? 'warn' : 'opportunity',
    score: clamp01(comparison.length / 3),
    summary: comparison.length === 0
      ? 'You publish no comparison or "alternatives" content. These pages are disproportionately cited when AI systems answer "which should I choose" questions — the moment a buyer decides.'
      : `${comparison.length} comparison or alternatives pages found.`,
    affectedUrls: comparison.map((p) => p.url),
  }));

  const research = good.filter((p) =>
    /\b(research|report|study|survey|benchmark|state of|index|whitepaper|data)\b/i.test(`${p.url} ${p.title ?? ''}`),
  );
  out.push(makeCheck(spec('geo.content.original_research', 'geo.content', 'Original research', 10), {
    status: research.length > 0 ? 'pass' : 'opportunity',
    score: clamp01(research.length / 2),
    summary: research.length === 0
      ? 'No original research, survey or benchmark content found. Original data is the most durable way to earn citations you do not have to ask for.'
      : `${research.length} pages publish research, survey or benchmark content.`,
    affectedUrls: research.map((p) => p.url),
  }));

  const expertSignals = good.reduce((n, p) => n + p.blockquotes, 0);
  out.push(makeCheck(spec('geo.content.expert_commentary', 'geo.content', 'Attributed expert commentary', 8), {
    status: expertSignals > 3 ? 'pass' : expertSignals > 0 ? 'warn' : 'opportunity',
    score: ramp(expertSignals / total, 0, 1.5),
    confidence,
    summary: expertSignals === 0
      ? 'No quoted or attributed expert commentary found. Named expert opinion is what distinguishes a citable source from generic content.'
      : `${expertSignals} quoted or attributed passages found.`,
  }));

  const definitions = good.reduce((n, p) => n + p.definitionBlocks, 0);
  out.push(makeCheck(spec('geo.content.definitions', 'geo.content', 'Definitional content', 8), {
    status: gradeStatus(ramp(definitions / total, 0, 2), { failBelow: 0.2, warnBelow: 0.6, opportunity: true }),
    score: ramp(definitions / total, 0, 2),
    confidence,
    summary: `${definitions} definitional statements found. Definitions are the passages AI systems reach for when explaining a category to a newcomer.`,
  }));

  return out;
}

// ---------------------------------------------------------------------------
// geo.machine — delivery mechanism
// ---------------------------------------------------------------------------

function machineChecks(ctx: AuditContext): CheckResult[] {
  const good = okPages(ctx.pages);
  const total = Math.max(good.length, 1);
  const out: CheckResult[] = [];

  /**
   * AI crawler access, split by purpose. Blocking a retrieval/search agent
   * removes you from AI answers; blocking a training agent is a legitimate
   * business decision and is never scored as a defect.
   */
  const retrieval = ctx.discovery.aiCrawlers.filter((c) => c.purpose === 'search' || c.purpose === 'user_fetch');
  const blocked = retrieval.filter((c) => !c.allowed);
  out.push(makeCheck(spec('geo.machine.ai_crawler_access', 'geo.machine', 'AI answer engines can fetch your site', 18), {
    status: blocked.length === 0 ? 'pass' : blocked.length >= retrieval.length / 2 ? 'fail' : 'warn',
    score: 1 - ratio(blocked.length, Math.max(retrieval.length, 1)),
    summary: blocked.length === 0
      ? `All ${retrieval.length} AI retrieval crawlers (ChatGPT search, Claude search, Perplexity and their user-initiated fetchers) are allowed to read your site.`
      : `${blocked.length} of ${retrieval.length} AI retrieval crawlers are blocked by robots.txt: ${blocked.map((c) => c.agent).join(', ')}. These are the agents that fetch pages to cite in AI answers — blocking them removes you from those answers.`,
    evidence: ctx.discovery.aiCrawlers.map((c) => ({
      kind: 'text' as const,
      label: `${c.agent} (${c.operator}, ${c.purpose.replace('_', ' ')})`,
      value: c.allowed ? 'allowed' : `blocked by "${c.matchedBy}" rule`,
    })),
  }));

  const training = ctx.discovery.aiCrawlers.filter((c) => c.purpose === 'training' || c.purpose === 'corpus');
  const blockedTraining = training.filter((c) => !c.allowed);
  out.push(makeCheck(spec('geo.machine.training_crawler_policy', 'geo.machine', 'Training crawler policy', 4), {
    // Informational: a deliberate opt-out is not a defect, so this never fails.
    status: 'not_applicable',
    score: 0,
    confidence: 0,
    summary: blockedTraining.length === 0
      ? 'All model-training crawlers are allowed. This is a business decision, not a ranking factor — it does not affect whether you appear in AI answers.'
      : `${blockedTraining.length} model-training crawlers are blocked (${blockedTraining.map((c) => c.agent).join(', ')}). This is a legitimate choice and does not affect AI answer visibility. Note that Google-Extended does not affect Google Search ranking or inclusion.`,
  }));

  const schemaPages = good.filter((p) => p.jsonLdTypes.length > 0);
  const schemaCoverage = ratio(schemaPages.length, total);
  out.push(makeCheck(spec('geo.machine.schema_coverage', 'geo.machine', 'Machine-readable page coverage', 14), {
    status: gradeStatus(schemaCoverage, { failBelow: 0.25, warnBelow: 0.75 }),
    score: schemaCoverage,
    summary: `${schemaPages.length} of ${good.length} crawled pages expose structured data that a machine can read without interpreting prose.`,
  }));

  // Disconnected JSON-LD islands are extremely common and genuinely fixable.
  const linkedPages = good.filter((p) => p.jsonLdHasIds);
  const graphScore = ratio(linkedPages.length, Math.max(schemaPages.length, 1));
  out.push(makeCheck(spec('geo.machine.entity_graph', 'geo.machine', 'Connected entity graph', 10), {
    status: schemaPages.length === 0 ? 'fail' : gradeStatus(graphScore, { failBelow: 0.2, warnBelow: 0.6, opportunity: true }),
    score: schemaPages.length === 0 ? 0 : graphScore,
    summary: schemaPages.length === 0
      ? 'There is no structured data to connect.'
      : `${linkedPages.length} of ${schemaPages.length} pages with structured data use @id references to link their entities together. Without them each page is an isolated island rather than part of one connected description of your organisation.`,
  }));

  const sitemapQuality = ctx.discovery.sitemap.found
    ? 0.5 + (ctx.discovery.sitemap.hasLastmod ? 0.3 : 0) + (ctx.discovery.sitemap.urlCount > 0 ? 0.2 : 0)
    : 0;
  out.push(makeCheck(spec('geo.machine.sitemap_quality', 'geo.machine', 'Sitemap quality', 8), {
    status: gradeStatus(sitemapQuality, { failBelow: 0.3, warnBelow: 0.9 }),
    score: sitemapQuality,
    summary: ctx.discovery.sitemap.found
      ? `Sitemap lists ${ctx.discovery.sitemap.urlCount} URLs${ctx.discovery.sitemap.hasLastmod ? ' with lastmod dates' : ' without lastmod dates'}.`
      : 'No sitemap for AI crawlers to use as an index of your content.',
  }));

  /**
   * llms.txt is scored as an OPPORTUNITY only.
   * Evidence through 2026 is that major AI crawlers overwhelmingly do not fetch
   * it and no major provider has committed to reading it. Penalising a site for
   * its absence would mean inventing a ranking factor. See docs/06.
   */
  out.push(makeCheck(spec('geo.machine.llms_txt', 'geo.machine', 'llms.txt (emerging, unproven)', 3), {
    status: ctx.discovery.llmsTxt.found ? 'pass' : 'opportunity',
    score: ctx.discovery.llmsTxt.found ? 1 : 0,
    confidence: 0.4,
    summary: ctx.discovery.llmsTxt.found
      ? 'An llms.txt file is published. Adoption by AI crawlers is still limited, so treat this as cheap upside rather than a ranking factor.'
      : 'No llms.txt file. This is a low-cost, low-evidence addition — major AI crawlers are not yet confirmed to read it, so we flag it as optional upside, not a defect.',
  }));

  const feedScore = ctx.discovery.feeds.length > 0 ? 1 : 0;
  out.push(makeCheck(spec('geo.machine.feeds', 'geo.machine', 'Content feed', 4), {
    status: feedScore ? 'pass' : 'opportunity',
    score: feedScore,
    summary: feedScore
      ? 'An RSS/Atom feed is available for machine consumption.'
      : 'No RSS or Atom feed found. Feeds give aggregators and crawlers a cheap way to discover new content quickly.',
  }));

  return out;
}

export function runGeoChecks(ctx: AuditContext): CheckResult[] {
  return [...entityChecks(ctx), ...citationChecks(ctx), ...contentChecks(ctx), ...machineChecks(ctx)];
}
