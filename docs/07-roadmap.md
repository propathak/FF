# 07 — Phased Development Plan

## Phase 1 — Free Audit MVP  ← **implemented in this repository**

**Goal:** a stranger enters a URL and, under a minute later, believes we understand their
visibility problem better than their current agency.

| Deliverable | Status |
|---|---|
| Landing page with a single dominant input; the typed URL survives sign-in | ✅ |
| Stage-checkpointed audit pipeline (8 stages) | ✅ |
| Polite crawler (robots-aware, ≤25 pages, concurrency-limited) | ✅ |
| 41 deterministic checks across SEO / AEO / GEO | ✅ |
| PageSpeed Insights + CrUX integration with lab/field labelling | ✅ |
| Deterministic explainable scoring + coverage + confidence | ✅ |
| Live progress UI with findings streaming in | ✅ |
| Score rings, pillar cards, issue cards, doing-well list | ✅ |
| Money-left-on-the-table translation layer | ✅ |
| Competitor comparison (user-supplied, same engine) | ✅ |
| Recommendation engine (Now / 30d / 90d, Impact+Effort) | ✅ |
| Google sign-in + Google Sheet logging + automatic lead grading | ✅ (replaced the gated lead form) |
| Postgres schema + repository layer (in-memory fallback for local dev) | ✅ |
| Public `/methodology` page | ✅ |
| Minimal admin lead table with CRM statuses | ✅ |
| LLM interpretation layer (degrades to templates without a key) | ✅ |
| SERP / AI-answer adapters, feature-flagged and honestly labelled | ✅ |

**Exit criteria:** p50 audit ≤60s; zero fabricated numbers; a hostile technical reviewer can
reproduce every score from the evidence shown.

---

## Phase 2 — Lead Generation + Reports  (≈2–3 weeks)

| Work | Why |
|---|---|
| Server-side PDF generation (Playwright → PDF on a worker) with agency branding | The shareable artefact is the viral loop |
| Resend transactional flows: report delivery, 3-day nudge, "your score changed" | Email capture is worthless without a sequence |
| Cal.com/Calendly booking embed + webhook → `appointments` | Close the loop from report to meeting |
| PostHog funnel instrumentation | `audit_started → stage_complete → score_viewed → scroll_to_locked → lead_submitted → booking_completed` |
| SERP enrichment turned on post-email-capture | ~$0.024/qualified lead for the most persuasive data in the report |
| Admin dashboard v2: filters, notes, CSV export, lead-grade explanations | Sales usability |
| Abuse controls: per-IP + per-domain rate limits, disposable-email detection | Cost protection |
| Share-token public report pages with OG images | Distribution |

**Exit criteria:** ≥25% of completed audits submit the lead form; ≥8% book a call.

---

## Phase 3 — AI Visibility Monitoring  (≈4–6 weeks)

| Work | Why |
|---|---|
| Durable job queue (Inngest or pg-boss) + dedicated worker | Scheduled work can't live in request handlers |
| Prompt tracking: persisted prompt sets per brand, scheduled weekly | The actual recurring-revenue product |
| Multi-engine sampling (Perplexity, Gemini grounded, Google AIO) with sample-count reporting | Mode A at scale |
| Citation tracking: which domains get cited for the client's prompts over time | Shows *who* is winning the answer, not just that you're losing |
| Competitor monitoring + AI Share of Voice time series | The metric clients renew for |
| LLM crawler log analysis (upload or log-drain integration) | Direct evidence of AI bots fetching the site — the most under-served signal in the market |
| Alerting: "you lost your AI Overview citation for prompt X" | Drives logins |
| DataForSEO migration for SERP at volume | Unit economics |

**Exit criteria:** weekly monitoring runs for 10 paying brands at <$15/brand/month API cost.

---

## Phase 4 — SaaS Dashboard  (≈6–10 weeks)

| Work | Why |
|---|---|
| Supabase Auth, organisations, roles, invitations | Multi-user access |
| Client-facing dashboard with the `47 → 58 → 69 → 82` trend | The retention surface |
| Google Search Console OAuth integration | Real query/impression data, post-sale |
| Automated schema generation (JSON-LD proposals + copy-paste blocks) | High-value, low-risk automation |
| Content recommendations tied to unanswered questions | Productises the agency's own workflow |
| White-labelling: custom domain, logo, palette per agency | Opens an agency-reseller channel |
| Stripe / Razorpay billing with usage metering | Monetisation |
| Public API + webhooks | Enterprise requirement |

**Exit criteria:** an agency other than ours runs client reporting on it without our involvement.

---

## Sequencing risk — what would make me reorder this

If Phase 1 converts well but Phase 2's booking rate is low, **do not start Phase 3.** Low booking
means the report's emotional payload is wrong, not that it lacks monitoring features. The fix
would be in the money-on-table copy and competitor framing — a one-week iteration, not a
six-week build. Monitoring is a retention feature; building it before acquisition works is the
classic way this category of product dies.
