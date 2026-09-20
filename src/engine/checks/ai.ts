import type { AuditContext, AuditMode, CheckResult } from '../types';
import { gradeStatus, makeCheck, unavailable, type CheckSpec } from './helpers';
import { clamp01, ratio } from '../util/text';

const spec = (id: string, group: string, title: string, weight: number): CheckSpec => ({
  id, pillar: 'ai', group, title, weight,
});

const SPECS = {
  mention: spec('ai.mention.rate', 'ai.mention', 'Brand appears in AI answers', 40),
  citation: spec('ai.citation.rate', 'ai.citation', 'Your site is cited as a source', 30),
  sov: spec('ai.sov.share', 'ai.sov', 'Share of voice against competitors', 20),
  sentiment: spec('ai.sentiment.quality', 'ai.sentiment', 'How you are described', 10),
  aio: spec('ai.mention.google_aio', 'ai.mention', 'Google AI Overview presence', 40),
  aioCite: spec('ai.citation.google_aio', 'ai.citation', 'Cited by Google AI Overviews', 30),
};

/**
 * Determines how AI presence was established for this audit.
 *
 *  A — real answers sampled from engines that expose an answer+citations API
 *  B — Google AI Overview presence via a SERP provider
 *  C — no measurement possible; the pillar is dropped from the composite and
 *      the UI shows an "AI Citation Readiness" estimate derived from GEO/AEO
 *      instead, explicitly labelled as a prediction rather than an observation.
 */
export function determineMode(ctx: AuditContext): AuditMode {
  if (ctx.aiAnswers.available) return 'A';
  if (ctx.serp.available && ctx.serp.data.aiOverviewChecked > 0) return 'B';
  return 'C';
}

export function runAiChecks(ctx: AuditContext): CheckResult[] {
  const mode = determineMode(ctx);

  if (mode === 'C') {
    const reason = ctx.aiAnswers.available
      ? 'No AI answer engine is configured'
      : ctx.aiAnswers.reason;
    return [
      unavailable(SPECS.mention, reason),
      unavailable(SPECS.citation, reason),
      unavailable(SPECS.sov, reason),
      unavailable(SPECS.sentiment, reason),
    ];
  }

  if (mode === 'B' && ctx.serp.available) {
    const serp = ctx.serp.data;
    const presenceRate = ratio(serp.aiOverviewPresent, Math.max(serp.aiOverviewChecked, 1));
    const citeRate = ratio(serp.aiOverviewCitesBrand, Math.max(serp.aiOverviewPresent, 1));
    return [
      makeCheck(SPECS.aio, {
        status: gradeStatus(citeRate, { failBelow: 0.15, warnBelow: 0.5 }),
        score: citeRate,
        summary: `Google showed an AI Overview for ${serp.aiOverviewPresent} of ${serp.aiOverviewChecked} category queries we checked. Your brand appeared in ${serp.aiOverviewCitesBrand} of them.`,
        evidence: [
          { kind: 'count', label: 'Queries with an AI Overview', value: serp.aiOverviewPresent, of: serp.aiOverviewChecked },
          { kind: 'count', label: 'AI Overviews mentioning your brand', value: serp.aiOverviewCitesBrand, of: serp.aiOverviewPresent },
          { kind: 'metric', label: 'AI Overview trigger rate', value: Math.round(presenceRate * 100), unit: '%' },
        ],
      }),
      makeCheck(SPECS.aioCite, {
        status: serp.aiOverviewCitedDomains.length === 0 ? 'unavailable' : gradeStatus(citeRate, { failBelow: 0.15, warnBelow: 0.5 }),
        score: citeRate,
        confidence: serp.aiOverviewCitedDomains.length === 0 ? 0 : 1,
        summary: serp.aiOverviewCitedDomains.length === 0
          ? 'No AI Overview citation sources were returned for these queries.'
          : `AI Overviews for your category cited ${serp.aiOverviewCitedDomains.length} distinct domains. These are the sources Google's AI trusts for your topic.`,
        evidence: [{ kind: 'list', label: 'Domains cited in AI Overviews', values: serp.aiOverviewCitedDomains.slice(0, 15) }],
      }),
      unavailable(SPECS.sov, 'Share of voice requires sampling AI assistant answers, which is not enabled'),
      unavailable(SPECS.sentiment, 'Sentiment requires sampling AI assistant answers, which is not enabled'),
    ];
  }

  if (!ctx.aiAnswers.available) return [];
  const ai = ctx.aiAnswers.data;
  const samples = ai.mentions.length;
  const mentioned = ai.mentions.filter((m) => m.brandMentioned);
  const cited = ai.mentions.filter((m) => m.citedBrandDomain);
  const mentionRate = ratio(mentioned.length, Math.max(samples, 1));
  const citationRate = ratio(cited.length, Math.max(samples, 1));

  // The denominator travels with every number — see docs/06.
  const provenance = `Measured across ${ai.promptSet.length} prompts × ${ai.samplesPerPrompt} samples on ${ai.engines.join(', ')} (${samples} answers).`;

  const positive = mentioned.filter((m) => m.sentiment === 'positive').length;
  const negative = mentioned.filter((m) => m.sentiment === 'negative').length;
  const ordinals = mentioned.map((m) => m.ordinal).filter((o): o is number => typeof o === 'number');
  const avgOrdinal = ordinals.length > 0 ? ordinals.reduce((a, b) => a + b, 0) / ordinals.length : null;

  return [
    makeCheck(SPECS.mention, {
      status: gradeStatus(mentionRate, { failBelow: 0.15, warnBelow: 0.5 }),
      score: mentionRate,
      summary: `Your brand was named in ${mentioned.length} of ${samples} AI answers (${Math.round(mentionRate * 100)}%). ${provenance}`,
      evidence: [
        { kind: 'count', label: 'Answers naming your brand', value: mentioned.length, of: samples },
        { kind: 'list', label: 'Prompt set', values: ai.promptSet },
        { kind: 'list', label: 'Engines sampled', values: ai.engines },
      ],
    }),
    makeCheck(SPECS.citation, {
      status: gradeStatus(citationRate, { failBelow: 0.1, warnBelow: 0.4 }),
      score: citationRate,
      summary: `Your website was cited as a source in ${cited.length} of ${samples} AI answers (${Math.round(citationRate * 100)}%). ${provenance}`,
      evidence: [{ kind: 'count', label: 'Answers citing your domain', value: cited.length, of: samples }],
    }),
    makeCheck(SPECS.sov, {
      status: gradeStatus(clamp01(ai.shareOfVoice.pct / 40), { failBelow: 0.2, warnBelow: 0.6 }),
      score: clamp01(ai.shareOfVoice.pct / 40),
      summary: `AI Share of Voice: ${ai.shareOfVoice.pct.toFixed(0)}% — ${ai.shareOfVoice.brandMentions} of ${ai.shareOfVoice.totalBrandMentions} tracked brand mentions across ${samples} answers.`,
      evidence: [
        { kind: 'metric', label: 'Share of voice', value: Math.round(ai.shareOfVoice.pct), unit: '%' },
        { kind: 'count', label: 'Your mentions', value: ai.shareOfVoice.brandMentions, of: ai.shareOfVoice.totalBrandMentions },
      ],
    }),
    makeCheck(SPECS.sentiment, {
      status: mentioned.length === 0 ? 'unavailable' : negative > positive ? 'warn' : 'pass',
      score: mentioned.length === 0 ? 0 : clamp01((positive - negative) / mentioned.length + 0.5),
      // Model-classified sentiment has a real error rate; reported as coarse bands.
      confidence: mentioned.length === 0 ? 0 : 0.6,
      summary: mentioned.length === 0
        ? 'Your brand was not mentioned, so there is nothing to assess.'
        : `Of ${mentioned.length} mentions: ${positive} positive, ${negative} negative, ${mentioned.length - positive - negative} neutral.` +
          (avgOrdinal ? ` On average you are the ${Math.round(avgOrdinal)}${ordinalSuffix(Math.round(avgOrdinal))} brand named.` : ''),
    }),
  ];
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
