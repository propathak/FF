/**
 * Real checks from the audit engine, named exactly as the report names them.
 *
 * Credibility on a landing page comes from specificity: a marketer who has
 * sat through vague agency pitches recognises the difference between "we
 * analyse your AI visibility" and "OAI-SearchBot is blocked in your
 * robots.txt". These are the actual check ids, so the page cannot drift into
 * claiming something the engine does not do.
 */
export interface ShowcaseCheck {
  id: string;
  title: string;
  detail: string;
  pillar: 'SEO' | 'AEO' | 'GEO';
}

export const SHOWCASE_CHECKS: ShowcaseCheck[] = [
  {
    id: 'geo.machine.ai_crawler_access',
    title: 'AI answer engines can fetch your site',
    detail: 'OAI-SearchBot, Claude-SearchBot and PerplexityBot, checked separately from training crawlers',
    pillar: 'GEO',
  },
  {
    id: 'aeo.answer.direct_answer_proximity',
    title: 'Direct answers follow questions',
    detail: 'Is the paragraph under each question heading a self-contained 40–320 character answer?',
    pillar: 'AEO',
  },
  {
    id: 'aeo.schema.answer_alignment',
    title: 'FAQ markup matches visible content',
    detail: 'Answers in your schema that do not appear on the page are a policy violation, not a technicality',
    pillar: 'AEO',
  },
  {
    id: 'geo.entity.organization_schema',
    title: 'Organization structured data',
    detail: 'The eleven properties that actually disambiguate one company from another',
    pillar: 'GEO',
  },
  {
    id: 'geo.entity.sameas',
    title: 'sameAs identity links',
    detail: 'What connects your website to your LinkedIn, Crunchbase and Wikidata records',
    pillar: 'GEO',
  },
  {
    id: 'seo.index.csr_dependency',
    title: 'Content is present in served HTML',
    detail: 'Several AI crawlers do not run JavaScript — to them a client-rendered page is blank',
    pillar: 'SEO',
  },
  {
    id: 'geo.machine.entity_graph',
    title: 'Connected entity graph',
    detail: '@id references that turn isolated islands of markup into one description of your business',
    pillar: 'GEO',
  },
  {
    id: 'geo.content.quotable',
    title: 'Quotable passages',
    detail: 'Sentences that survive on their own — the only kind an AI answer can lift and attribute',
    pillar: 'GEO',
  },
  {
    id: 'geo.entity.name_consistency',
    title: 'Consistent brand name',
    detail: 'Entity resolution matches strings; three spellings look like three companies',
    pillar: 'GEO',
  },
  {
    id: 'seo.perf.lcp',
    title: 'Largest Contentful Paint',
    detail: 'Real-user data from Chrome where your traffic supports it, lab data where it does not',
    pillar: 'SEO',
  },
  {
    id: 'seo.onpage.duplicate_content',
    title: 'Pages are not near-duplicates',
    detail: 'Shingled text comparison across the crawl, not a guess from the URL pattern',
    pillar: 'SEO',
  },
  {
    id: 'aeo.eeat.author_schema',
    title: 'Author structured data',
    detail: 'Answer engines resolve who said something before deciding whether to repeat it',
    pillar: 'AEO',
  },
];

/** Prompts a buyer would actually type, used for the rotating hero line. */
export const BUYER_PROMPTS: string[] = [
  'best CRM for a 20-person sales team',
  'top running shoes under ₹10,000',
  'Zoho vs Salesforce for a small business',
  'which project tool integrates with WhatsApp',
  'best SEO agency in Mumbai',
  'most reliable payroll software in India',
  'alternatives to Mailchimp for ecommerce',
];
