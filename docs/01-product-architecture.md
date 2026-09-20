# 01 — Product Architecture

> Product name: **Index Joy**. Repository is `FF`.
> Positioning: *"Find out how visible your brand is across Google and AI — and what is stopping customers from finding you."*

---

## 1. What this product actually is

It is a **lead-generation instrument disguised as a diagnostic tool**. Every architectural decision
below is subordinate to one job: make a marketing decision-maker feel a specific, evidenced gap
between their brand and their competitors inside AI answers, then make booking a call the obvious
next action.

That implies three non-obvious constraints:

1. **Trust is the conversion mechanism, not the score.** A score a prospect can't verify is a score
   they discount. Every number must be traceable to a check they can see us run. This is why the
   scoring engine is deterministic and the LLM never assigns a number (see `03-scoring-methodology.md`).
2. **Time-to-first-insight is the funnel.** If the audit takes 90 seconds with nothing on screen,
   most visitors leave. The pipeline is therefore **staged and streamed** — partial results render
   as each stage completes.
3. **Cost per audit is a marketing cost, not a COGS.** Every anonymous visitor runs an audit. At
   1,000 audits/month, a $0.40 audit is $400/mo of ad spend equivalent; a $4.00 audit is $4,000.
   The free tier must be near-zero marginal cost. Paid APIs are gated behind email capture.

## 2. System architecture

```
                         ┌──────────────────────────────────────┐
  Browser                │  Next.js (App Router) on Vercel      │
  ──────                 │                                      │
  Landing form ─POST────►│  /api/audits          (create)       │
                         │       │                              │
  Poll / SSE  ◄──GET─────│  /api/audits/[id]     (read)         │
                         │       │                              │
  Lead form  ──POST─────►│  /api/leads           (capture)      │
                         └───────┼──────────────────────────────┘
                                 │ enqueue
                                 ▼
             ┌───────────────────────────────────────────────────┐
             │  AUDIT PIPELINE  (packages/engine — no framework)  │
             │                                                   │
             │  Stage 1  discovery    robots.txt, sitemap.xml,    │
             │                        llms.txt, DNS/TLS, redirects│
             │  Stage 2  crawl        BFS ≤25 pages, HTML only    │
             │  Stage 3  parse        DOM → PageSignals (typed)   │
             │  Stage 4  enrich       PSI/CrUX, Wikidata, SERP*   │
             │  Stage 5  analyse      41 deterministic checks      │
             │  Stage 6  score        weighted, explainable        │
             │  Stage 7  interpret    LLM: prose + question gen*   │
             │  Stage 8  recommend    rule-mapped actions          │
             └───────────────────────┬───────────────────────────┘
                                     │
                       ┌─────────────▼─────────────┐
                       │  Postgres (Supabase)      │
                       │  audits, findings, leads  │
                       │  + response cache (7d)    │
                       └───────────────────────────┘
                       * = feature-flagged / paid path
```

### The hard rule on LLM usage

**No raw page HTML is ever sent to an LLM.** Stage 3 reduces each page to a `PageSignals` object
(~2 KB of typed JSON: title, headings tree, word counts, schema types, question-sentence list,
entity mentions). Stage 7 receives the *aggregate* signal object plus the *already-computed* scores,
and is asked only to do what a deterministic system is bad at: write business-language prose, and
generate plausible customer questions for the brand's category.

Practical effect: a 25-page crawl costs roughly 6–10K input tokens at the LLM boundary instead of
1–2M. See cost math in `04-api-research.md`.

### Modularity boundary

`packages/engine/` imports **nothing from Next.js**. It is a pure TypeScript library with an
injected `Fetcher` and `Clock`. Consequences:

- The same engine runs in a Vercel function today, and in a long-running Node/Railway worker or a
  cron job in Phase 3, with no rewrite.
- Every analyzer is a `Check` object with a stable `id`, so scores stay comparable across releases
  and historical trend lines don't break when we add checks (new checks are versioned into
  `scoring_version`).
- Adding a pillar (e.g. "AI Reputation" in Phase 4) is adding a directory, not a refactor.

## 3. Exact MVP (V1) feature list

**In V1 — built now:**

| # | Feature | Notes |
|---|---|---|
| 1 | Single-input landing page (URL + work email, optional competitors + market) | Email not required to *see* results |
| 2 | Discovery stage: robots.txt, sitemap, llms.txt, AI-crawler directives, HTTPS/TLS, redirect chain, www/non-www canonicalisation | Zero API cost |
| 3 | Polite BFS crawler, ≤25 pages, respects robots.txt, concurrency 5, 10s/page timeout | Zero API cost |
| 4 | 41 deterministic checks across SEO / AEO / GEO | See `02-audit-methodology.md` |
| 5 | PageSpeed Insights: CWV field data + Lighthouse lab, mobile strategy | Free, 25k/day |
| 6 | Deterministic, explainable scoring with per-check evidence | See `03-scoring-methodology.md` |
| 7 | Overall + SEO + AEO + GEO score rings, confidence labels | |
| 8 | Issue cards: Critical / Warning / Opportunity / Doing Well | |
| 9 | "Money left on the table" — business-language translation of top findings | Rule-mapped, LLM-polished |
| 10 | Competitor comparison for user-supplied competitors (same engine, same checks) | Cheap: crawl-only, capped at 3 |
| 11 | Recommendation engine: Fix Immediately / 30 Days / 90 Days with Impact+Effort | Rule-mapped from failed checks |
| 12 | Gated section: blurred 90-day roadmap + lead form + Calendly/Cal.com embed | |
| 13 | Historical audit storage + score trend | Table + query ready, chart in Phase 2 |
| 14 | Admin lead list with CRM statuses + auto lead scoring | Minimal but functional |

**In V1 behind a flag (off by default, on once keys exist):**

| Feature | Flag | Why flagged |
|---|---|---|
| SERP + AI Overview presence via Serper/DataForSEO | `SERP_PROVIDER` | Paid per query |
| Perplexity / Gemini / Claude answer sampling | `AI_ANSWER_PROVIDERS` | Paid; see limitations doc |
| LLM prose + question generation | `ANTHROPIC_API_KEY` | Degrades to rule-based templates if absent |
| Wikidata/Wikipedia entity lookup | on by default | Free, but rate-limited; cached 30d |

**Explicitly NOT in V1 (see §5 for reasoning).**

## 4. User journey

```
 (1) Landing                  Enter URL + work email. Optional: 3 competitors, market.
      │                       CTA: "Check My Visibility". No signup. No card.
      ▼
 (2) Live audit screen        Stage-by-stage progress with real findings appearing:
      │                       "Crawled 18 pages" → "Found 3 critical issues" → scores.
      │                       Median 35–55s. Nothing is a spinner-only wait.
      ▼
 (3) Overall score            One number, one sentence. "You score 47/100. Your brand is
      │                       hard for AI answer engines to verify."
      ▼
 (4) Pillar rings             SEO 68 · AEO 41 · GEO 32. Each expandable with evidence.
      │                       Confidence badge on any estimated figure.
      ▼
 (5) Problems                 Top 5 critical issues, business language first, technical
      │                       detail in a disclosure.
      ▼
 (6) Missed opportunities     "12 questions your customers ask that your site never answers."
      │                       Shows 4 of them. The other 8 are gated.
      ▼
 (7) Competitor comparison    Table + bar chart. One sharp sentence of interpretation.
      │
      ▼
 (8) Free recommendations     5 actions with Impact/Effort labels.
      │
      ▼
 (9) BLURRED ROADMAP          90-day plan, keyword map, schema plan, authority strategy.
      │                       CTA: "Unlock Your 90-Day Search + AI Visibility Roadmap"
      ▼
 (10) Lead form               Name, Company, Designation, Email (pre-filled), Phone?, Budget?
      │
      ▼
 (11) Unlock + Book           Roadmap revealed + PDF download + Calendly embed:
                              "Book a Free 30-Minute Visibility Strategy Session"
```

The emotional beat we are engineering is at **(4) → (7)**: a low GEO score is meaningless alone,
but "you 32 / competitor 71" with named evidence is a gut-punch. That is why competitor comparison
is V1 and not V2 despite the extra crawl cost.

## 5. What should NOT be built in V1 — and why

| Not building | Why not |
|---|---|
| **A "your ChatGPT ranking" number** | There is no API that reports what ChatGPT's consumer UI shows. Any number would be fabricated. See `06-limitations.md`. This is the single most important omission — competitors fake it and it is the fastest way to lose a technically-literate prospect. |
| **Backlink graph / referring domains** | Ahrefs/Majestic/Semrush API access starts in the hundreds of $/mo and is per-seat-restricted. V1 uses Open PageRank (free) as a coarse authority proxy and says so. |
| **Headless-browser rendering (Playwright)** | ~2–4s and ~300MB per page; breaks Vercel function limits; 10× the cost. V1 parses served HTML and *detects* client-side-rendered sites, flagging them as a finding rather than pretending to render them. |
| **User accounts / auth** | Adds friction before the value is shown. Audits are keyed by an unguessable ID. Auth arrives in Phase 4 when there is a dashboard worth logging into. |
| **Payments** | Nothing is sold yet. The product IS the funnel. |
| **Continuous monitoring / scheduling** | Phase 3. Requires a durable worker and a cost model per tracked prompt. |
| **Automated fixes / schema generation** | Phase 4. Writing to a client's site is a trust and liability surface we don't need yet. |
| **Multi-language / non-English AEO analysis** | Question-detection heuristics are English-tuned. Market selection only affects SERP geo params in V1. |
| **PDF generation server-side at scale** | V1 ships print-optimised CSS + `window.print()` → "Save as PDF". A real PDF renderer is Phase 2. |
| **White-labelling** | Phase 4. |

## 6. Tech stack decision (and where I diverge from your default)

| Layer | Choice | Divergence / reasoning |
|---|---|---|
| Frontend | Next.js 15 App Router, React 19, TypeScript | As proposed. |
| Styling | Tailwind CSS v4 + hand-rolled primitives in shadcn idiom | **Diverges slightly.** shadcn/ui is copy-paste source anyway; for ~10 components the CLI + Radix dependency tree isn't worth it in V1. The components live in `src/components/ui/` in the same shape, so `npx shadcn add` remains compatible later. |
| Backend | Next.js Route Handlers | As proposed, with a caveat: audits run via `after()` (background work post-response) and the pipeline is checkpointed per stage so a timeout resumes rather than restarts. |
| Long jobs | Stage-checkpointed DB job rows | **Diverges.** Vercel functions max out at 60s on Hobby without Fluid compute, 800s Pro / 1800s beta with it ([Vercel limits](https://vercel.com/docs/functions/limitations)). Rather than depend on a plan tier, each stage is independently resumable. Phase 3 swaps the trigger for a real queue without touching the engine. |
| Database | Postgres via Supabase | As proposed. Free tier: 500 MB DB, 1 GB storage, projects pause after a week idle ([pricing](https://supabase.com/pricing)) — fine for V1, budget $25/mo Pro before launch traffic. |
| Auth | Deferred (Supabase Auth in Phase 4) | See §5. |
| Crawler | In-process Node (undici `fetch` + `cheerio`) | **Diverges from "Node/Python service".** A separate service is operational overhead V1 doesn't earn. The engine is already service-shaped; extract it when concurrency demands it. |
| LLM | Claude (`claude-opus-5` for prose, `claude-haiku-4-5` for bulk classification) | Interpretation only, never scoring. Batch API is 50% off for non-interactive work. |
| Email | Resend | Free: 3,000/mo but **capped at 100/day** ([Resend](https://resend.com/pricing)) — the daily cap is the real constraint; Pro $20/mo before any campaign. |
| Scheduling | Cal.com embed, Calendly-compatible | **Diverges.** Note Cal.com's hosted product moved closed-source in April 2026 with self-hosting relaunched as Cal.diy; the embed is abstracted behind one component so Calendly is a one-line swap. |
| Analytics | PostHog | As proposed. Funnel events are specified in `07-roadmap.md`. |
| Deployment | Vercel | As proposed. |

## 7. Page / wireframe structure

```
/                         Landing
  ├─ Hero            H1 + single input card (URL, email, optional expander)
  ├─ Proof strip     "Analysing 41 signals across Google & AI answer engines"
  ├─ What we check   3 columns: SEO / AEO / GEO — icon, 1 line, 4 bullets
  ├─ Sample teaser   Blurred screenshot of a real report
  └─ FAQ             "Can you really measure ChatGPT?" ← answered honestly. Trust play.

/audit/[id]               Live + final report (same route, state-driven)
  ├─ StageProgress   8 stages, ticks as they complete, findings stream in
  ├─ ScoreHeader     Overall ring + 1-sentence verdict + domain + date
  ├─ PillarGrid      SEO / AEO / GEO / AI Presence cards with rings + confidence
  ├─ MoneyOnTable    3–5 business-language cards (the emotional centre)
  ├─ IssueSections   Critical / Warnings / Opportunities / Doing Well (accordion)
  ├─ QuestionGap     "Questions you don't answer" — 4 shown, N locked
  ├─ CompetitorTable Brand vs competitors across 4 pillars + interpretation line
  ├─ Recommendations Fix Now / 30 Days / 90 Days, Impact+Effort chips
  ├─ LockedRoadmap   Blurred content + unlock CTA → LeadDialog
  └─ ReportActions   Download PDF · Email me this · Share · Re-run

/admin                    Agency dashboard (password-gated in V1)
  ├─ LeadTable       Company, site, email, 4 scores, lead grade, date, status
  ├─ StatusSelect    New Lead → Contacted → Meeting Booked → Proposal Sent → Client / Lost
  └─ Filters         Grade, status, date, score range

/methodology              Public. How every score is computed. Trust asset + SEO asset.
```

## 8. Lead-generation strategy

**Superseded — the product now captures identity at sign-in instead of gating the report.**
A person signs in with Google before running an audit, then sees the complete report. The
earlier design blurred the roadmap behind a second form; asking the same person for the same
thing twice was friction that bought almost nothing, and a report that can be verified in full
converts better than one that withholds half of itself. Every sign-in and every audit is
appended to a Google Sheet. See `docs/09-signin-and-sheet.md`.

The historical free/gated split is kept below for the record.

| Free (no email) | Free (after email) | Sales call only |
|---|---|---|
| All 4 scores | Full question gap list | 90-day roadmap detail |
| Top 5 critical issues | Full issue list | Keyword opportunity map |
| Top 5 opportunities | PDF report | Competitor gap analysis |
| Basic competitor comparison | Score history | Content architecture |
| Doing-well list | Re-run audit | Schema implementation plan |
| | | Authority/citation strategy |

**Lead scoring (automatic, in V1):** grade A–D from
`site_size × (100 − overall_score) × brand_authority × market_signal`.
The high-value pattern you named — *large site + poor visibility + strong brand authority* — is
exactly the A-grade formula: they have budget, a real problem, and enough existing equity that our
work compounds fast. Formula in `03-scoring-methodology.md` §7.

**Distribution loops built into V1:**
- Shareable report URL (unguessable but public) — the report itself is the marketing.
- Discreet agency branding in the report footer and PDF header.
- `/methodology` is a genuinely useful public page that earns links — we eat our own AEO dog food.

## 9. What is realistically buildable in V1

Everything in §3's "In V1" table is implemented in this repository and runs with **zero paid API
keys** (PSI works without a key at lower quota; an unkeyed run degrades gracefully). The flagged
features are wired, typed, and tested against fixtures, but return `unavailable` with an honest
UI label until keys are present. That is deliberate: the product must be demoable and truthful on
day one, and must not silently invent data when a key is missing.
