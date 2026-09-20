# 03 — Scoring Methodology

**Core rule: the LLM never produces a number.** Every score traces to deterministic checks over
observed signals. The LLM writes sentences about numbers it is given; it does not invent them.
This is enforced structurally — `scoreAudit()` has no network access and no model client in scope.

---

## 1. The unit of scoring: a Check

```ts
interface CheckResult {
  id: string;                    // stable forever, e.g. "aeo.answer.direct_answer_proximity"
  pillar: 'seo' | 'aeo' | 'geo' | 'ai';
  group: string;                 // "answer", "schema", "eeat" …
  status: 'pass'|'warn'|'fail'|'opportunity'|'not_applicable'|'unavailable';
  score: number;                 // 0..1 — graded, not binary
  weight: number;                // relative importance within its group
  confidence: number;            // 0..1 — how much we trust this measurement
  evidence: Evidence[];          // the artefacts: URLs, quoted strings, counts, API responses
  affectedUrls: string[];
}
```

Two properties matter and are unusual:

**Scores are graded, not binary.** `title_length` doesn't return pass/fail; it returns the share of
pages within the healthy range. A site with 18/20 good titles scores 0.9, not 0. Binary scoring
produces cliff-edge scores that feel arbitrary and make re-audits look random.

**Confidence is separate from score.** A lab-only performance measurement scores normally but
carries `confidence: 0.6`. Confidence reduces a check's effective weight rather than its score, so
a low-confidence measurement can't swing the headline number — and the UI can say *why*.

---

## 2. Aggregation

```
groupScore   = Σ(check.score × check.weight × check.confidence)
             ─────────────────────────────────────────────────
               Σ(check.weight × check.confidence)

pillarScore  = Σ(groupScore × groupWeight) / Σ(groupWeight)   × 100
```

`not_applicable` and `unavailable` checks are **excluded from both numerator and denominator** —
they cannot drag a score down. This is the renormalisation rule that keeps the product honest when
an API key is missing or a check doesn't fit the site type.

Every pillar carries a `coverage` figure: the share of its total possible weight that was actually
measured. Coverage below 0.7 renders a "partial measurement" badge with the list of unmeasured
groups. Below 0.5, we do not show the pillar score at all — we show "insufficient data" and say
what would be needed.

### Group weights

**SEO (100 pts internally):**
| Group | Weight | Why |
|---|---:|---|
| Indexability & crawl | 26 | If it can't be crawled and indexed, nothing else matters |
| On-page fundamentals | 24 | Titles/headings/content — the actual ranking substrate |
| Performance & mobile | 20 | Confirmed ranking factor with real user-experience impact |
| Structured data | 16 | Feeds both SEO rich results and every downstream AI surface |
| Internal linking | 14 | Distributes authority; strongly predicts crawl completeness |

**AEO (100 pts):**
| Group | Weight | Why |
|---|---:|---|
| Answerability | 34 | The defining capability — direct answer proximity is the top signal |
| Structured answer markup | 24 | FAQ/HowTo/QA schema, and schema↔body alignment |
| Trust & provenance (E-E-A-T) | 24 | Answer engines resolve *who said this* before extracting it |
| Coverage & question gap | 18 | Questions asked but unanswered = demand you don't serve |

**GEO (100 pts):**
| Group | Weight | Why |
|---|---:|---|
| Entity strength | 30 | If a model can't resolve who you are, nothing else can help |
| Citation readiness | 28 | Independent corroboration is what models actually trust |
| Content citation potential | 24 | Being quotable is the only way to get quoted |
| Machine readability | 18 | The delivery mechanism for all of the above |

**AI Presence (100 pts)** — Mode A/B only:
| Group | Weight |
|---|---:|
| Mention rate across prompt set | 40 |
| Citation rate (your domain linked) | 30 |
| Share of voice vs. tracked competitors | 20 |
| Mention sentiment & position | 10 |

---

## 3. Overall score weights — challenging your proposal

You proposed **SEO 35 / AEO 25 / GEO 25 / AI 15**. I recommend changing it, for three reasons.

**Problem 1 — the 15% AI Presence slot is the least reliable input in the model.** In Mode C it
isn't a measurement at all, and in Mode A it has real sampling variance. Giving an unreliable
input a permanent 15% of the headline number means re-runs move the score for no real-world
reason, which destroys the trend line that Phase 4's client reporting depends on.

**Problem 2 — SEO at 35% under-serves the positioning.** If SEO is the largest weight, we are an
SEO tool with AI features, and every prospect's incumbent agency can rebut us. The score should
be weighted toward the thing we claim to uniquely understand.

**Problem 3 — AEO and GEO are not equally actionable.** AEO defects are fixable in 30 days by a
content team. GEO defects (entity authority, third-party citations) take 90 days and outside help
— i.e. GEO is where our agency's value is. Weighting GEO higher is both analytically correct for
AI visibility *and* aligned with what we sell.

### Recommended weights

| Pillar | Recommended | Yours | Δ |
|---|---:|---:|---:|
| SEO | **30%** | 35% | −5 |
| AEO | **25%** | 25% | 0 |
| GEO | **30%** | 25% | +5 |
| AI Presence | **15%** | 15% | 0 |

**With a renormalisation rule that your version lacks:** when AI Presence is in Mode C
(no measurement), it is **removed from the composite entirely** and the remaining three are
renormalised to 100% (SEO 35.3 / AEO 29.4 / GEO 35.3). The report then says "Overall score
computed from 3 of 4 pillars — AI answer measurement not enabled."

This is the important design decision in the whole scoring system: **an unmeasured pillar must
not be quietly imputed into a headline number.** Every competitor tool does impute, which is why
their scores can't be reproduced.

### Sub-weighting inside "AI Presence" vs "Google Visibility"

The dashboard shows two composite roll-ups above the four pillars, because that's how buyers
think:

```
Google Visibility  = SEO × 0.65 + AEO × 0.35
AI Visibility      = GEO × 0.60 + AEO × 0.25 + AI Presence × 0.15    (Mode A/B)
                   = GEO × 0.70 + AEO × 0.30                          (Mode C)
```

AEO appears in both deliberately — answer-structured content serves featured snippets and AI
answers simultaneously. That overlap is real, and saying so is more credible than pretending the
pillars are orthogonal.

---

## 4. Score bands

| Band | Range | Label | Report tone |
|---|---|---|---|
| A | 85–100 | Highly visible | "Defend and extend" |
| B | 70–84 | Competitive | "Close specific gaps" |
| C | 55–69 | At risk | "Structural work needed" |
| D | 35–54 | Largely invisible | "Your competitors are being found instead of you" |
| E | 0–34 | Effectively absent | "AI systems cannot reliably describe or verify your brand" |

Bands are stated alongside the number because a bare "47" means nothing to a CMO.

---

## 5. Why this is defensible under scrutiny

The `/methodology` page publishes: every check id, its weight, its pass criteria, and its data
source. A prospect's existing SEO agency *will* try to discredit the report — that is a predictable
event in the sales cycle, and the correct counter is total transparency plus per-check evidence.
A report that survives a hostile technical review closes the deal by itself.

Reproducibility guarantees:
- `scoring_version` is stamped on every audit row. Changing weights creates a new version;
  historical audits keep their original scores and the trend chart marks the version boundary.
- The same crawl input produces the same score, always — no sampling, no model calls, no time
  dependence in the deterministic pillars.
- Mode A AI Presence figures always carry `sampleCount`, `promptSet` and `engines` in the payload
  and in the PDF.

---

## 6. What the LLM is and is not allowed to do

| Allowed | Not allowed |
|---|---|
| Rewrite a finding into business language | Decide whether the finding is a fail |
| Generate candidate customer questions | Decide whether a question is answered (crawl match does) |
| Summarise a competitor delta in one sentence | Compute the delta |
| Classify a mention's sentiment (Mode A) | Count the mentions |
| Draft recommendation copy | Assign Impact or Effort labels (rule-mapped) |

Implementation: `packages/engine/src/scoring/` has no model client import, and a unit test asserts
the scoring module's dependency graph contains no network module. The guardrail is testable, not
aspirational.

---

## 7. Lead scoring (agency-side)

Computed at audit completion, stored on the lead row, and used to sort the admin table.

```
opportunitySize = log10(max(pagesDiscovered, 10)) / 3          // 10→0.33, 1k→1.0  (capped)
painLevel       = (100 − overallScore) / 100
brandEquity     = normalise(openPageRank, 0..10) × 0.6
                + (hasWikidataEntity ? 0.25 : 0)
                + (tier1to3CitationCount > 0 ? 0.15 : 0)
intentSignal    = (competitorsProvided ? 0.25 : 0)
                + (workEmailDomain === auditedDomain ? 0.45 : 0)   // strongest single signal
                + (budgetProvided ? 0.30 : 0)

leadScore = 100 × (0.30·opportunitySize + 0.30·painLevel
                 + 0.25·brandEquity + 0.15·intentSignal)
```

| Grade | Score | Meaning |
|---|---|---|
| A | ≥70 | Large site, poor visibility, real brand equity, matching work email. Call today. |
| B | 55–69 | Strong fit, one weak dimension |
| C | 40–54 | Worth a nurture sequence |
| D | <40 | Small site or competitor/agency recon |

`workEmailDomain === auditedDomain` is weighted highest because it separates an actual stakeholder
from an agency doing competitive research on someone else's site — the difference between a lead
and a lurker. Free-mail domains (gmail/outlook/yahoo/…) score 0 on that term and are flagged in
the admin table.
