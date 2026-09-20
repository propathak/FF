import type {
  AuditContext, AuditResult, AuditStage, Availability, CheckResult, CompetitorSummary,
  EnvBag, PillarScore, QuestionGap, StageEvent,
} from './types';
import { CRAWL_DEFAULTS, SCORING_VERSION } from './config';
import { defaultFetcher, type Fetcher } from './util/http';
import { normaliseInputUrl } from './util/url';
import { plural } from './util/text';
import { runDiscovery } from './crawl/discovery';
import { crawlSite } from './crawl/crawler';
import { buildBrandProfile, competitorNamesFromHosts } from './brand';
import { fetchPerformance } from './providers/pagespeed';
import { lookupEntity } from './providers/wikidata';
import { fetchAuthority } from './providers/authority';
import { createSerperProvider, enrichWithSerp } from './providers/serp';
import { createGeminiEngine, createPerplexityEngine, sampleAiAnswers, type AiEngine } from './providers/ai-answers';
import { generateNarrative, generateQuestions, readLlmConfig } from './providers/llm';
import { matchQuestions, rankGaps, templateQuestions } from './questions';
import { runSeoChecks } from './checks/seo';
import { runAeoChecks } from './checks/aeo';
import { runGeoChecks } from './checks/geo';
import { determineMode, runAiChecks } from './checks/ai';
import { rankFindings, scoreOverall, scorePillar, summariseChecks } from './scoring/score';
import { buildRecommendations, buildTranslations, competitorInsights } from './recommend/build';

export interface AuditInput {
  auditId: string;
  url: string;
  market?: string;
  competitorUrls?: string[];
  /** Paid enrichment is opt-in per run so cost follows qualification. */
  enablePaidEnrichment?: boolean;
  maxPages?: number;
  maxCompetitorPages?: number;
}

export interface AuditDeps {
  fetcher?: Fetcher;
  env?: EnvBag;
  onStage?: (event: StageEvent) => void;
  onPartial?: (partial: Partial<AuditResult>) => void;
}

function stageEvent(
  stage: AuditStage,
  status: StageEvent['status'],
  label: string,
  detail?: string,
): StageEvent {
  return { stage, status, label, detail, at: new Date().toISOString() };
}

const STAGE_LABELS: Record<AuditStage, string> = {
  discovery: 'Checking how your site is set up',
  crawl: 'Reading your pages',
  parse: 'Working out who your brand is',
  enrich: 'Gathering outside evidence',
  analyse: 'Running visibility checks',
  score: 'Scoring',
  interpret: 'Writing up what it means',
  recommend: 'Building your action plan',
};

/**
 * Builds the AI prompt set deterministically from the brand's own category.
 * The prompt set is reported alongside every AI number so the measurement can
 * be reproduced or challenged.
 */
function buildPromptSet(category: string | null, topTerms: string[], market: string): string[] {
  const subject = (category ?? topTerms[0] ?? '').split(/\s+/).slice(0, 6).join(' ').trim();
  if (!subject) return [];
  const region = market && market !== 'global' ? ` in ${market.toUpperCase()}` : '';
  return [
    `best ${subject}${region}`,
    `top ${subject} companies${region}`,
    `how to choose ${subject}`,
    `${subject} alternatives`,
    `what is the best ${subject} for a small business`,
    `${subject} pricing comparison`,
  ];
}

async function enrich(
  ctxBase: Omit<AuditContext, 'performance' | 'entity' | 'authority' | 'serp' | 'aiAnswers'>,
  input: AuditInput,
  env: EnvBag,
  competitorHosts: string[],
): Promise<Pick<AuditContext, 'performance' | 'entity' | 'authority' | 'serp' | 'aiAnswers'>> {
  const paid = input.enablePaidEnrichment === true;
  const market = ctxBase.target.market;

  // Free signals always run, and run concurrently.
  const [performance, entity, authorityMap] = await Promise.all([
    fetchPerformance(ctxBase.discovery.resolvedUrl, env['PAGESPEED_API_KEY']),
    lookupEntity(ctxBase.brand.name, ctxBase.target.host),
    fetchAuthority([ctxBase.target.host, ...competitorHosts], env['OPEN_PAGERANK_API_KEY']),
  ]);

  const authority = authorityMap[ctxBase.target.host.replace(/^www\./, '')] ?? {
    available: false as const,
    reason: 'Authority data not returned for this domain',
  };

  const prompts = buildPromptSet(ctxBase.brand.category, ctxBase.brand.topTerms, market);

  let serp: Availability<import('./types').SerpData> = {
    available: false,
    reason: 'Search-result enrichment is not enabled for this audit',
  };
  const serperKey = env['SERPER_API_KEY'];
  if (paid && env['SERP_PROVIDER'] === 'serper' && serperKey) {
    serp = await enrichWithSerp(createSerperProvider(serperKey), {
      brandName: ctxBase.brand.name,
      host: ctxBase.target.host,
      market,
      prompts: prompts.slice(0, 6),
      // Hard ceiling: 3 brand queries + 6 prompt queries ≈ $0.01 at Serper rates.
      queryBudget: 9,
    });
  }

  let aiAnswers: Availability<import('./types').AiAnswerData> = {
    available: false,
    reason: 'AI answer sampling is not enabled for this audit',
  };
  const providers = (env['AI_ANSWER_PROVIDERS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (paid && providers.length > 0 && prompts.length > 0) {
    const engines: AiEngine[] = [];
    const perplexityKey = env['PERPLEXITY_API_KEY'];
    const geminiKey = env['GEMINI_API_KEY'];
    if (providers.includes('perplexity') && perplexityKey) engines.push(createPerplexityEngine(perplexityKey));
    if (providers.includes('gemini') && geminiKey) engines.push(createGeminiEngine(geminiKey));
    if (engines.length > 0) {
      aiAnswers = await sampleAiAnswers(engines, {
        brandName: ctxBase.brand.name,
        host: ctxBase.target.host,
        competitorNames: competitorNamesFromHosts(competitorHosts),
        prompts: prompts.slice(0, 4),
        // 3 samples minimum: LLM answers are non-deterministic and one sample
        // is noise, not a measurement.
        samplesPerPrompt: 3,
        callBudget: 24,
      });
    }
  }

  return { performance, entity, authority, serp, aiAnswers };
}

/** Reduced audit used for competitors: crawl + deterministic checks only. */
async function auditCompetitor(
  url: string,
  fetcher: Fetcher,
  maxPages: number,
  allowLocal: boolean,
): Promise<CompetitorSummary> {
  const normalised = normaliseInputUrl(url, { allowLocal });
  const host = normalised ? new URL(normalised).hostname : url;
  if (!normalised) {
    return { host, source: 'user', status: 'failed', seo: null, aeo: null, geo: null, ai: null, overall: null, pagesCrawled: 0, error: 'Invalid URL' };
  }

  try {
    const discovery = await runDiscovery(normalised, fetcher);
    const { pages, discoveredUrlCount } = await crawlSite(
      discovery.resolvedUrl, discovery.robots, discovery.sitemap, fetcher, { maxPages },
    );
    // Same rule as the primary audit: no readable content, no score.
    if (!pages.some((p) => p.statusCode >= 200 && p.statusCode < 300 && p.wordCount > 0)) {
      return {
        host, source: 'user', status: 'failed', seo: null, aeo: null, geo: null, ai: null,
        overall: null, pagesCrawled: 0,
        error: discovery.homepageStatus >= 400
          ? `Blocked automated access (HTTP ${discovery.homepageStatus})`
          : 'No readable content could be crawled',
      };
    }

    const brand = buildBrandProfile(pages, discovery.host);
    const ctx: AuditContext = {
      auditId: `competitor:${host}`,
      target: { inputUrl: url, host: discovery.host, origin: discovery.origin, market: 'global' },
      discovery, pages, discoveredUrlCount, brand,
      // Competitors are scored on free, deterministic signals only — comparing
      // an enriched score against an unenriched one would be dishonest.
      performance: { available: false, reason: 'Not measured for competitors' },
      entity: { available: false, reason: 'Not measured for competitors' },
      authority: { available: false, reason: 'Not measured for competitors' },
      serp: { available: false, reason: 'Not measured for competitors' },
      aiAnswers: { available: false, reason: 'Not measured for competitors' },
    };

    const gaps = rankGaps(matchQuestions(templateQuestions(brand), pages));
    const checks = [...runSeoChecks(ctx), ...runAeoChecks(ctx, gaps), ...runGeoChecks(ctx)];
    const pillars = (['seo', 'aeo', 'geo'] as const).map((p) => scorePillar(p, checks));
    const overall = scoreOverall([...pillars, scorePillar('ai', [])], 'C');

    return {
      host: discovery.host,
      source: 'user',
      status: 'ok',
      seo: pillars.find((p) => p.pillar === 'seo')?.score ?? null,
      aeo: pillars.find((p) => p.pillar === 'aeo')?.score ?? null,
      geo: pillars.find((p) => p.pillar === 'geo')?.score ?? null,
      ai: null,
      overall: overall.score,
      pagesCrawled: pages.length,
    };
  } catch (err) {
    return {
      host, source: 'user', status: 'failed', seo: null, aeo: null, geo: null, ai: null,
      overall: null, pagesCrawled: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runAudit(input: AuditInput, deps: AuditDeps = {}): Promise<AuditResult> {
  const fetcher = deps.fetcher ?? defaultFetcher;
  const env = deps.env ?? process.env;
  const emit = deps.onStage ?? (() => undefined);
  const started = Date.now();

  const allowLocal = env['AUDIT_ALLOW_LOCAL'] === '1';
  const normalised = normaliseInputUrl(input.url, { allowLocal });
  if (!normalised) throw new Error(`"${input.url}" is not a valid website address.`);
  const market = input.market ?? 'global';
  const maxPages = input.maxPages ?? Number(env['AUDIT_MAX_PAGES'] ?? CRAWL_DEFAULTS.maxPages);
  const maxCompetitorPages =
    input.maxCompetitorPages ?? Number(env['AUDIT_MAX_COMPETITOR_PAGES'] ?? CRAWL_DEFAULTS.maxCompetitorPages);

  // --- Stage 1: discovery --------------------------------------------------
  emit(stageEvent('discovery', 'running', STAGE_LABELS.discovery));
  const discovery = await runDiscovery(normalised, fetcher);
  emit(stageEvent('discovery', 'done', STAGE_LABELS.discovery,
    `${discovery.robots.found ? 'robots.txt found' : 'no robots.txt'}, ${discovery.sitemap.found ? `${discovery.sitemap.urlCount} sitemap URLs` : 'no sitemap'}`));

  // --- Stage 2: crawl ------------------------------------------------------
  emit(stageEvent('crawl', 'running', STAGE_LABELS.crawl));
  const { pages, discoveredUrlCount } = await crawlSite(
    discovery.resolvedUrl, discovery.robots, discovery.sitemap, fetcher,
    {
      maxPages,
      onPage: (_page, crawled) => emit(stageEvent('crawl', 'running', STAGE_LABELS.crawl, `${crawled} pages read`)),
    },
  );
  /**
   * A crawl that returned only error pages must never produce a score. Scoring
   * a blocked site yields a confident, completely fabricated report — the exact
   * failure mode this product exists to avoid.
   */
  const readable = pages.filter((p) => p.statusCode >= 200 && p.statusCode < 300 && p.wordCount > 0);
  if (readable.length === 0) {
    const status = discovery.homepageStatus;
    const blocked = status === 403 || status === 401 || status === 429 || status === 503;
    throw new Error(
      blocked
        ? `${discovery.host} returned HTTP ${status} and refused our request. The site is blocking automated access, so we cannot audit it without being allowlisted. We will not guess a score from a blocked crawl.`
        : status === 0
          ? `We could not reach ${discovery.host}. The domain may be unreachable, or the request timed out.`
          : `We reached ${discovery.host} (HTTP ${status}) but could not read any readable content from it. This usually means the site is blocking automated requests or serves no server-rendered content at all.`,
    );
  }
  emit(stageEvent('crawl', 'done', STAGE_LABELS.crawl, `${readable.length} of ${discoveredUrlCount} URLs read`));

  // --- Stage 3: parse / brand profiling -----------------------------------
  emit(stageEvent('parse', 'running', STAGE_LABELS.parse));
  const brand = buildBrandProfile(pages, discovery.host);
  emit(stageEvent('parse', 'done', STAGE_LABELS.parse, brand.name));

  const competitorUrls = (input.competitorUrls ?? []).filter(Boolean).slice(0, 3);
  const competitorHosts = competitorUrls
    .map((u) => normaliseInputUrl(u, { allowLocal }))
    .filter((u): u is string => Boolean(u))
    .map((u) => new URL(u).hostname);

  // --- Stage 4: enrichment -------------------------------------------------
  emit(stageEvent('enrich', 'running', STAGE_LABELS.enrich));
  const base = {
    auditId: input.auditId,
    target: { inputUrl: input.url, host: discovery.host, origin: discovery.origin, market },
    discovery, pages, discoveredUrlCount, brand,
  };
  const [enrichment, competitors] = await Promise.all([
    enrich(base, input, env, competitorHosts),
    Promise.all(competitorUrls.map((u) => auditCompetitor(u, fetcher, maxCompetitorPages, allowLocal))),
  ]);
  const ctx: AuditContext = { ...base, ...enrichment };
  emit(stageEvent('enrich', 'done', STAGE_LABELS.enrich,
    [
      enrichment.performance.available ? 'performance' : null,
      enrichment.entity.available ? 'entity' : null,
      enrichment.serp.available ? 'search results' : null,
      enrichment.aiAnswers.available ? 'AI answers' : null,
    ].filter(Boolean).join(', ') || 'free signals only'));

  // --- Stage 5: question set + checks --------------------------------------
  emit(stageEvent('analyse', 'running', STAGE_LABELS.analyse));
  const llm = readLlmConfig(env);
  let candidates = templateQuestions(brand);
  if (llm) {
    const generated = await generateQuestions(llm, {
      brandName: brand.name,
      category: brand.category,
      descriptor: brand.descriptor,
      topTerms: brand.topTerms,
      market,
      sampleHeadings: pages.flatMap((p) => p.headings.filter((h) => h.level <= 2).map((h) => h.text)).slice(0, 30),
    });
    if (generated) {
      candidates = generated.questions as { question: string; intent: QuestionGap['intent'] }[];
    }
  }
  const gaps: QuestionGap[] = rankGaps(matchQuestions(candidates, pages));

  const checks: CheckResult[] = [
    ...runSeoChecks(ctx),
    ...runAeoChecks(ctx, gaps),
    ...runGeoChecks(ctx),
    ...runAiChecks(ctx),
  ];
  emit(stageEvent('analyse', 'done', STAGE_LABELS.analyse, `${checks.length} checks run`));

  // --- Stage 6: scoring ----------------------------------------------------
  emit(stageEvent('score', 'running', STAGE_LABELS.score));
  const mode = determineMode(ctx);
  const pillars: PillarScore[] = (['seo', 'aeo', 'geo', 'ai'] as const).map((p) => scorePillar(p, checks));
  const overall = scoreOverall(pillars, mode);
  emit(stageEvent('score', 'done', STAGE_LABELS.score, `${overall.score}/100`));

  // --- Stage 7: interpretation --------------------------------------------
  emit(stageEvent('interpret', 'running', STAGE_LABELS.interpret));
  let translations = buildTranslations(checks, pillars, gaps);
  const insights = competitorInsights(
    {
      seo: pillars.find((p) => p.pillar === 'seo')?.score ?? null,
      aeo: pillars.find((p) => p.pillar === 'aeo')?.score ?? null,
      geo: pillars.find((p) => p.pillar === 'geo')?.score ?? null,
      overall: overall.score,
    },
    competitors,
    gaps,
  );

  let verdict = templateVerdict(brand.name, overall.score, overall.band.label, mode, gaps);
  let narrativeSource: 'llm' | 'template' = 'template';
  if (llm) {
    const narrative = await generateNarrative(llm, {
      brandName: brand.name,
      host: discovery.host,
      overall: overall.score,
      band: overall.band.label,
      mode,
      seo: pillars.find((p) => p.pillar === 'seo')?.score ?? null,
      aeo: pillars.find((p) => p.pillar === 'aeo')?.score ?? null,
      geo: pillars.find((p) => p.pillar === 'geo')?.score ?? null,
      ai: pillars.find((p) => p.pillar === 'ai')?.score ?? null,
      findings: rankFindings(checks, pillars).slice(0, 6).map((c) => ({
        id: c.id, title: c.title, status: c.status, summary: c.summary,
      })),
      unansweredQuestionCount: gaps.filter((g) => !g.answered).length,
      competitorSummary: insights[0] ?? 'No competitors were supplied for comparison.',
    });
    if (narrative) {
      verdict = narrative.verdict;
      narrativeSource = 'llm';
      // The model rewrites business copy only; severity, technical detail and
      // check identity stay with the deterministic layer.
      translations = translations.map((t) => {
        const rewritten = narrative.translations.find((x) => x.id === t.id);
        return rewritten ? { ...t, headline: rewritten.headline, business: rewritten.business } : t;
      });
    }
  }
  emit(stageEvent('interpret', 'done', STAGE_LABELS.interpret, narrativeSource === 'llm' ? 'written' : 'templated'));

  // --- Stage 8: recommendations -------------------------------------------
  emit(stageEvent('recommend', 'running', STAGE_LABELS.recommend));
  const recommendations = buildRecommendations(checks, pillars);
  emit(stageEvent('recommend', 'done', STAGE_LABELS.recommend, `${recommendations.length} actions`));

  const notMeasured: { label: string; reason: string }[] = [];
  if (!ctx.performance.available) notMeasured.push({ label: 'Page performance', reason: ctx.performance.reason });
  if (!ctx.entity.available) notMeasured.push({ label: 'Entity recognition', reason: ctx.entity.reason });
  if (!ctx.authority.available) notMeasured.push({ label: 'Domain authority', reason: ctx.authority.reason });
  if (!ctx.serp.available) notMeasured.push({ label: 'Third-party citations & Google AI Overviews', reason: ctx.serp.reason });
  if (!ctx.aiAnswers.available) notMeasured.push({ label: 'AI assistant answers', reason: ctx.aiAnswers.reason });
  notMeasured.push({
    label: 'Backlink profile',
    reason: 'Not measured in this version. We report a free authority proxy instead of estimating a backlink graph.',
  });

  return {
    auditId: input.auditId,
    scoringVersion: SCORING_VERSION,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    target: { url: discovery.resolvedUrl, host: discovery.host, market },
    brand,
    mode,
    overall,
    pillars,
    checks,
    translations,
    questionGaps: gaps,
    recommendations,
    competitors: competitors.map((c) => ({ ...c, source: 'user' as const })),
    competitorInsights: insights,
    stats: {
      pagesCrawled: pages.length,
      urlsDiscovered: discoveredUrlCount,
      ...summariseChecks(checks),
    },
    notMeasured,
    narrative: { verdict, source: narrativeSource },
  };
}

function templateVerdict(
  brandName: string,
  score: number,
  band: string,
  mode: string,
  gaps: QuestionGap[],
): string {
  const unanswered = gaps.filter((g) => !g.answered).length;
  const modeNote =
    mode === 'C'
      ? 'This score reflects how ready your site is to be found and cited, measured from your own site and entity signals.'
      : 'This score includes measurements taken from live AI answer surfaces.';
  return [
    `${brandName} scores ${score}/100 for overall search and AI visibility — ${band.toLowerCase()}.`,
    unanswered > 0
      ? `Your site leaves ${plural(unanswered, 'high-intent customer question')} unanswered, which is where competitors get recommended instead of you.`
      : 'Your content covers the questions we would expect customers to ask in this category.',
    modeNote,
  ].join(' ');
}

export { STAGE_LABELS };
