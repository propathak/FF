import type { EffortLevel, ImpactLevel, Pillar, RecommendationHorizon } from '../types';

/**
 * Check id → recommendation template.
 *
 * Impact and Effort are assigned here, by rule — never by a model. A model that
 * labels its own suggestions "High impact" is marketing, not analysis.
 *
 * `gated: true` marks strategy-level work that stays blurred until the lead form
 * is submitted. Diagnosis is always free; implementation detail is the gate.
 */
export interface RecommendationTemplate {
  title: string;
  problem: string;
  whyItMatters: string;
  action: string;
  horizon: RecommendationHorizon;
  impact: ImpactLevel;
  effort: EffortLevel;
  gated: boolean;
}

export const RECOMMENDATION_CATALOG: Record<string, RecommendationTemplate> = {
  // --- Fix immediately: things actively removing you from results -----------
  'geo.machine.ai_crawler_access': {
    title: 'Unblock AI answer engines in robots.txt',
    problem: 'Your robots.txt blocks crawlers that AI assistants use to fetch and cite pages.',
    whyItMatters: 'These are not training crawlers. They are the agents that retrieve a page at the moment a user asks a question. While they are blocked, your site cannot be cited in those answers at all — no amount of content work will change that.',
    action: 'Add explicit Allow rules for OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User and PerplexityBot. Keep any training-crawler policy you have chosen; the two decisions are independent.',
    horizon: 'now', impact: 'High', effort: 'Low', gated: false,
  },
  'seo.index.robots_txt': {
    title: 'Remove the site-wide crawl block',
    problem: 'robots.txt disallows all crawlers from the entire site.',
    whyItMatters: 'Search engines cannot index a single page. Every other optimisation is irrelevant until this is lifted.',
    action: 'Replace "Disallow: /" with targeted rules for the paths that genuinely should not be crawled.',
    horizon: 'now', impact: 'High', effort: 'Low', gated: false,
  },
  'seo.index.noindex': {
    title: 'Remove unintended noindex directives',
    problem: 'Pages that should rank are marked noindex.',
    whyItMatters: 'A noindex page cannot appear in search results or be used as a citation source, no matter how good its content is. This is usually a staging setting that shipped to production.',
    action: 'Audit the robots meta tag and X-Robots-Tag header on every affected URL and remove noindex where the page is meant to be public.',
    horizon: 'now', impact: 'High', effort: 'Low', gated: false,
  },
  'seo.index.https': {
    title: 'Move the site to HTTPS',
    problem: 'The site is served over an insecure connection.',
    whyItMatters: 'Browsers warn visitors before they reach your content, and search engines treat HTTPS as a ranking signal. Conversion impact typically exceeds the ranking impact.',
    action: 'Install a TLS certificate, redirect all HTTP traffic to HTTPS with 301s, and update internal links and canonical tags.',
    horizon: 'now', impact: 'High', effort: 'Medium', gated: false,
  },
  'seo.index.canonical_host': {
    title: 'Consolidate to a single hostname',
    problem: 'More than one hostname variant serves your content independently.',
    whyItMatters: 'Each variant accumulates its own ranking signals, so your authority is divided across duplicates of the same site instead of concentrated on one.',
    action: 'Pick one canonical hostname and 301-redirect the other three variants to it. Update canonical tags and the sitemap to match.',
    horizon: 'now', impact: 'High', effort: 'Low', gated: false,
  },
  'seo.index.csr_dependency': {
    title: 'Serve content in the initial HTML',
    problem: 'Pages return almost no content until JavaScript runs.',
    whyItMatters: 'Several AI crawlers do not execute JavaScript at all. To them your pages are effectively blank, which is why a site can rank acceptably in Google and be invisible in AI answers.',
    action: 'Enable server-side rendering or static generation for content pages so the primary copy, headings and structured data are present in the served HTML.',
    horizon: 'now', impact: 'High', effort: 'High', gated: false,
  },
  'seo.index.broken_pages': {
    title: 'Fix broken internal links',
    problem: 'Internal links point at pages that return errors.',
    whyItMatters: 'Crawl budget is spent on dead ends and visitors hit errors mid-journey.',
    action: 'Update or remove the failing links, and add redirects for URLs that moved.',
    horizon: 'now', impact: 'Medium', effort: 'Low', gated: false,
  },
  'seo.schema.valid_jsonld': {
    title: 'Fix structured data that fails to parse',
    problem: 'JSON-LD blocks on the site contain syntax errors.',
    whyItMatters: 'A malformed block is discarded entirely — you get none of the benefit of markup you have already paid to build.',
    action: 'Validate every JSON-LD block and correct the syntax errors. Add validation to your build so it cannot regress.',
    horizon: 'now', impact: 'Medium', effort: 'Low', gated: false,
  },

  // --- Next 30 days: content and structure --------------------------------
  'geo.entity.organization_schema': {
    title: 'Publish complete Organization structured data',
    problem: 'Your site has no machine-readable statement of who your organisation is.',
    whyItMatters: 'This is the record AI systems use to resolve your brand as a real entity. Without it, every system is inferring your identity from prose, and inference produces errors and omissions.',
    action: 'Add an Organization block on every page with name, legalName, url, logo, description, sameAs, address, contactPoint, foundingDate and founder.',
    horizon: '30d', impact: 'High', effort: 'Low', gated: false,
  },
  'geo.entity.sameas': {
    title: 'Connect your identity graph with sameAs',
    problem: 'Nothing machine-readable links your website to your other verified profiles.',
    whyItMatters: 'sameAs is how an AI system confirms that the company on your site, the company on LinkedIn and the company in a review listing are one entity. Without it, corroborating evidence about you cannot be attached to you.',
    action: 'Add sameAs links to LinkedIn, Crunchbase, your Wikidata entity if one exists, YouTube, GitHub and your primary social profiles.',
    horizon: '30d', impact: 'High', effort: 'Low', gated: false,
  },
  'aeo.answer.direct_answer_proximity': {
    title: 'Put a direct answer under every question heading',
    problem: 'Question headings are not followed by a short, self-contained answer.',
    whyItMatters: 'Answer engines lift the paragraph immediately after a question heading. If that paragraph is a preamble, a long essay or a pronoun-led sentence, there is nothing extractable and a competitor gets quoted instead.',
    action: 'Under each question heading, write a 40–320 character answer that stands on its own without the heading, then expand below it.',
    horizon: '30d', impact: 'High', effort: 'Medium', gated: false,
  },
  'aeo.schema.faq': {
    title: 'Add FAQ structured data to question-led pages',
    problem: 'No FAQPage or QAPage markup exists on the site.',
    whyItMatters: 'FAQ markup hands search and answer engines a pre-paired question and answer instead of asking them to infer one from the page.',
    action: 'Add FAQPage markup to pages with genuine Q&A content, ensuring every acceptedAnswer text also appears verbatim in the visible page.',
    horizon: '30d', impact: 'High', effort: 'Low', gated: false,
  },
  'aeo.schema.answer_alignment': {
    title: 'Align FAQ markup with visible page content',
    problem: 'FAQ answers in your markup do not appear in the visible page text.',
    whyItMatters: 'Markup that does not match the page is treated as a policy violation, not a technicality, and can cost you rich results entirely.',
    action: 'Rewrite the markup to quote the visible answers, or publish the answers on the page.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'aeo.answer.question_headings': {
    title: 'Restructure content around real customer questions',
    problem: 'Almost no headings on the site are phrased as questions.',
    whyItMatters: 'Answer engines match a user question to a heading. Feature-led and brand-led headings give them nothing to match, so your content is skipped even when it contains the answer.',
    action: 'Convert descriptive headings into the question the section actually answers, in the words a customer would use.',
    horizon: '30d', impact: 'High', effort: 'Medium', gated: false,
  },
  'aeo.coverage.question_gap': {
    title: 'Answer the high-intent questions your site ignores',
    problem: 'Customers are asking questions your site does not answer.',
    whyItMatters: 'Every unanswered question is a moment where an AI assistant recommends someone else because only they published an answer.',
    action: 'Publish a dedicated, well-structured answer for each unanswered question, prioritising comparison and "best for" intent.',
    horizon: '30d', impact: 'High', effort: 'Medium', gated: true,
  },
  'aeo.eeat.author_byline': {
    title: 'Attribute content to named, credentialed people',
    problem: 'Editorial content is published without a named author.',
    whyItMatters: 'Answer engines resolve who said something before deciding whether to repeat it. Anonymous content is weighted down against otherwise-identical attributed content.',
    action: 'Add author bylines linking to author pages with real credentials, and mark them up with Person schema including sameAs.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: false,
  },
  'aeo.eeat.dates': {
    title: 'Publish machine-readable dates',
    problem: 'Content lacks datePublished and dateModified values.',
    whyItMatters: 'Undated content is treated as potentially stale and loses to dated alternatives on any question where recency matters.',
    action: 'Add datePublished and dateModified to Article schema and show the update date visibly on the page.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'seo.onpage.title_present': {
    title: 'Write a unique title for every page',
    problem: 'Pages are missing titles.',
    whyItMatters: 'The title is the single strongest on-page relevance signal and the text a searcher actually clicks.',
    action: 'Write a unique 30–60 character title for each page, leading with the term the page is meant to be found for.',
    horizon: '30d', impact: 'High', effort: 'Low', gated: false,
  },
  'seo.onpage.title_duplicates': {
    title: 'De-duplicate page titles',
    problem: 'Multiple pages share the same title.',
    whyItMatters: 'Search engines cannot tell the pages apart and will pick one to show, suppressing the rest.',
    action: 'Give each page a title describing its specific content rather than the template or section.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'seo.onpage.h1': {
    title: 'Give each page a single clear H1',
    problem: 'Pages have no H1, or several.',
    whyItMatters: 'The H1 is the primary topic declaration. Missing or competing H1s make the page ambiguous to both search and answer engines.',
    action: 'Use exactly one H1 per page, stating the page topic in customer language.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'seo.onpage.content_depth': {
    title: 'Deepen thin content on commercial pages',
    problem: 'Median page length is well below what competing pages publish.',
    whyItMatters: 'Thin pages cannot answer follow-up questions, so they rank for nothing specific and offer nothing quotable to an AI answer.',
    action: 'Expand priority pages to cover the questions a buyer asks before purchase, with evidence and specifics rather than padding.',
    horizon: '30d', impact: 'Medium', effort: 'High', gated: true,
  },
  'seo.perf.lcp': {
    title: 'Improve Largest Contentful Paint',
    problem: 'Your main content takes too long to appear.',
    whyItMatters: 'LCP is a confirmed ranking signal and correlates directly with bounce rate — the traffic you already earn is leaking.',
    action: 'Optimise and preload the hero image, remove render-blocking resources, and cut server response time.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: false,
  },
  'seo.perf.performance_score': {
    title: 'Raise overall page performance',
    problem: 'Lighthouse performance is below the competitive threshold.',
    whyItMatters: 'Slow pages lose visitors before the content loads, and performance is a tie-breaker in competitive results.',
    action: 'Work the top Lighthouse opportunities in order: image formats and sizing, unused JavaScript, render-blocking CSS, caching headers.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: false,
  },
  'seo.schema.present': {
    title: 'Roll out structured data across the site',
    problem: 'Most pages carry no structured data.',
    whyItMatters: 'Structured data is the only channel where you state facts about your business in a form machines do not have to interpret.',
    action: 'Map each page template to the right schema type and implement them in the template rather than page by page.',
    horizon: '30d', impact: 'High', effort: 'Medium', gated: true,
  },
  'seo.onpage.meta_description': {
    title: 'Write meta descriptions for key pages',
    problem: 'Pages have no meta description.',
    whyItMatters: 'Without one, search engines assemble a snippet from whatever text they find, which is rarely your best pitch.',
    action: 'Write a 120–158 character description for each priority page, framed as the answer the searcher wants.',
    horizon: '30d', impact: 'Low', effort: 'Low', gated: false,
  },
  'seo.links.internal_density': {
    title: 'Strengthen internal linking',
    problem: 'Pages link to very few other pages on the site.',
    whyItMatters: 'Internal links are how authority and crawl attention reach your deeper pages. Sparse linking leaves your best content stranded.',
    action: 'Add contextual links from high-authority pages to priority pages, using descriptive anchor text.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'seo.index.sitemap': {
    title: 'Publish and declare an XML sitemap',
    problem: 'No usable XML sitemap was found.',
    whyItMatters: 'A sitemap is the cheapest way to tell crawlers what exists and what changed. Without one, discovery depends entirely on link-following.',
    action: 'Generate a sitemap with accurate lastmod dates, declare it in robots.txt, and submit it in Search Console.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },

  // --- Next 90 days: authority and strategy -------------------------------
  'geo.citation.third_party': {
    title: 'Build independent third-party evidence',
    problem: 'Few or no authoritative independent sources mention your brand.',
    whyItMatters: 'AI systems weight independent corroboration far above anything you say about yourself. Without it, your claims are unverifiable and get passed over for brands that have been written about.',
    action: 'Run a targeted campaign across the source tiers that actually get cited: industry publications, review platforms, relevant community threads, and analyst or trade coverage.',
    horizon: '90d', impact: 'High', effort: 'High', gated: true,
  },
  'geo.citation.wikidata': {
    title: 'Establish a verifiable entity record',
    problem: 'No Wikidata entity corresponds to your organisation.',
    whyItMatters: 'Wikidata is consumed directly by the grounding layers of every major AI system. An entity record is the closest thing to a canonical, machine-readable identity for a business.',
    action: 'Build the independent coverage that makes an entity notable, then create a properly sourced record and link it from your site with sameAs.',
    horizon: '90d', impact: 'High', effort: 'High', gated: true,
  },
  'geo.content.comparisons': {
    title: 'Publish comparison and alternatives content',
    problem: 'You publish no comparison or alternatives pages.',
    whyItMatters: 'These pages are disproportionately cited when an AI assistant answers "which should I choose" — the exact moment a buyer decides. Right now that answer is written entirely by your competitors.',
    action: 'Publish honest, specific comparison pages covering the alternatives buyers actually consider, including where you are not the right fit.',
    horizon: '90d', impact: 'High', effort: 'Medium', gated: true,
  },
  'geo.content.statistics': {
    title: 'Publish original data and statistics',
    problem: 'Your content contains almost no concrete data points.',
    whyItMatters: 'Specific numbers are the most-cited content type in AI answers, because a model quoting a figure needs a source to attribute it to.',
    action: 'Publish original research, benchmarks or survey data from what your business already knows, with a clear methodology.',
    horizon: '90d', impact: 'High', effort: 'High', gated: true,
  },
  'geo.content.original_research': {
    title: 'Commission original research',
    problem: 'The site publishes no research, survey or benchmark content.',
    whyItMatters: 'Original data earns citations for years without further outreach. It is the only asset class that compounds.',
    action: 'Identify one dataset your business uniquely holds, publish it annually, and build an outreach programme around it.',
    horizon: '90d', impact: 'High', effort: 'High', gated: true,
  },
  'geo.content.quotable': {
    title: 'Make your content quotable',
    problem: 'Your content contains few self-contained, quotable sentences.',
    whyItMatters: 'An AI answer lifts a sentence that survives on its own. Prose that depends on the previous paragraph cannot be quoted, so it is never attributed to you.',
    action: 'Rewrite key sections so each claim is a complete, specific, standalone statement rather than a continuation.',
    horizon: '90d', impact: 'Medium', effort: 'Medium', gated: true,
  },
  'geo.machine.entity_graph': {
    title: 'Connect your structured data into one graph',
    problem: 'Structured data exists as disconnected islands with no @id references.',
    whyItMatters: 'Unlinked blocks describe pages. A linked graph describes an organisation. Only the second one builds an entity an AI system can reason about.',
    action: 'Assign stable @id values to your Organization, WebSite, Person and Product nodes and reference them across templates.',
    horizon: '90d', impact: 'Medium', effort: 'Medium', gated: true,
  },
  'geo.entity.people': {
    title: 'Make your experts visible entities',
    problem: 'No founders or executives are described in structured data.',
    whyItMatters: 'Named, verifiable people are a strong corroboration signal, and expert attribution is what separates a citable source from generic content.',
    action: 'Publish author and leadership pages with Person schema, credentials and sameAs links to their professional profiles.',
    horizon: '90d', impact: 'Medium', effort: 'Medium', gated: true,
  },
  'geo.citation.domain_authority': {
    title: 'Grow domain authority',
    problem: 'Your domain authority proxy is low relative to the category.',
    whyItMatters: 'Authority governs how readily both search engines and AI systems trust and surface your content.',
    action: 'Run a sustained digital PR and link acquisition programme focused on the publications that already rank and get cited in your category.',
    horizon: '90d', impact: 'High', effort: 'High', gated: true,
  },
  'aeo.coverage.intent_spread': {
    title: 'Fill the missing stage of the buying journey',
    problem: 'Your content does not cover every search intent.',
    whyItMatters: 'A gap at any stage means the buyer meets a competitor at that stage instead of you, and brand preference is usually decided before the transactional query.',
    action: 'Build a content architecture that covers informational, comparison and transactional intent for each core topic.',
    horizon: '90d', impact: 'Medium', effort: 'High', gated: true,
  },
  'geo.machine.schema_coverage': {
    title: 'Extend machine-readable coverage site-wide',
    problem: 'Most pages are not machine-readable beyond their prose.',
    whyItMatters: 'The share of your site that is machine-readable is effectively the share of your site that is eligible for AI citation.',
    action: 'Implement a schema roadmap by template, starting with the pages that already attract traffic.',
    horizon: '90d', impact: 'Medium', effort: 'Medium', gated: true,
  },
  'ai.mention.rate': {
    title: 'Increase presence in AI answers',
    problem: 'Your brand is rarely named when AI assistants answer category questions.',
    whyItMatters: 'Buyers increasingly shortlist from an AI answer. Absence from the answer is absence from the shortlist.',
    action: 'Combine entity work, comparison content and third-party citation building against the specific prompts your buyers use.',
    horizon: '90d', impact: 'High', effort: 'High', gated: true,
  },
  'ai.citation.rate': {
    title: 'Earn citations in AI answers',
    problem: 'Your website is rarely cited as a source in AI answers.',
    whyItMatters: 'A citation is a link and an endorsement at the moment of decision. A mention without a citation sends the buyer to whoever was cited.',
    action: 'Publish the specific, quotable, well-attributed content formats that AI answers cite, and make sure retrieval crawlers can reach them.',
    horizon: '90d', impact: 'High', effort: 'High', gated: true,
  },
  'ai.sov.share': {
    title: 'Close the AI share-of-voice gap',
    problem: 'Competitors are named more often than you in AI answers for your category.',
    whyItMatters: 'Share of voice in AI answers is becoming the top of the funnel. Losing it compounds, because citations beget citations.',
    action: 'Target the prompts where competitors appear and you do not, and build the evidence base that makes you a defensible answer to them.',
    horizon: '90d', impact: 'High', effort: 'High', gated: true,
  },
  // --- Remaining catalogued checks ----------------------------------------
  'seo.index.canonical_tags': {
    title: 'Add self-referencing canonical tags',
    problem: 'Pages are missing a canonical URL, or point it somewhere unexpected.',
    whyItMatters: 'Without a canonical, parameters and variants of the same page compete with each other and split their ranking signals.',
    action: 'Emit a self-referencing canonical tag on every indexable page from the template, using the absolute production URL.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'seo.index.crawl_depth': {
    title: 'Bring deep pages closer to the homepage',
    problem: 'Pages sit more than three clicks from the homepage.',
    whyItMatters: 'Crawlers reach deep pages last and least often, so your newest or most commercial content can wait weeks to be indexed.',
    action: 'Add hub pages and contextual links so every commercially important page is within three clicks of the homepage.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: false,
  },
  'seo.onpage.heading_hierarchy': {
    title: 'Fix the heading hierarchy',
    problem: 'Headings skip levels, so the document outline is ambiguous.',
    whyItMatters: 'Parsers use the heading tree to work out which text belongs to which topic. A broken outline means an answer engine cannot tell where your answer starts and ends.',
    action: 'Use headings in order without skipping levels, and reserve heading tags for structure rather than styling.',
    horizon: '30d', impact: 'Low', effort: 'Low', gated: false,
  },
  'seo.onpage.image_alt': {
    title: 'Add alt text to images',
    problem: 'Images are missing alt attributes.',
    whyItMatters: 'Alt text is both an accessibility requirement and the only description of an image that a machine can read.',
    action: 'Describe what each image shows; use an empty alt attribute for purely decorative images so they are skipped deliberately.',
    horizon: '30d', impact: 'Low', effort: 'Low', gated: false,
  },
  'seo.onpage.thin_pages': {
    title: 'Consolidate or expand thin pages',
    problem: 'Several pages carry very little content.',
    whyItMatters: 'Thin pages rarely rank, dilute your topical signals, and give an answer engine nothing to extract.',
    action: 'Merge near-duplicate thin pages into one strong page, or expand each to genuinely answer the question it targets.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: true,
  },
  'seo.onpage.duplicate_content': {
    title: 'Resolve near-duplicate pages',
    problem: 'Multiple pages share most of their text.',
    whyItMatters: 'Search engines pick one version and suppress the rest, so the effort spent on the others returns nothing.',
    action: 'Consolidate duplicates behind one canonical URL, or differentiate them so each answers a distinct question.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: false,
  },
  'seo.onpage.meta_duplicates': {
    title: 'Write distinct meta descriptions',
    problem: 'Pages reuse the same meta description.',
    whyItMatters: 'A generic description is a generic search snippet, and generic snippets get fewer clicks than specific ones.',
    action: 'Write a description per page that states the specific answer or offer that page delivers.',
    horizon: '30d', impact: 'Low', effort: 'Low', gated: false,
  },
  'seo.links.anchor_quality': {
    title: 'Replace generic anchor text',
    problem: 'Links use anchors like "click here" and "read more".',
    whyItMatters: 'Anchor text tells both crawlers and readers what is on the other side of a link. Generic anchors waste that signal entirely.',
    action: 'Rewrite anchors to describe the destination in the language a customer would use to search for it.',
    horizon: '30d', impact: 'Low', effort: 'Low', gated: false,
  },
  'seo.links.orphan_risk': {
    title: 'Link to pages reachable only via the sitemap',
    problem: 'Some pages are in the sitemap but not linked from anywhere on the site.',
    whyItMatters: 'A page nothing links to receives no internal authority and signals to crawlers that you do not consider it important.',
    action: 'Add contextual links from related pages, or remove the page if it no longer earns its place.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'seo.links.outbound_references': {
    title: 'Cite your sources',
    problem: 'Your pages link out to almost no external sources.',
    whyItMatters: 'Citing primary sources is a trust signal for both search and answer engines, and it is the behaviour that gets reciprocated with citations.',
    action: 'Link to the research, standards and primary sources behind your claims, close to the claim itself.',
    horizon: '30d', impact: 'Low', effort: 'Low', gated: false,
  },
  'seo.perf.cls': {
    title: 'Stop the layout shifting while it loads',
    problem: 'Content moves around as the page loads.',
    whyItMatters: 'Layout shift causes mis-clicks and abandonment, and it is one of the Core Web Vitals used to break ties between comparable pages.',
    action: 'Reserve space for images, ads and embeds with explicit dimensions, and load fonts without a reflow.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: false,
  },
  'seo.perf.ttfb': {
    title: 'Cut server response time',
    problem: 'Your server takes too long to send the first byte.',
    whyItMatters: 'Every millisecond here delays everything after it, so this is the cheapest performance win available.',
    action: 'Add edge caching for anonymous traffic, cache expensive queries, and move static assets to a CDN.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: false,
  },
  'seo.perf.mobile_friendly': {
    title: 'Fix mobile usability problems',
    problem: 'Viewport, font size or tap-target audits are failing.',
    whyItMatters: 'Indexing is mobile-first, and most of your visitors are reading this on a phone.',
    action: 'Set a responsive viewport, keep body text at 16px or above, and give tap targets at least 48px of space.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: false,
  },
  'seo.schema.breadcrumbs': {
    title: 'Add breadcrumb markup',
    problem: 'No breadcrumb structured data was found.',
    whyItMatters: 'Breadcrumbs tell search and AI systems how your content is organised, and they replace the bare URL in search results.',
    action: 'Emit BreadcrumbList markup from your page templates, matching the visible breadcrumb trail.',
    horizon: '30d', impact: 'Low', effort: 'Low', gated: false,
  },
  'aeo.answer.definitions': {
    title: 'Write explicit definitions',
    problem: 'Your content contains few definition-style statements.',
    whyItMatters: 'Definitions are what answer engines quote for "what is" questions — the questions that introduce you to someone who has never heard of you.',
    action: 'Open each key concept with a plain "X is…" sentence before elaborating.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'aeo.answer.lists_tables': {
    title: 'Use lists and tables for structured information',
    problem: 'Information that has structure is written as running prose.',
    whyItMatters: 'Lists and tables are extracted far more reliably than paragraphs, and they are what appears in featured snippets.',
    action: 'Convert step sequences into ordered lists, and convert comparisons and specifications into tables.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'aeo.answer.semantic_html': {
    title: 'Wrap content in semantic HTML',
    problem: 'Pages do not mark where the content is versus the navigation.',
    whyItMatters: 'Without <main> or <article>, a parser has to guess which text is the page and which is the chrome, and it will sometimes guess wrong.',
    action: 'Wrap the primary content in <main> and each self-contained piece in <article>.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'aeo.answer.paragraph_length': {
    title: 'Break up the wall of text',
    problem: 'Paragraphs are far longer than readers or extractors handle well.',
    whyItMatters: 'A long paragraph contains the answer somewhere inside it, which is the same as not containing it for an engine trying to lift a clean quote.',
    action: 'Keep paragraphs to one idea, around 30 to 90 words, with the claim in the first sentence.',
    horizon: '30d', impact: 'Low', effort: 'Low', gated: false,
  },
  'aeo.eeat.trust_pages': {
    title: 'Publish proper About, contact and team pages',
    problem: 'One or more of your basic trust pages is missing.',
    whyItMatters: 'These are the pages both search raters and AI systems look for to establish that a real, accountable organisation stands behind the content.',
    action: 'Publish an About page with your history and people, a contact page with real address and phone details, and a team page with named individuals.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'aeo.eeat.freshness': {
    title: 'Refresh and re-date your content',
    problem: 'Your most recently dated content is old.',
    whyItMatters: 'Answer engines discount stale content on any question where recency matters, and most commercial questions do.',
    action: 'Review your highest-value pages on a schedule, update the substance, and update dateModified honestly when you do.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: false,
  },
  'aeo.eeat.outbound_citations': {
    title: 'Support claims with cited evidence',
    problem: 'Few pages cite an external source.',
    whyItMatters: 'Content that cites evidence is treated as more reliable, and it is the behaviour that earns citations back.',
    action: 'Attach a primary source to each factual or statistical claim, linked at the point of the claim.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'aeo.eeat.author_schema': {
    title: 'Mark up your authors',
    problem: 'Editorial pages do not declare their author in structured data.',
    whyItMatters: 'A visible byline helps readers; author markup with sameAs links is what lets a machine connect the byline to a real, verifiable person.',
    action: 'Add Person markup for each author with a bio page and sameAs links to their professional profiles.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'aeo.schema.article': {
    title: 'Add Article markup to editorial pages',
    problem: 'Blog and article pages lack Article structured data.',
    whyItMatters: 'Article markup carries the headline, author and dates that determine whether your content is treated as attributable and current.',
    action: 'Add Article or BlogPosting markup to every editorial template, including author, datePublished and dateModified.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'aeo.schema.howto': {
    title: 'Mark up your step-by-step content',
    problem: 'You publish procedural content without HowTo markup.',
    whyItMatters: 'Without it, an answer engine cannot present your process as a sequence of steps, which is exactly the format "how do I" questions get answered in.',
    action: 'Add HowTo markup to genuinely procedural pages, with each step matching a visible step on the page.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'geo.entity.category_clarity': {
    title: 'State plainly what you do',
    problem: 'Your homepage does not say what the company does in one readable sentence.',
    whyItMatters: 'If a machine cannot state your category from your homepage, it will infer one — and it will infer it from whatever language is most repeated, not from what you sell.',
    action: 'Put a plain, jargon-free sentence naming your category and customer in the H1, the meta description and your Organization description.',
    horizon: '30d', impact: 'High', effort: 'Low', gated: false,
  },
  'geo.entity.name_consistency': {
    title: 'Use one form of your brand name everywhere',
    problem: 'Your brand name appears in several different forms across the site.',
    whyItMatters: 'Entity resolution works by matching strings. Variants split the evidence about you across what look like several different organisations.',
    action: 'Pick one canonical brand string and use it identically in titles, Organization markup, Open Graph tags and your copyright line.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'geo.entity.location': {
    title: 'Declare where you operate',
    problem: 'No machine-readable address or service area is published.',
    whyItMatters: 'Location and service area are how AI systems decide whether to include you in market-specific and "near me" answers at all.',
    action: 'Add PostalAddress to your Organization markup and declare areaServed for the markets you actually serve.',
    horizon: '30d', impact: 'Medium', effort: 'Low', gated: false,
  },
  'geo.entity.products': {
    title: 'Describe what you sell in structured data',
    problem: 'Product and service pages do not declare what they offer.',
    whyItMatters: 'Product and Service markup is how an AI system knows you sell the thing a buyer is asking about, rather than merely writing about it.',
    action: 'Add Product, Service or Offer markup to each commercial page, connected by @id to your Organization node.',
    horizon: '30d', impact: 'Medium', effort: 'Medium', gated: true,
  },
  'geo.content.definitions': {
    title: 'Own the definitions in your category',
    problem: 'Your content contains few definitional statements.',
    whyItMatters: 'The source that defines a category is the source cited when anyone asks what it is — and that question comes before every purchase question.',
    action: 'Publish a glossary and open each concept page with a crisp definition worth quoting.',
    horizon: '90d', impact: 'Medium', effort: 'Medium', gated: true,
  },
  'geo.content.expert_commentary': {
    title: 'Publish attributed expert commentary',
    problem: 'No quoted or attributed expert opinion was found.',
    whyItMatters: 'Named expert opinion is what distinguishes a citable source from content anyone could have written.',
    action: 'Include quoted, attributed commentary from your named experts, marked up so the attribution is machine-readable.',
    horizon: '90d', impact: 'Medium', effort: 'Medium', gated: true,
  },
  'geo.machine.sitemap_quality': {
    title: 'Improve sitemap quality',
    problem: 'Your sitemap is missing lastmod dates or is incomplete.',
    whyItMatters: 'Accurate lastmod dates tell crawlers what changed, which is the difference between a re-crawl this week and one next month.',
    action: 'Generate the sitemap from your content store with honest lastmod values, and declare it in robots.txt.',
    horizon: '30d', impact: 'Low', effort: 'Low', gated: false,
  },
  'geo.machine.feeds': {
    title: 'Publish a content feed',
    problem: 'No RSS or Atom feed was found.',
    whyItMatters: 'Feeds give aggregators, newsreaders and crawlers a cheap, structured way to discover new content quickly.',
    action: 'Publish an RSS or Atom feed for your editorial content and link it from the document head.',
    horizon: '30d', impact: 'Low', effort: 'Low', gated: false,
  },
  'geo.machine.llms_txt': {
    title: 'Consider publishing llms.txt',
    problem: 'No llms.txt file is published.',
    whyItMatters: 'Evidence through 2026 is that major AI crawlers rarely fetch this file and no major provider has committed to reading it. Treat it as cheap, speculative upside — not a ranking factor.',
    action: 'If it costs you an hour, publish a short llms.txt pointing at your best documentation. Do not prioritise it over the entity and content work above.',
    horizon: '90d', impact: 'Low', effort: 'Low', gated: false,
  },
  'ai.mention.google_aio': {
    title: 'Compete for Google AI Overview placement',
    problem: 'Your brand rarely appears in the AI Overview for your category queries.',
    whyItMatters: 'The AI Overview sits above the organic results. Absence from it means most searchers never reach the list you do rank in.',
    action: 'Target the queries that trigger an overview with clearly structured, well-attributed answers, and earn citations on the domains those overviews already cite.',
    horizon: '90d', impact: 'High', effort: 'High', gated: true,
  },
  'ai.citation.google_aio': {
    title: 'Become a source Google AI Overviews cite',
    problem: 'Google cites other domains for your category, not yours.',
    whyItMatters: 'The cited domains are visible evidence of which sources Google trusts on your topic — and a map of exactly whose authority you need to match.',
    action: 'Work the cited-domain list directly: earn coverage on those sources and publish the specific formats they are cited for.',
    horizon: '90d', impact: 'High', effort: 'High', gated: true,
  },
  'ai.sentiment.quality': {
    title: 'Improve how AI describes your brand',
    problem: 'Where you are mentioned, the framing is neutral or negative.',
    whyItMatters: 'Being named unfavourably is worse than not being named, because the buyer now has a specific reason to look elsewhere.',
    action: 'Address the source material behind the framing — reviews, community threads and comparison pages — rather than the answer itself.',
    horizon: '90d', impact: 'Medium', effort: 'High', gated: true,
  },
};

/**
 * There is deliberately NO generic fallback.
 *
 * A recommendation like "review the evidence for geo.machine.feeds and bring
 * this signal in line" is filler. It pads the plan, tells the reader nothing,
 * and costs more credibility than the extra row buys. A check without a real
 * template simply produces no recommendation — the finding still appears in the
 * evidence list, where it belongs.
 */
export function hasTemplate(checkId: string): boolean {
  return checkId in RECOMMENDATION_CATALOG;
}
