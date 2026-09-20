# 04 — API Research, Cost Comparison and Cost-per-Audit

## Evidence quality notice — read this first

The network egress policy in the build environment blocked direct fetches of several vendor
pricing pages (`developers.google.com`, `serpapi.com`, `serper.dev`, `dataforseo.com` all returned
`EGRESS_BLOCKED`). Figures below were gathered via web search, and **each row is tagged for source
quality**:

| Tag | Meaning |
|---|---|
| **[P]** | Primary — vendor's own documentation/pricing page appeared in results and stated the figure |
| **[S]** | Secondary — third-party aggregator or article reporting the vendor's pricing |

Every **[S]** figure must be re-verified against the vendor's pricing page before you commit
spend or publish a cost claim. Pricing on SERP and LLM APIs moved repeatedly through 2025–2026
(Brave's free tier was removed outright), so treat all of this as a snapshot dated **2026-09-20**,
not a contract. Sources are linked at the bottom.

---

## 1. Capability → API matrix

### Technical SEO & performance

| Capability | Recommended API | Free/Paid | Approx. cost | Limitation | MVP alternative |
|---|---|---|---|---|---|
| Lab performance + Lighthouse audits | **PageSpeed Insights API v5** | Free | $0 | 25,000 queries/day; 240/min; **no paid tier to raise it** **[S]** | Own Lighthouse CI on a worker (adds ~200MB + 15s/page) |
| Core Web Vitals field data | **CrUX API** | Free | $0 | 150 queries/min per GCP project, not purchasable; only origins with sufficient traffic **[P]** | Fall back to PSI lab data, labelled `lab` |
| Crawl, robots, sitemaps, HTML parse | **Own crawler** (undici + cheerio) | Free | ~$0 (egress only) | Vercel function time; no JS rendering | — (this *is* the right answer; don't pay for crawling) |
| Rendered-DOM analysis | Playwright on a worker | Free (compute) | ~$0.002/page compute | 2–4s/page, heavy | **Detect** CSR and flag it; don't render in V1 |
| Schema validation | Own JSON-LD parser + schema.org vocab | Free | $0 | No Google Rich Results parity | Google's Rich Results Test has no public API — own parser is the only option |
| Search performance (impressions, CTR, queries) | **Google Search Console API** | Free | $0 | **Requires the prospect to grant OAuth access to their property** — a non-starter pre-sale | Not in V1. Offer as the first post-sale onboarding step (excellent "day 1 value" moment). |
| Bing/IndexNow data | Bing Webmaster Tools API | Free | $0 | Same ownership-verification problem | Not in V1 |

### Search / SERP / AI Overviews

| Capability | Recommended API | Free/Paid | Approx. cost | Limitation | MVP alternative |
|---|---|---|---|---|---|
| Google SERP + AI Overview presence | **Serper.dev** | Paid, prepaid | ~$1.00/1k queries at the $50 pack, down to ~$0.30/1k at volume; 2,500 free credits, 6-month expiry; 11–100 results costs 2 credits **[S]** | Prepaid credits expire | Best price/perf for our volume — **recommended** |
| Google SERP + AI Overview (structured, deep) | **DataForSEO SERP API** | Paid, PAYG | Standard ~$0.0006/query, Priority ~$0.0012, Live ~$0.002; AI Overview async adds ~$0.0006/keyword; $50 min deposit, $1 free credit **[S]** | Queue latency on Standard tier | **Recommended for Phase 3 monitoring** (cheapest at volume, richest AIO + AI Mode data) |
| Google SERP (premium/managed) | SerpApi | Paid | Free 250/mo; $25 Starter; $75 Developer = 5,000 searches **[S]** | ~15× Serper's unit price | Use only if legal prefers their "we handle the legality" posture |
| Independent web index | Brave Search API | Paid | **Free tier removed for new users**; $5/mo credits ≈ 1,000 queries, then ~$5/1k **[S]** | No longer free | Not recommended for V1 |
| Programmable Search | Google Custom Search JSON API | Freemium | 100 queries/day free, then paid | Not the real Google SERP; no AI Overview | Not suitable |
| Open web corpus | Common Crawl | Free | $0 (+S3 egress) | Months stale; TB-scale processing | Phase 4 backlink/mention mining, not V1 |

**Recommendation: Serper for V1, DataForSEO for Phase 3.** Serper's low entry cost and free credits
make it right for bursty lead-gen traffic; DataForSEO's per-query price wins once monitoring runs
thousands of scheduled queries, and it exposes AI Mode/AI Overview endpoints explicitly.

### AI answer engines

| Capability | Recommended API | Free/Paid | Approx. cost | Limitation | MVP alternative |
|---|---|---|---|---|---|
| Google AI Overview presence & cited sources | **Serper or DataForSEO `ai_overview`** | Paid | see above | AIO is English + select countries only **[S]**; not all queries trigger it | The only reliable path — Google has no AIO API |
| Perplexity answer + citations | **Perplexity Sonar API** | Paid | Sonar ~$1/$1 per MTok; request fee ~$5/1k low-context requests; Sonar Pro ~$3/$15 **[S]** | API answers ≠ consumer app answers | Highest-fidelity AI-citation source available. Recommended for Mode A. |
| Gemini grounded answers | **Gemini API (Flash) + Google Search grounding** | Freemium | Free tier ~10 RPM / 1,500 RPD on Flash; Flash-Lite ~$0.10/$0.40 per MTok **[S]** | Free-tier inputs may be used to improve models — **do not send client data** | Good free Mode-A signal for generic category prompts |
| ChatGPT visibility | **None exists** | — | — | **No API reports what the ChatGPT consumer UI shows.** See `06-limitations.md` | Proxy only: OAI-SearchBot access + GEO signals, labelled as a proxy |
| Claude visibility | Claude API + web search tool | Paid | Model tokens + tool fee | Same proxy caveat as ChatGPT | Proxy only |
| Interpretation / question generation | **Claude** — `claude-haiku-4-5` ($1/$5 per MTok) for bulk, `claude-opus-5` ($5/$25) for headline prose | Paid | see §3 | — | Batch API is 50% off for non-interactive work |

### Authority, entity and third-party presence

| Capability | Recommended API | Free/Paid | Approx. cost | Limitation | MVP alternative |
|---|---|---|---|---|---|
| Entity existence & identity graph | **Wikidata / Wikipedia API** | Free | $0 | Requires a compliant, contactable `User-Agent` or you get a restrictive rate-limit tier; 429 + `Retry-After` on abuse **[P]** | Cache 30 days. Always on. |
| Domain authority proxy | **Open PageRank (DomCop)** | Free | $0 | 0–10 score, built from Common Crawl / Common Search; 100 domains/request; ~30k domains/month free **[S]** | The right V1 choice — free, and honest about being a proxy |
| Backlinks / referring domains | Ahrefs / Semrush / Majestic / Moz APIs | Paid | Hundreds of $/mo entry | Seat + contract restrictions; costs more than the entire rest of the stack | **Not in V1.** Say "estimated authority" and mean it. |
| Review-platform presence | SERP `site:` queries | Paid (SERP) | ~$0.001/query | Indirect | Sufficient |
| Reddit / YouTube / LinkedIn mentions | Reddit API, YouTube Data API | Free tiers | $0 within quota | Reddit's terms tightened; LinkedIn has no mention search | SERP `site:reddit.com "brand"` is cheaper and more reliable |

### Platform services

| Capability | Choice | Free/Paid | Cost | Note |
|---|---|---|---|---|
| Database | Supabase Postgres | Freemium | Free: 500MB DB, 1GB storage, pauses after 1 week idle; Pro $25/mo **[S]** | Go Pro before launch — the auto-pause would kill a live funnel |
| Hosting | Vercel | Freemium | Hobby 60s function max (no Fluid); Fluid: 300s Hobby, 800s Pro/Enterprise, 1800s beta **[S]** | Stage-checkpointing means we're not plan-locked |
| Email | Resend | Freemium | Free 3,000/mo **but 100/day**; Pro from $20/mo (50k) **[S]** | The daily cap binds first |
| Scheduling | Cal.com / Calendly | Freemium | Cal.com self-host free (~$6–12/mo VPS); hosted went closed-source April 2026, self-host relaunched as Cal.diy **[S]** | Abstracted behind one component |
| Analytics | PostHog | Freemium | Generous free event tier | — |

---

## 2. Free vs paid — the decision rule applied

| Signal | Free path (V1 default) | Paid upgrade | When paid earns its cost |
|---|---|---|---|
| Technical SEO | Own crawler + PSI + CrUX | — | Never. Paying for this is waste. |
| Performance | PSI + CrUX | — | Never. |
| Schema/AEO structure | Own parser | — | Never. |
| Entity identity | Wikidata | — | Never. |
| Domain authority | Open PageRank | Ahrefs/Moz | Only when a client pays for backlink strategy |
| Third-party citations | *unavailable* (labelled) | Serper `site:` queries | **Immediately after email capture** — ~$0.02 buys the single most persuasive slide |
| AI Overview presence | *unavailable* (labelled) | Serper/DataForSEO | Same — this is the money shot |
| AI answer sampling | Readiness estimate only | Perplexity + Gemini | For Mode A reports; ~$0.20/audit |
| Interpretation prose | Rule-based templates | Claude | Cheap enough ($0.02–0.09) to leave on always |

**The architectural expression of this:** free signals run for every anonymous visitor; paid
signals fire **after email capture**, as a second enrichment pass that visibly upgrades the report
in place. Cost is therefore incurred only on qualified leads, and the enrichment itself becomes
the reward for giving us an email.

---

## 3. Estimated API cost per audit

Assumptions: 25 pages crawled, 1 PSI call, 3 competitors at 10 pages each, 12-prompt AI set.

### Tier 0 — anonymous visitor (no email yet)

| Item | Calls | Unit | Cost |
|---|---:|---|---:|
| Crawl (own) | 55 page fetches | — | ~$0.000 (egress only) |
| PageSpeed Insights | 1 | free | $0.000 |
| CrUX | 1 | free | $0.000 |
| Wikidata | 2 | free | $0.000 |
| Open PageRank | 4 | free | $0.000 |
| Claude Haiku 4.5 — question generation + classification (~6k in / 1.5k out) | 1 | $1/$5 per MTok | $0.014 |
| Claude Opus 5 — headline prose + money-on-table (~3k in / 0.8k out) | 1 | $5/$25 per MTok | $0.035 |
| **Tier 0 total** | | | **≈ $0.05** |

### Tier 1 — after email capture (enrichment pass)

| Item | Calls | Unit | Cost |
|---|---:|---|---:|
| Serper — AI Overview presence, 12 prompts | 12 | ~$0.001 | $0.012 |
| Serper — citation discovery (`site:` × 8 tiers) | 8 | ~$0.001 | $0.008 |
| Serper — competitor co-occurrence | 4 | ~$0.001 | $0.004 |
| **Tier 1 additional** | | | **≈ $0.024** |

### Tier 2 — full Mode A (AI answer sampling)

| Item | Calls | Unit | Cost |
|---|---:|---|---:|
| Perplexity Sonar, 12 prompts × 3 samples | 36 | ~$0.005 req + tokens | $0.185 |
| Gemini Flash grounded, 12 × 3 | 36 | free tier | $0.000 |
| Claude Haiku — mention/sentiment extraction (~15k in / 3k out) | 1 | $1/$5 | $0.030 |
| **Tier 2 additional** | | | **≈ $0.22** |

### Blended monthly cost model

| Monthly audits | Email capture rate | Mode A rate | Monthly API cost |
|---:|---:|---:|---:|
| 500 | 30% | 10% | **≈ $40** |
| 2,000 | 30% | 10% | **≈ $160** |
| 10,000 | 30% | 10% | **≈ $800** |

Add fixed platform cost of roughly **$45–70/mo** (Supabase Pro $25 + Resend Pro $20 + Vercel Pro
$20 when needed). At 2,000 audits/month that is a fully loaded **~$0.11 per audit** — well inside
the range where this functions as a marketing channel rather than a cost centre.

**Cost controls implemented in V1:**
- 7-day response cache keyed by `(provider, normalised_query, market)` — re-audits and competitor
  overlap are free on the second hit.
- Per-IP and per-domain rate limiting (3 audits/domain/day) to stop cost-amplification abuse.
- Hard per-audit budget ceiling; the pipeline degrades to `unavailable` rather than overspending.
- Competitor audits capped at 10 pages and reuse the primary audit's cached SERP data.
- Claude Batch API (50% discount) for any non-interactive enrichment in Phase 3 monitoring.

---

## Sources

- [PageSpeed Insights API quota discussion](https://groups.google.com/g/pagespeed-insights-discuss/c/dB7hWmGAGsw) · [PSI API review: pricing, data, limits](https://busyless.space/seo-apis/pagespeed-insights)
- [CrUX API docs (Chrome for Developers)](https://developer.chrome.com/docs/crux/api) · [How to use the CrUX API](https://developer.chrome.com/docs/crux/guides/crux-api)
- [Serper.dev pricing 2026](https://serp.fast/tools/serper-dev) · [Serper pricing explained](https://apiserpent.com/blog/serper-pricing-credits-explained)
- [DataForSEO SERP API pricing](https://dataforseo.com/apis/serp-api/pricing) · [DataForSEO pricing explained](https://apiserpent.com/blog/dataforseo-pricing-explained) · [Scraping Google AI Overviews with DataForSEO](https://dataforseo.com/help-center/how-to-scrape-google-ai-overviews-with-serp-api) · [AI Mode overview endpoint](https://docs.dataforseo.com/v3/serp-google-ai_mode-overview/)
- [SerpApi pricing](https://serpapi.com/pricing) · [SerpApi pricing explained](https://apiserpent.com/blog/serpapi-pricing-explained) · [SerpApi: scraping Google AI Overviews](https://serpapi.com/blog/scrape-google-ai-overviews/)
- [Brave Search API pricing](https://api-dashboard.search.brave.com/documentation/pricing) · [Brave free tier removal](https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/)
- [Perplexity API pricing breakdown](https://www.cloudzero.com/blog/perplexity-api-pricing/) · [Sonar API pricing](https://costbench.com/software/ai-search-apis/perplexity-sonar-api/)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- Claude model IDs and pricing: bundled `claude-api` skill reference (Opus 5 $5/$25, Sonnet 5 $2/$10, Haiku 4.5 $1/$5 per MTok; Batch API 50% discount)
- [Open PageRank API docs](https://www.domcop.com/openpagerank/documentation) · [Open PageRank methodology](https://www.domcop.com/openpagerank/what-is-openpagerank)
- [Wikidata data access](https://www.wikidata.org/wiki/Wikidata:Data_access) · [Wikimedia API rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) · [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette)
- [Vercel function limits](https://vercel.com/docs/functions/limitations) · [Configuring max duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Supabase pricing 2026 analysis](https://uibakery.io/blog/supabase-pricing)
- [Resend account quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits) · [Resend free tier](https://resend.com/blog/new-free-tier)
- [Cal.com API and self-hosting](https://dev.to/0012303/calcom-has-a-free-api-open-source-scheduling-that-replaces-calendly-nim) · [Calendly vs Cal.com 2026](https://osalfinder.com/calendly-vs-cal-com/)
- AI crawler user agents: [AI crawlers explained (Anagram)](https://www.anagram.ai/blog/ai-crawlers-explained-gptbot-claudebot-perplexitybot-and-how-to-let-them-in-2026) · [Top AI search crawlers list (Momentic)](https://momenticmarketing.com/blog/ai-search-crawlers-bots)
- llms.txt reality check: [State of llms.txt 2026](https://presenc.ai/research/state-of-llms-txt-2026) · [The State of llms.txt (aeo.press)](https://ai.aeo.press/the-state-of-llms-txt-in-2026)
- AI share-of-voice measurement critique: [The problem with AI share of voice (Search Engine Land)](https://searchengineland.com/ai-share-of-voice-metrics-that-matter-more-479611)
