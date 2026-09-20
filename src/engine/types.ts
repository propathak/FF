/**
 * Core domain types for the audit engine.
 *
 * This module — and everything under `src/engine/` — must stay free of any
 * Next.js or React import so the engine can be lifted into a standalone worker
 * (Phase 3) without a rewrite.
 */

export type Pillar = 'seo' | 'aeo' | 'geo' | 'ai';

/**
 * A plain environment bag. The engine deliberately does not reference
 * `NodeJS.ProcessEnv` so it can run anywhere — a worker, an edge runtime or a
 * test — without pulling in Node's global types.
 */
export type EnvBag = Record<string, string | undefined>;

/**
 * `unavailable` is deliberately distinct from `fail`: a site is never penalised
 * because we lacked an API key or were blocked. Unavailable checks are removed
 * from both sides of the scoring fraction.
 */
export type CheckStatus =
  | 'pass'
  | 'warn'
  | 'fail'
  | 'opportunity'
  | 'not_applicable'
  | 'unavailable';

export type Evidence =
  | { kind: 'url'; url: string; note?: string }
  | { kind: 'text'; label: string; value: string }
  | { kind: 'count'; label: string; value: number; of?: number }
  | { kind: 'list'; label: string; values: string[] }
  | { kind: 'metric'; label: string; value: number; unit?: string; source?: string };

export interface CheckResult {
  id: string;
  pillar: Pillar;
  group: string;
  title: string;
  status: CheckStatus;
  /** 0..1, graded rather than binary — see docs/03-scoring-methodology.md */
  score: number;
  /** Relative importance inside the group. */
  weight: number;
  /** 0..1. Reduces effective weight, never the score itself. */
  confidence: number;
  /** Plain-language statement of what we observed. */
  summary: string;
  evidence: Evidence[];
  affectedUrls: string[];
}

export interface GroupScore {
  group: string;
  label: string;
  score: number;
  weight: number;
  coverage: number;
  checks: CheckResult[];
}

export interface PillarScore {
  pillar: Pillar;
  label: string;
  /** 0..100, or null when coverage is too low to report honestly. */
  score: number | null;
  /** Share of the pillar's total possible weight that was actually measured. */
  coverage: number;
  groups: GroupScore[];
  /** Groups we could not measure at all, for the "partial measurement" badge. */
  unmeasuredGroups: string[];
}

/** How AI presence was established. See docs/02 §"AI Presence". */
export type AuditMode = 'A' | 'B' | 'C';

export interface ScoreBand {
  band: 'A' | 'B' | 'C' | 'D' | 'E';
  label: string;
  tone: string;
}

export interface OverallScore {
  score: number;
  band: ScoreBand;
  mode: AuditMode;
  /** Weights actually applied after renormalisation. */
  appliedWeights: Record<Pillar, number>;
  googleVisibility: number;
  aiVisibility: number;
  /** Human-readable note about which pillars fed the composite. */
  compositeNote: string;
}

// ---------------------------------------------------------------------------
// Crawl signals
// ---------------------------------------------------------------------------

export interface HeadingNode {
  level: number;
  text: string;
}

export interface QuestionHeading {
  text: string;
  /** The first paragraph following the heading, trimmed. */
  answer: string | null;
  answerLength: number;
  /** A self-contained declarative answer of 40–320 chars directly after the heading. */
  qualifies: boolean;
}

export interface PageSignals {
  url: string;
  finalUrl: string;
  depth: number;
  statusCode: number;
  contentType: string;
  bytes: number;
  loadMs: number;
  redirectChain: string[];
  error?: string;

  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: { noindex: boolean; nofollow: boolean; raw: string | null };
  lang: string | null;

  headings: HeadingNode[];
  h1Count: number;
  headingHierarchyBreaks: number;

  wordCount: number;
  textToHtmlRatio: number;
  medianSentenceWords: number;
  medianParagraphWords: number;

  internalLinks: string[];
  externalLinks: string[];
  anchorTexts: string[];
  nofollowOutbound: number;

  images: { total: number; withAlt: number; decorative: number };

  jsonLd: unknown[];
  jsonLdTypes: string[];
  jsonLdHasIds: boolean;
  jsonLdParseErrors: number;
  microdataTypes: string[];
  openGraph: Record<string, string>;

  semanticTags: Record<string, number>;
  lists: { ul: number; ol: number; table: number; dl: number };

  questionHeadings: QuestionHeading[];
  definitionBlocks: number;
  statisticClaims: number;
  quotablePassages: number;
  blockquotes: number;

  datePublished: string | null;
  dateModified: string | null;
  authorName: string | null;
  hasAuthorSchema: boolean;

  /** Client-side-rendering dependency: served HTML carries almost no content. */
  csrDependent: boolean;

  /** Hashed 5-gram shingles for near-duplicate detection between pages. */
  shingles: number[];

  /** Small text excerpt, the only page prose that ever reaches an LLM. */
  excerpt: string;
}

export interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

export interface RobotsTxt {
  found: boolean;
  status: number;
  raw: string | null;
  rules: RobotsRule[];
  sitemaps: string[];
  parseErrors: string[];
}

export interface AiCrawlerVerdict {
  agent: string;
  operator: string;
  purpose: 'training' | 'search' | 'user_fetch' | 'corpus';
  allowed: boolean;
  /** Which rule block decided it — `*` or an explicit agent block. */
  matchedBy: string;
}

export interface SitemapInfo {
  found: boolean;
  sources: string[];
  urlCount: number;
  sampledUrls: string[];
  hasLastmod: boolean;
  freshestLastmod: string | null;
  isIndex: boolean;
  errors: string[];
}

export interface DiscoveryResult {
  inputUrl: string;
  resolvedUrl: string;
  origin: string;
  host: string;
  https: boolean;
  tlsValid: boolean | null;
  homepageStatus: number;
  redirectChain: string[];
  /** Which of apex/www × http/https resolve, and whether they converge. */
  hostVariants: { url: string; status: number; finalUrl: string }[];
  canonicalHostConsistent: boolean;
  robots: RobotsTxt;
  aiCrawlers: AiCrawlerVerdict[];
  sitemap: SitemapInfo;
  llmsTxt: { found: boolean; bytes: number; hasSections: boolean };
  feeds: string[];
}

// ---------------------------------------------------------------------------
// External enrichment
// ---------------------------------------------------------------------------

export type Availability<T> =
  | { available: true; data: T }
  | { available: false; reason: string };

export interface PerformanceData {
  strategy: 'mobile' | 'desktop';
  /** 'field' = CrUX real users, 'lab' = Lighthouse simulation. */
  dataSource: 'field' | 'lab';
  performanceScore: number | null;
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  ttfbMs: number | null;
  audits: Record<string, { score: number | null; title: string }>;
}

export interface EntityData {
  wikidataQid: string | null;
  wikidataLabel: string | null;
  wikipediaUrl: string | null;
  description: string | null;
  sameAs: string[];
}

export interface AuthorityData {
  host: string;
  openPageRank: number | null;
  rank: number | null;
}

export interface CitationHit {
  tier: number;
  source: string;
  url: string;
  title: string;
}

export interface SerpData {
  provider: string;
  queriesRun: number;
  aiOverviewChecked: number;
  aiOverviewPresent: number;
  aiOverviewCitesBrand: number;
  aiOverviewCitedDomains: string[];
  organicBrandPositions: { query: string; position: number | null }[];
  citations: CitationHit[];
}

export interface AiMention {
  engine: string;
  prompt: string;
  sampleIndex: number;
  brandMentioned: boolean;
  ordinal: number | null;
  citedBrandDomain: boolean;
  competitorsMentioned: string[];
  citedDomains: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | null;
}

export interface AiAnswerData {
  engines: string[];
  promptSet: string[];
  samplesPerPrompt: number;
  mentions: AiMention[];
  /** Always reported alongside its denominator. */
  shareOfVoice: { brandMentions: number; totalBrandMentions: number; pct: number };
}

// ---------------------------------------------------------------------------
// Brand identity derived deterministically from the crawl
// ---------------------------------------------------------------------------

export interface BrandProfile {
  name: string;
  /** Best-effort category phrase extracted from schema/H1/title. */
  category: string | null;
  descriptor: string | null;
  topTerms: string[];
  nameVariants: string[];
  nameConsistent: boolean;
}

// ---------------------------------------------------------------------------
// Audit context + result
// ---------------------------------------------------------------------------

export interface AuditContext {
  auditId: string;
  target: { inputUrl: string; host: string; origin: string; market: string };
  discovery: DiscoveryResult;
  pages: PageSignals[];
  /** URLs discovered but not fetched because of the page cap. */
  discoveredUrlCount: number;
  brand: BrandProfile;
  performance: Availability<PerformanceData>;
  entity: Availability<EntityData>;
  authority: Availability<AuthorityData>;
  serp: Availability<SerpData>;
  aiAnswers: Availability<AiAnswerData>;
}

export type RecommendationHorizon = 'now' | '30d' | '90d';
export type ImpactLevel = 'High' | 'Medium' | 'Low';
export type EffortLevel = 'High' | 'Medium' | 'Low';

export interface Recommendation {
  id: string;
  checkId: string;
  pillar: Pillar;
  horizon: RecommendationHorizon;
  title: string;
  problem: string;
  whyItMatters: string;
  action: string;
  impact: ImpactLevel;
  effort: EffortLevel;
}

export interface BusinessTranslation {
  id: string;
  headline: string;
  business: string;
  technical: string;
  checkIds: string[];
  severity: 'critical' | 'warning' | 'opportunity';
}

export interface QuestionGap {
  question: string;
  intent: 'what_is' | 'how_to' | 'best_for' | 'comparison' | 'pricing';
  answered: boolean;
  matchedUrl: string | null;
  /** Higher = closer to a purchase decision. */
  value: number;
}

export interface CompetitorSummary {
  host: string;
  source: 'user' | 'serp';
  status: 'ok' | 'failed';
  seo: number | null;
  aeo: number | null;
  geo: number | null;
  ai: number | null;
  overall: number | null;
  pagesCrawled: number;
  error?: string;
}

export interface AuditResult {
  auditId: string;
  scoringVersion: string;
  createdAt: string;
  durationMs: number;
  target: { url: string; host: string; market: string };
  brand: BrandProfile;
  mode: AuditMode;
  overall: OverallScore;
  pillars: PillarScore[];
  checks: CheckResult[];
  translations: BusinessTranslation[];
  questionGaps: QuestionGap[];
  recommendations: Recommendation[];
  competitors: CompetitorSummary[];
  /** Template-generated sentences, each backed by an actual score delta. */
  competitorInsights: string[];
  stats: {
    pagesCrawled: number;
    urlsDiscovered: number;
    criticalCount: number;
    warningCount: number;
    opportunityCount: number;
    passCount: number;
  };
  /** What we could not measure, surfaced verbatim in the UI. */
  notMeasured: { label: string; reason: string }[];
  narrative: {
    verdict: string;
    source: 'llm' | 'template';
  };
}

export type AuditStage =
  | 'discovery'
  | 'crawl'
  | 'parse'
  | 'enrich'
  | 'analyse'
  | 'score'
  | 'interpret'
  | 'recommend';

export interface StageEvent {
  stage: AuditStage;
  status: 'running' | 'done' | 'failed' | 'skipped';
  label: string;
  detail?: string;
  at: string;
}
