import type {
  BusinessTranslation, CheckResult, CompetitorSummary, PillarScore, QuestionGap, Recommendation,
} from '../types';
import { RECOMMENDATION_CATALOG } from './catalog';
import { rankFindings } from '../scoring/score';
import { plural } from '../util/text';

/**
 * Turns ranked findings into an action plan.
 *
 * Ordering comes from `rankFindings`, i.e. from how much headline score each
 * fix actually recovers — so "Fix Immediately" is a claim we can defend, not a
 * severity label copied off the check.
 */
export function buildRecommendations(
  checks: CheckResult[],
  pillars: PillarScore[],
): Recommendation[] {
  const ranked = rankFindings(checks, pillars);
  const seen = new Set<string>();
  const out: Recommendation[] = [];

  for (const check of ranked) {
    if (seen.has(check.id)) continue;
    seen.add(check.id);

    // No template means no recommendation. See the note in catalog.ts — a
    // padded plan reads as filler and costs more trust than it buys.
    const template = RECOMMENDATION_CATALOG[check.id];
    if (!template) continue;

    // A failing check is always urgent relative to its own template, and an
    // opportunity is never urgent — the horizon follows the observed status.
    const horizon =
      check.status === 'fail' && template.horizon === '30d'
        ? 'now'
        : check.status === 'opportunity' && template.horizon === 'now'
          ? '30d'
          : template.horizon;

    out.push({
      id: `rec.${check.id}`,
      checkId: check.id,
      pillar: check.pillar,
      horizon,
      title: template.title,
      problem: check.summary || template.problem,
      whyItMatters: template.whyItMatters,
      action: template.action,
      impact: template.impact,
      effort: template.effort,
      // Nothing urgent is ever gated. A prospect must always be able to act on
      // what is actively hurting them — that is what earns the trust the gate
      // then converts. Gating applies to strategy, never to an emergency.
      gated: horizon === 'now' ? false : template.gated,
    });
  }

  // Cap each horizon so the plan stays executable rather than exhaustive.
  const limits: Record<Recommendation['horizon'], number> = { now: 6, '30d': 8, '90d': 8 };
  const counted: Record<string, number> = { now: 0, '30d': 0, '90d': 0 };
  return out.filter((rec) => {
    const n = (counted[rec.horizon] ?? 0) + 1;
    counted[rec.horizon] = n;
    return n <= limits[rec.horizon];
  });
}

/**
 * "Money left on the table" — the same findings, restated as business
 * consequences. These templates are the deterministic baseline; when an LLM key
 * is present the model rewrites the `business` copy (and only that copy).
 */
const TRANSLATIONS: Record<string, { headline: string; business: string; severity: BusinessTranslation['severity'] }> = {
  'geo.machine.ai_crawler_access': {
    headline: 'AI assistants are locked out of your website',
    business: 'The crawlers that fetch pages to cite in AI answers cannot read your site. When a customer asks an AI assistant about your category, your website is not even eligible to be part of the answer.',
    severity: 'critical',
  },
  'aeo.schema.faq': {
    headline: 'Search and AI systems struggle to extract answers from your pages',
    business: 'Your pages contain answers, but not in a form a machine can lift with confidence. Competitors who structure the same information get quoted instead, and the customer never sees your name.',
    severity: 'critical',
  },
  'aeo.answer.direct_answer_proximity': {
    headline: 'Your answers are buried where machines will not find them',
    business: 'Answer engines take the sentence directly under a question and move on. Yours are preambles or long essays, so there is nothing clean to lift — and something clean is always available from a competitor.',
    severity: 'critical',
  },
  'geo.citation.third_party': {
    headline: 'AI systems find more independent evidence about your competitors than about you',
    business: 'What you say about yourself carries little weight. What credible third parties say about you carries almost all of it. Right now there is very little of the second kind, so your claims cannot be corroborated.',
    severity: 'critical',
  },
  'geo.citation.wikidata': {
    headline: 'There is no independent record confirming your company exists',
    business: 'AI systems look for a canonical third-party record before describing a company with confidence. Without one, answers about you are hedged, vague, or simply about somebody else.',
    severity: 'warning',
  },
  'geo.entity.organization_schema': {
    headline: 'AI systems have to guess what your company actually does',
    business: 'Nothing on your site states your identity in a form a machine reads directly. Every AI system is inferring it from marketing copy, and inference produces wrong or watered-down descriptions of your business.',
    severity: 'critical',
  },
  'aeo.coverage.question_gap': {
    headline: 'Your site does not answer questions your customers are actively asking',
    business: 'Each unanswered question is a moment where a buyer asks and an AI assistant recommends someone else, simply because only that competitor published an answer.',
    severity: 'critical',
  },
  'seo.index.csr_dependency': {
    headline: 'Your pages look empty to several AI crawlers',
    business: 'Your content only exists after JavaScript runs, and several AI crawlers do not run JavaScript. This is why a site can perform acceptably in Google and be completely absent from AI answers.',
    severity: 'critical',
  },
  'geo.content.comparisons': {
    headline: 'Your competitors are writing the comparison your buyers read',
    business: 'When a buyer asks an AI assistant which option to choose, the answer is assembled from comparison content. You publish none, so that answer is written entirely by other people.',
    severity: 'opportunity',
  },
  'geo.content.statistics': {
    headline: 'You give AI systems nothing worth quoting',
    business: 'Specific numbers are what AI answers cite, because a quoted figure needs a source. Without original data, there is no reason for any answer to name you as the source.',
    severity: 'opportunity',
  },
  'seo.onpage.content_depth': {
    headline: 'Your pages do not go deep enough to win the question',
    business: 'Thin pages cannot answer the follow-up questions a buyer has, so they rank for nothing in particular and give an AI answer nothing substantial to work with.',
    severity: 'warning',
  },
  'seo.index.noindex': {
    headline: 'Some of your pages are invisible to search engines by instruction',
    business: 'Pages you have paid to create are explicitly telling search engines not to list them. This is almost always an accident, and it is costing you every visitor those pages would have earned.',
    severity: 'critical',
  },
  'seo.perf.lcp': {
    headline: 'Visitors leave before your page finishes loading',
    business: 'Slow loading costs you traffic you have already earned, and search engines use it to break ties between otherwise comparable pages.',
    severity: 'warning',
  },
  'aeo.eeat.author_byline': {
    headline: 'Nobody can tell who is behind your advice',
    business: 'Answer engines check who said something before repeating it. Anonymous content is weighted below identical content with a credentialed name attached.',
    severity: 'warning',
  },
  'geo.entity.sameas': {
    headline: 'Nothing connects your website to your other profiles',
    business: 'Reviews, coverage and profiles that mention your brand cannot be attached to your website, so evidence that should build your authority is orphaned instead.',
    severity: 'warning',
  },
  'seo.index.canonical_host': {
    headline: 'Your website competes against itself',
    business: 'Several versions of your site are live at once, so the credibility you have built is divided between duplicates instead of concentrated on one.',
    severity: 'critical',
  },
};

export function buildTranslations(
  checks: CheckResult[],
  pillars: PillarScore[],
  gaps: QuestionGap[],
): BusinessTranslation[] {
  const ranked = rankFindings(checks, pillars);
  const out: BusinessTranslation[] = [];

  for (const check of ranked) {
    const template = TRANSLATIONS[check.id];
    if (!template) continue;
    if (out.length >= 5) break;

    let business = template.business;
    // Splice in the real number where we have one — specificity is what lands.
    if (check.id === 'aeo.coverage.question_gap') {
      const unanswered = gaps.filter((g) => !g.answered).length;
      if (unanswered > 0) {
        business = `${business} We found ${plural(unanswered, 'such question')} in this category that your site does not currently answer.`;
      }
    }

    out.push({
      id: check.id,
      headline: template.headline,
      business,
      technical: check.summary,
      checkIds: [check.id],
      severity: check.status === 'fail' ? 'critical' : check.status === 'warn' ? 'warning' : template.severity,
    });
  }

  return out;
}

/**
 * Competitor interpretation sentences, generated from actual score deltas so
 * the claim is always backed by the table directly above it.
 */
export function competitorInsights(
  own: { seo: number | null; aeo: number | null; geo: number | null; overall: number },
  competitors: CompetitorSummary[],
  gaps: QuestionGap[],
): string[] {
  const out: string[] = [];
  const valid = competitors.filter((c) => c.status === 'ok' && c.overall !== null);
  if (valid.length === 0) return out;

  for (const competitor of valid.slice(0, 3)) {
    const seoDelta = (own.seo ?? 0) - (competitor.seo ?? 0);
    const geoDelta = (own.geo ?? 0) - (competitor.geo ?? 0);
    const aeoDelta = (own.aeo ?? 0) - (competitor.aeo ?? 0);

    if (seoDelta > 8 && geoDelta < -8) {
      out.push(
        `You outperform ${competitor.host} technically (SEO ${own.seo} vs ${competitor.seo}), but they have substantially stronger entity and authority signals for AI systems (GEO ${competitor.geo} vs ${own.geo}).`,
      );
    } else if (geoDelta > 8 && seoDelta < -8) {
      out.push(
        `${competitor.host} has the stronger technical foundation (SEO ${competitor.seo} vs ${own.seo}), but you are better positioned for AI citation (GEO ${own.geo} vs ${competitor.geo}). That advantage erodes if they fix their content structure.`,
      );
    } else if (aeoDelta < -10) {
      out.push(
        `${competitor.host} structures its content for answer extraction far better than you do (AEO ${competitor.aeo} vs ${own.aeo}), which is why their pages get quoted in answers where yours do not.`,
      );
    } else if ((competitor.overall ?? 0) > own.overall + 10) {
      out.push(
        `${competitor.host} is ahead of you across the board (${competitor.overall} vs ${own.overall} overall). They are currently the default answer in this category.`,
      );
    } else if (own.overall > (competitor.overall ?? 0) + 10) {
      out.push(
        `You lead ${competitor.host} overall (${own.overall} vs ${competitor.overall}). The opportunity is to extend that gap before they notice it.`,
      );
    }
  }

  const unanswered = gaps.filter((g) => !g.answered).length;
  if (unanswered > 0 && valid.length > 0) {
    out.push(
      `Across the question set we tested, your site leaves ${plural(unanswered, 'high-intent customer question')} unanswered. Each is an opening for a competitor to be recommended instead of you.`,
    );
  }

  return out.slice(0, 4);
}
