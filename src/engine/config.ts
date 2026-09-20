/** Engine-wide tunables. Everything here is overridable per-run. */

export const SCORING_VERSION = '1.0.0';

export const CRAWL_DEFAULTS = {
  maxPages: 25,
  maxCompetitorPages: 10,
  maxDepth: 4,
  concurrency: 5,
  pageTimeoutMs: 10_000,
  maxBodyBytes: 2_000_000,
  userAgent:
    'FindableBot/1.0 (+https://findable.example/bot; visibility audit; contact@findable.example)',
} as const;

/**
 * Pillar weights for the overall composite.
 *
 * These diverge from the brief's 35/25/25/15 — see docs/03-scoring-methodology.md §3
 * for the argument. The renormalisation rule below is the important part: an
 * unmeasured pillar is removed from the composite rather than imputed.
 */
export const PILLAR_WEIGHTS = {
  seo: 0.30,
  aeo: 0.25,
  geo: 0.30,
  ai: 0.15,
} as const;

/** Buyer-facing roll-ups shown above the four pillars. */
export const COMPOSITE_WEIGHTS = {
  googleVisibility: { seo: 0.65, aeo: 0.35 },
  aiVisibilityMeasured: { geo: 0.6, aeo: 0.25, ai: 0.15 },
  aiVisibilityEstimated: { geo: 0.7, aeo: 0.3 },
} as const;

export const GROUP_WEIGHTS: Record<string, { label: string; weight: number }> = {
  // SEO
  'seo.index': { label: 'Indexability & crawl', weight: 26 },
  'seo.onpage': { label: 'On-page fundamentals', weight: 24 },
  'seo.perf': { label: 'Performance & mobile', weight: 20 },
  'seo.schema': { label: 'Structured data', weight: 16 },
  'seo.links': { label: 'Internal linking', weight: 14 },
  // AEO
  'aeo.answer': { label: 'Answerability', weight: 34 },
  'aeo.schema': { label: 'Structured answer markup', weight: 24 },
  'aeo.eeat': { label: 'Trust & provenance', weight: 24 },
  'aeo.coverage': { label: 'Coverage & question gap', weight: 18 },
  // GEO
  'geo.entity': { label: 'Entity strength', weight: 30 },
  'geo.citation': { label: 'Citation readiness', weight: 28 },
  'geo.content': { label: 'Content citation potential', weight: 24 },
  'geo.machine': { label: 'Machine readability', weight: 18 },
  // AI presence
  'ai.mention': { label: 'Mention rate', weight: 40 },
  'ai.citation': { label: 'Citation rate', weight: 30 },
  'ai.sov': { label: 'Share of voice', weight: 20 },
  'ai.sentiment': { label: 'Sentiment & position', weight: 10 },
};

/** Below this coverage we refuse to show a pillar score at all. */
export const MIN_PILLAR_COVERAGE = 0.5;
/** Below this we show the score with a "partial measurement" badge. */
export const PARTIAL_PILLAR_COVERAGE = 0.7;

/**
 * Authority weighting for third-party citation sources.
 * Tier 7 is capped separately so that a wall of directory listings cannot
 * masquerade as authority. See docs/02 §"Citation readiness".
 */
export const CITATION_TIERS: {
  tier: number;
  weight: number;
  label: string;
  hosts: string[];
  cap?: number;
}[] = [
  { tier: 1, weight: 1.0, label: 'Wikipedia / Wikidata', hosts: ['wikipedia.org', 'wikidata.org'] },
  {
    tier: 2,
    weight: 0.85,
    label: 'Major press / .edu / .gov',
    hosts: ['nytimes.com', 'wsj.com', 'ft.com', 'bbc.co.uk', 'reuters.com', 'bloomberg.com',
            'forbes.com', 'economictimes.indiatimes.com', 'business-standard.com', 'thehindu.com'],
  },
  {
    tier: 3,
    weight: 0.7,
    label: 'Industry publications',
    hosts: ['techcrunch.com', 'searchengineland.com', 'searchenginejournal.com', 'wired.com',
            'venturebeat.com', 'theverge.com', 'gartner.com', 'inc.com'],
  },
  {
    tier: 4,
    weight: 0.55,
    label: 'Review platforms',
    hosts: ['g2.com', 'capterra.com', 'trustpilot.com', 'getapp.com', 'softwareadvice.com',
            'producthunt.com', 'glassdoor.com'],
  },
  {
    tier: 5,
    weight: 0.45,
    label: 'Community & Q&A',
    hosts: ['reddit.com', 'quora.com', 'stackexchange.com', 'stackoverflow.com',
            'news.ycombinator.com'],
  },
  {
    tier: 6,
    weight: 0.35,
    label: 'Owned social & profiles',
    hosts: ['linkedin.com', 'youtube.com', 'github.com', 'crunchbase.com', 'x.com', 'twitter.com',
            'facebook.com', 'instagram.com'],
  },
  { tier: 7, weight: 0.15, label: 'Directories & aggregators', hosts: [], cap: 0.05 },
];

/**
 * AI crawler agents, grouped by what blocking them actually costs.
 * `training` agents are never scored as failures — opting out of model training
 * is a legitimate business decision, not a defect.
 */
export const AI_CRAWLERS: {
  agent: string;
  operator: string;
  purpose: 'training' | 'search' | 'user_fetch' | 'corpus';
}[] = [
  { agent: 'GPTBot', operator: 'OpenAI', purpose: 'training' },
  { agent: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'search' },
  { agent: 'ChatGPT-User', operator: 'OpenAI', purpose: 'user_fetch' },
  { agent: 'ClaudeBot', operator: 'Anthropic', purpose: 'training' },
  { agent: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search' },
  { agent: 'Claude-User', operator: 'Anthropic', purpose: 'user_fetch' },
  { agent: 'PerplexityBot', operator: 'Perplexity', purpose: 'search' },
  { agent: 'Perplexity-User', operator: 'Perplexity', purpose: 'user_fetch' },
  { agent: 'Google-Extended', operator: 'Google', purpose: 'training' },
  { agent: 'CCBot', operator: 'Common Crawl', purpose: 'corpus' },
];

export const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com',
  'live.com', 'aol.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'gmx.com',
  'yandex.com', 'mail.com', 'zoho.com', 'rediffmail.com',
]);

export const SCORE_BANDS = [
  { min: 85, band: 'A' as const, label: 'Highly visible', tone: 'Defend and extend.' },
  { min: 70, band: 'B' as const, label: 'Competitive', tone: 'Close specific gaps.' },
  { min: 55, band: 'C' as const, label: 'At risk', tone: 'Structural work needed.' },
  { min: 35, band: 'D' as const, label: 'Largely invisible', tone: 'Your competitors are being found instead of you.' },
  { min: 0, band: 'E' as const, label: 'Effectively absent', tone: 'AI systems cannot reliably describe or verify your brand.' },
];
