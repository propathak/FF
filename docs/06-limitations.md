# 06 — Technical Limitations (especially AI answer-engine visibility)

This document exists because the limitations here are the product's main **credibility asset**.
Every competitor in this category sells a "ChatGPT ranking" number. Publishing exactly what can
and cannot be measured is how we win the technically-literate buyer — and that buyer is usually
the one who signs.

---

## 1. The central limitation: there is no ChatGPT visibility API

**What does not exist:** any API, from OpenAI or anyone else, that reports what the ChatGPT
consumer application shows a given user for a given prompt. Nothing in the OpenAI API surface
exposes ChatGPT's retrieval set, its ranking, or its citation choices.

**Why the obvious workarounds are not equivalent:**

| Workaround | Why it isn't the same thing |
|---|---|
| Call the OpenAI API with web search enabled | Different model configuration, different system prompt, different retrieval stack, different personalisation than the consumer product |
| Scrape the ChatGPT web UI | Against OpenAI's terms; also unstable, geo-skewed, and account-personalised |
| Ask ChatGPT "do you know brand X?" | Measures training-data recall, not answer-surface visibility. These are different phenomena and conflating them is the most common error in the category. |

**Compounding factors that apply to every LLM answer surface:**

1. **Non-determinism.** The same prompt returns materially different answers across runs. Any
   single-sample measurement is noise. We take 3 samples minimum and always report the count.
2. **No denominator.** Traditional share of voice works because the keyword universe is
   enumerable. The prompt universe is effectively infinite, so "share of voice" is entirely a
   function of the prompt set someone chose. A percentage without its prompt set is unfalsifiable.
3. **Personalisation and memory.** Consumer AI products condition on account history, location
   and prior turns. There is no "the" answer to measure.
4. **Model churn.** Answers change with model updates on a cadence nobody outside the labs
   controls, so time series have step-changes that are not caused by anything the client did.
5. **API ≠ product.** Even where an API exists (Perplexity Sonar), the API's answer is not
   guaranteed to match what the consumer app shows.

**What we therefore do:**

- We **never** produce a "ChatGPT ranking" or "ChatGPT visibility score".
- Where we sample answers via an API, we say which API, which prompts, how many samples, and
  when — the four things that make the number checkable.
- Where we cannot measure, we report **AI Citation Readiness**, explicitly defined in the UI as a
  prediction of citability from on-site and entity signals, *not* an observation of AI answers.
- The FAQ on the landing page answers "Can you really measure ChatGPT?" with this, honestly.
  Volunteering the limitation before the prospect finds it converts better than hiding it.

**What *is* genuinely measurable, and is worth real money:**

| Measurable | How | Confidence |
|---|---|---|
| Google AI Overview presence and its cited domains | SERP APIs parse AIO blocks | High |
| Perplexity's answer and citations for a prompt set | Sonar API returns citations | High (API surface) |
| Whether AI retrieval crawlers are allowed to fetch you | robots.txt parse | Certain |
| Whether your entity is machine-resolvable | Schema + Wikidata | Certain |
| Whether your content is structurally extractable | Deterministic parse | Certain |
| Whether independent sources corroborate you | SERP `site:` queries | High |

Four of those six are free and certain. The honest product is *stronger* than the dishonest one,
because the certain signals are also the ones the client can act on.

---

## 2. Crawl limitations

| Limitation | Effect | Mitigation |
|---|---|---|
| No JavaScript rendering in V1 | SPA content invisible to our parser | Detect CSR, flag `tech.csr_dependency`, drop content-check confidence to 0.4, and **tell the user** the content checks are limited. Note: this is also a genuine finding — a site invisible to our parser is likely invisible to several AI crawlers too. |
| 25-page cap | Large sites sampled, not audited | Sitemap-weighted sampling (home + top-level + deepest sitemap entries), and the report says "sampled 25 of 4,120 URLs" |
| Rate limiting / WAF / Cloudflare challenges | Partial or failed crawl | Respectful concurrency, exponential backoff, contactable UA; on block we report `unavailable`, never a fake score |
| robots.txt disallows us | Legitimate no-crawl | We honour it and report that we honoured it |
| Serverless time limits | Long crawls die | Stage checkpointing; resume from last complete stage |

## 3. Measurement limitations by signal

| Signal | Limitation |
|---|---|
| Core Web Vitals | Field data needs sufficient origin traffic; small sites get lab data only, labelled `lab`, confidence 0.6 |
| Domain authority | Open PageRank is a Common Crawl-derived proxy, not Ahrefs DR. Labelled "authority proxy (Open PageRank)" everywhere it appears. |
| Backlinks | Not measured in V1. We say "not measured" rather than estimating. |
| Duplicate content | Detected within the crawled sample only; cross-domain duplication is not detected |
| Topical authority | Approximated from internal entity/topic co-occurrence, not from a link graph. Labelled as an on-site measure. |
| Sentiment of AI mentions | Model-classified; ±1 category error rate is real. Reported as a coarse three-band label, never a decimal. |
| llms.txt | Scored as an **opportunity only**. Evidence in 2026 is that major AI crawlers overwhelmingly do not fetch it and no major provider has committed to reading it. Penalising a site for its absence would be inventing a ranking factor — we flag it as cheap upside and say the evidence is weak. |
| Google-Extended | Blocking it does **not** affect Google Search inclusion or ranking, per Google. We do not score it as an SEO failure. |

## 4. Legal and ToS constraints

- We crawl only what `robots.txt` permits for our own agent, with a contactable User-Agent.
- We do not scrape AI consumer UIs. Only official APIs and licensed SERP providers.
- SERP data is obtained through providers who represent that they handle collection legality;
  we do not scrape Google directly.
- Wikimedia's User-Agent policy is followed (contact URL + email in the UA string) — non-compliant
  agents get bucketed into a restrictive rate-limit tier.
- No client data is sent to any free-tier LLM endpoint whose terms permit training on inputs.

## 5. What we will tell a prospect who asks "is this accurate?"

> "Four of the scores are measurements you can reproduce yourself — we show the evidence for every
> one. The AI answer figures are samples from named APIs with the prompt set and sample count
> printed on the report. Where we can't measure something, the report says 'not measured' instead
> of guessing. If any tool gives you a ChatGPT ranking number, ask them which API produced it —
> there isn't one."

That paragraph is the sales asset. It is also simply true, which is why it works.
