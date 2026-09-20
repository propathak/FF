# 02 — SEO / AEO / GEO Audit Methodology

Every check below is implemented in `packages/engine/src/checks/` with the exact `id` shown.
Each check returns `{ id, status, score, weight, evidence, affectedUrls }` — nothing is asserted
without an artefact a human can re-verify.

**Status vocabulary** (used consistently across the product):

| Status | Meaning | UI bucket |
|---|---|---|
| `fail` | Signal is absent or broken and is actively costing visibility | Critical Issue |
| `warn` | Signal is present but weak, partial or inconsistent | Warning |
| `opportunity` | Signal is not broken; it's simply unexploited | Opportunity |
| `pass` | Signal is healthy | What You're Doing Well |
| `not_applicable` | Check doesn't apply to this site type | hidden |
| `unavailable` | We could not measure it (no key, API down, blocked) | shown as "not measured" |

`unavailable` never silently becomes `fail`. A site is not penalised for our missing API key.

---

## Stage 1 — Discovery (no crawl, no cost)

| Check id | What it does |
|---|---|
| `tech.https` | Scheme, TLS handshake, certificate validity window, mixed-content hints |
| `tech.redirect_chain` | Follows up to 10 hops from http/https × www/apex; flags chains >2 and loops |
| `tech.canonical_host` | Whether all four host variants resolve to one canonical host |
| `tech.robots_txt` | Presence, parse validity, accidental `Disallow: /`, sitemap directives |
| `tech.sitemap` | Presence (robots-declared + `/sitemap.xml` + index files), URL count, lastmod freshness, 404s in sample |
| `geo.ai_crawler_access` | Per-agent allow/deny for the AI user agents (see below) |
| `geo.llms_txt` | Presence and structure of `/llms.txt` — scored as an **opportunity only**, never a failure |
| `tech.status_code` | Homepage status, soft-404 detection |

**AI crawler agents checked** (grouped by what blocking them actually costs you):

| Agent | Operator | Purpose | Blocking costs you |
|---|---|---|---|
| `GPTBot` | OpenAI | Model training | Training inclusion only |
| `OAI-SearchBot` | OpenAI | ChatGPT search index | **Citations in ChatGPT search** |
| `ChatGPT-User` | OpenAI | User-initiated fetch | **Live retrieval when a user asks** |
| `ClaudeBot` | Anthropic | Training | Training inclusion only |
| `Claude-SearchBot` | Anthropic | Claude search | **Citations in Claude** |
| `Claude-User` | Anthropic | User-initiated fetch | **Live retrieval** |
| `PerplexityBot` | Perplexity | Index | **Citations in Perplexity** |
| `Perplexity-User` | Perplexity | User-initiated fetch | **Live retrieval** |
| `Google-Extended` | Google | Gemini training / grounding | Training only — **not** Search ranking |
| `CCBot` | Common Crawl | Open corpus | Downstream training datasets |

This distinction is the single most valuable free insight in the product: many sites blanket-block
everything with `User-agent: *` after a "block AI scrapers" blog post and have silently deleted
themselves from AI answers. `Google-Extended` is explicitly flagged as *not* affecting Google Search
inclusion or ranking — a point Google states directly and that most audit tools get wrong.

**Scoring asymmetry (deliberate):** blocking a *search/retrieval* agent is a `fail`. Blocking a
*training* agent is `not_applicable` — that's a legitimate business decision, not a defect, and
treating it as one would make our report feel like it has an agenda.

---

## Stage 2–3 — Crawl and parse

- BFS from the homepage, seeded by sitemap URLs when present.
- Same-registrable-domain only; max 25 pages; concurrency 5; 10s timeout; 2 MB body cap.
- Honours `robots.txt` for our own agent (`IndexJoyBot`), sends a contactable User-Agent.
- HTML only (`text/html`); PDFs, images and assets are recorded as links but not fetched.
- Client-side-rendered detection: if served HTML has `<2%` text-to-HTML ratio, near-empty `<body>`,
  and a known SPA root (`#root`, `#__next` with no children), we raise `tech.csr_dependency`
  and **label the content checks low-confidence** rather than scoring the site as empty.

Each page reduces to a typed `PageSignals` object. This is the only thing downstream stages see.

---

## SEO pillar — what is analysed

### Indexability & crawl (`seo.index.*`)
`robots_meta` (noindex/nofollow per page) · `canonical_present` · `canonical_self_consistency` ·
`canonical_cross_domain` · `crawl_depth` (pages >3 clicks from home) · `orphan_risk` ·
`status_codes` (4xx/5xx found in crawl) · `broken_internal_links` · `redirect_hops_internal`

### On-page (`seo.onpage.*`)
`title_present` · `title_length` (pixel-aware, not just char count) · `title_duplicates` ·
`meta_description_present` · `meta_description_length` · `meta_description_duplicates` ·
`h1_present` · `h1_singular` · `heading_hierarchy` (no skipped levels, H2s under H1) ·
`image_alt_coverage` · `content_length` (median words/page) · `thin_pages` (<300 words) ·
`duplicate_content_indicator` (shingled 5-gram Jaccard between crawled pages — a real
near-duplicate signal, not a guess)

### Internal linking (`seo.links.*`)
`internal_link_density` · `anchor_text_diversity` · `hub_page_presence` ·
`external_link_quality` (do they cite anyone? feeds GEO too)

### Performance (`seo.perf.*`) — PageSpeed Insights
`lcp` · `inp` · `cls` from **CrUX field data when the origin has enough traffic**, falling back to
**Lighthouse lab data** with an explicit `dataSource: 'lab'` label. `performance_score` ·
`mobile_friendly` (viewport, tap targets, font sizes from the Lighthouse audit set).

A site with no field data is *not* penalised for that — we label it "insufficient real-user data"
and score from lab, at reduced confidence weight.

### Structured data (`seo.schema.*`)
`schema_present` · `schema_valid_jsonld` (parse + required-property check against schema.org
vocabulary) · `schema_types_found` · `breadcrumb_schema`

---

## AEO pillar — what is analysed

AEO asks one question: **can a machine lift a correct, attributable answer off this page without
reading the whole page?**

### Answerability (`aeo.answer.*`)
- `question_headings` — count of H2/H3 phrased as questions (who/what/why/how/when/which/can/does/is + `?`)
- `direct_answer_proximity` — for each question heading, is the first following paragraph a
  **40–320 character self-contained declarative answer**? This is the single strongest
  featured-snippet and extraction signal, and it is mechanically checkable.
- `answer_block_ratio` — share of question headings that pass the above
- `definition_blocks` — "X is a…" / "X refers to…" patterns near an H2
- `list_and_table_density` — `<ul>/<ol>/<table>` per 1,000 words (extraction-friendly formats)
- `paragraph_length` — median sentence and paragraph length; walls of text extract badly
- `semantic_html` — use of `<main>`, `<article>`, `<section>`, `<nav>`, `<dl>`, `<figure>`

### Structured answer markup (`aeo.schema.*`)
`faq_page_schema` · `howto_schema` (only where the content is procedural — otherwise
`not_applicable`, never a penalty) · `qa_page_schema` · `article_schema` ·
`speakable_schema` (opportunity-tier) · `schema_answer_alignment` — does the FAQ schema's
`acceptedAnswer` text actually appear in the visible page body? Mismatch is a `fail`; it is
also the most common real-world FAQ-schema defect.

### Trust and provenance (`aeo.eeat.*`)
`author_byline` · `author_schema` (`Person` with `sameAs`) · `author_bio_page` ·
`organization_schema` · `about_page` · `contact_page` (with real NAP data) ·
`date_published` / `date_modified` (both in markup and visible) · `content_freshness`
(median age of dated content) · `outbound_citations` (links to primary/authoritative sources) ·
`editorial_signals` (review/fact-check/methodology pages)

### Coverage (`aeo.coverage.*`)
`intent_spread` — classifies crawled pages into informational / commercial / transactional /
navigational by URL pattern + heading language, and flags a missing tier.
`question_gap` — the generated customer-question set (below) matched against crawled content;
each unmatched question is a named opportunity.

### The question set — how 10–20 questions get generated honestly

1. **Extract the brand's actual category** from `Organization` schema, title patterns, the
   homepage H1, and the top 20 repeated noun phrases across crawled pages. This is deterministic.
2. **Generate candidates** with the LLM, constrained to that category and market, across five
   intent templates (what-is, how-to, best-for, vs/comparison, pricing/cost).
3. **Match against crawled content** with a normalised token-overlap + heading match. A question
   "already answered" needs a heading match *and* a qualifying answer block.
4. **Rank** unanswered questions by template intent value (comparison and "best for" rank highest
   — they are where purchase decisions and AI recommendations happen).

The LLM proposes; the crawl disposes. We never claim a question is unanswered without having
searched the crawled corpus for it, and the report shows which pages we searched.

---

## GEO pillar — what is analysed

GEO asks: **when an AI system tries to establish what this brand is and whether to trust it,
what does it find?**

### Entity strength (`geo.entity.*`)
- `organization_schema_completeness` — scored on the properties that actually disambiguate an
  entity: `name`, `legalName`, `url`, `logo`, `description`, `sameAs[]`, `address`,
  `foundingDate`, `founder`, `numberOfEmployees`, `contactPoint`
- `sameas_links` — count and quality of `sameAs` targets (the machine-readable identity graph)
- `name_consistency` — is the brand string identical across `<title>`, schema `name`, OG tags,
  copyright line? Inconsistency is an entity-resolution failure and is invisible to most audits.
- `category_clarity` — can the offering be stated from the homepage alone? Measured by whether a
  category noun phrase appears in H1 + meta description + schema description.
- `people_entities` — `Person` schema for founders/executives with `sameAs`
- `geo_footprint` — `PostalAddress` / `areaServed` / `GeoCoordinates` presence
- `product_service_entities` — `Product`/`Service`/`Offer` schema coverage vs. the pages that
  clearly sell something

### Citation readiness (`geo.citation.*`)
External presence, with **authority weighting** — because treating a directory listing as equal to
a Wikipedia entry is how these tools lose credibility. Weights (relative, sum-normalised):

| Tier | Sources | Weight | Rationale |
|---|---|---|---|
| 1 | Wikipedia / Wikidata entity | 1.00 | Directly consumed as ground truth by every major model's grounding layer |
| 2 | Major national/trade press, .edu/.gov mentions | 0.85 | High-authority, high-retrieval |
| 3 | Established industry publications, analyst sites | 0.70 | Category-defining citations |
| 4 | G2 / Capterra / Trustpilot / sector review platforms | 0.55 | Heavily cited in "best X" answers |
| 5 | Reddit, Quora, Stack Exchange, HN | 0.45 | Disproportionately cited by LLMs; low barrier, high value |
| 6 | LinkedIn, YouTube, GitHub, official social | 0.35 | Identity confirmation more than authority |
| 7 | Business directories, aggregators, listicles | 0.15 | Near-zero marginal trust; volume here is *not* a positive signal |

Tier 7 is capped at 5% of the citation subscore no matter how many listings exist. A brand with 400
directory listings and no Tier 1–4 presence should score *badly*, and does.

Measurement path: Wikidata/Wikipedia via free API (always on); Tiers 2–7 via SERP
`site:`-scoped and brand-name queries **only when a SERP key is configured**. Without a key, the
subscore is `unavailable` and the GEO score renormalises across the measured components, with the
UI stating exactly which components were measured.

### Content citation potential (`geo.content.*`)
What makes a passage *worth quoting*:
`original_statistics` (numeric claims with units/dates in proximity to a source) ·
`data_or_research_pages` · `expert_commentary` (quote markup, named attribution) ·
`definitions` · `comparison_content` (vs/alternatives pages — the highest-value GEO asset) ·
`proprietary_data_signals` · `quotable_passage_density` (self-contained declarative sentences
of 15–45 words with a concrete claim) · `source_citations` (do they cite primary sources?)

### Machine readability (`geo.machine.*`)
`schema_coverage_ratio` (pages with valid JSON-LD / pages crawled) ·
`entity_graph_linkage` (`@id` usage and cross-references between schema nodes — most sites emit
islands of disconnected JSON-LD, which is a real, fixable defect) · `content_in_html`
(CSR dependency) · `sitemap_quality` · `ai_crawler_access` (shared with Stage 1) ·
`feed_availability` (RSS/Atom/JSON feed) · `heading_outline_validity`

---

## AI Presence — what is analysed, and how it is labelled

This is measured in one of three modes, and **the mode is always shown on the score**:

| Mode | Trigger | What it produces | Label shown |
|---|---|---|---|
| **A — Measured** | SERP/AI provider key configured | Real brand-mention and citation counts from actual AI-surfaced answers | "Measured across N prompts on M engines" |
| **B — Partial** | SERP key only | Google AI Overview presence + citation domains for a prompt set | "Measured on Google AI Overviews only" |
| **C — Readiness estimate** | No keys | A *readiness* score derived entirely from GEO/AEO signals | **"Estimated readiness — not a measurement of AI answers"** |

In Mode C the number is never called "AI Visibility" in the UI; it is called **"AI Citation
Readiness"**. This distinction is a product requirement, not a nicety. See `06-limitations.md`.

**Mode A/B method (when keys exist):**
1. Build a 12-prompt set from the brand's category: 4 category-generic ("best X for Y"),
   4 comparison ("X vs Y"), 2 branded ("is BRAND good"), 2 problem-led ("how do I …").
2. Execute each prompt against each configured engine, 3 samples per prompt (LLM answers are
   non-deterministic; a single sample is noise, and we report the sample count).
3. Extract: brand mentioned (y/n), mention ordinal, cited domains, competitor brands mentioned,
   sentence-level sentiment of the mention.
4. **AI Share of Voice** = brand mentions ÷ total tracked-brand mentions across all samples,
   reported **with its denominator visible**: "18% — 11 of 61 brand mentions across 36 samples."

A share-of-voice number without a stated prompt set, engine list, sample count and denominator is
unfalsifiable. Ours always ships with all four.

---

## Competitor analysis

- Competitors come from (a) user input, or (b) auto-discovery: brands co-occurring in the SERP for
  the brand's own category terms (requires SERP key) — otherwise we ask the user rather than guess.
- Each competitor runs the **identical check suite**, capped at 10 pages to control cost.
- Comparison is rendered only on checks measured for *both* sides. We never compare a measured
  score against an estimated one.
- Interpretation sentences are template-driven from actual deltas, e.g.
  `seo.total − competitor.seo.total > 10 && geo.citation < competitor.geo.citation`
  → "You outperform {competitor} technically, but they have substantially stronger third-party
  authority signals."
