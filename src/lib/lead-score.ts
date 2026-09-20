import { FREE_EMAIL_DOMAINS } from '@/engine/config';
import { registrableDomain } from '@/engine/util/url';
import type { AuditResult } from '@/engine/types';

/**
 * Agency-side lead scoring. See docs/03-scoring-methodology.md §7.
 *
 * The A-grade pattern is deliberately the one the brief named: a large site
 * with poor visibility and real brand equity. Those prospects have budget, a
 * genuine problem, and enough existing equity that the work compounds quickly.
 */

export interface LeadSignals {
  email: string;
  auditedHost: string;
  overallScore: number;
  pagesDiscovered: number;
  openPageRank: number | null;
  hasWikidataEntity: boolean;
  tier1to3CitationCount: number;
  competitorsProvided: boolean;
  budgetProvided: boolean;
}

export interface LeadScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  isFreeEmail: boolean;
  emailMatchesDomain: boolean;
  factors: { label: string; value: number; note: string }[];
}

export function emailDomain(email: string): string {
  return email.split('@').at(-1)?.toLowerCase().trim() ?? '';
}

export function scoreLead(signals: LeadSignals): LeadScoreResult {
  const domain = emailDomain(signals.email);
  const isFreeEmail = FREE_EMAIL_DOMAINS.has(domain);
  const emailMatchesDomain =
    !isFreeEmail && Boolean(domain) &&
    registrableDomain(domain) === registrableDomain(signals.auditedHost);

  // log10 scaled: 10 pages → 0.33, 100 → 0.67, 1,000+ → 1.0
  const opportunitySize = Math.min(1, Math.log10(Math.max(signals.pagesDiscovered, 10)) / 3);
  const painLevel = Math.max(0, Math.min(1, (100 - signals.overallScore) / 100));
  const brandEquity = Math.min(
    1,
    ((signals.openPageRank ?? 0) / 10) * 0.6 +
      (signals.hasWikidataEntity ? 0.25 : 0) +
      (signals.tier1to3CitationCount > 0 ? 0.15 : 0),
  );
  const intentSignal = Math.min(
    1,
    (signals.competitorsProvided ? 0.25 : 0) +
      (emailMatchesDomain ? 0.45 : 0) +
      (signals.budgetProvided ? 0.3 : 0),
  );

  const score = Math.round(
    100 * (0.3 * opportunitySize + 0.3 * painLevel + 0.25 * brandEquity + 0.15 * intentSignal),
  );

  const grade: LeadScoreResult['grade'] =
    score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';

  return {
    score,
    grade,
    isFreeEmail,
    emailMatchesDomain,
    factors: [
      {
        label: 'Opportunity size',
        value: Math.round(opportunitySize * 100),
        note: `${signals.pagesDiscovered} URLs discovered`,
      },
      {
        label: 'Pain level',
        value: Math.round(painLevel * 100),
        note: `Visibility score ${signals.overallScore}/100`,
      },
      {
        label: 'Brand equity',
        value: Math.round(brandEquity * 100),
        note: signals.hasWikidataEntity ? 'Recognised entity' : 'No entity record',
      },
      {
        label: 'Buying intent',
        value: Math.round(intentSignal * 100),
        note: emailMatchesDomain
          ? 'Work email matches the audited domain'
          : isFreeEmail
            ? 'Free email address'
            : 'Email domain does not match the audited site',
      },
    ],
  };
}

/** Pulls the lead signals out of a completed audit result. */
export function signalsFromAudit(
  result: AuditResult,
  email: string,
  budgetProvided: boolean,
): LeadSignals {
  const authority = result.checks.find((c) => c.id === 'geo.citation.domain_authority');
  const openPageRank = authority?.evidence.find(
    (e): e is Extract<typeof e, { kind: 'metric' }> => e.kind === 'metric',
  )?.value ?? null;

  const wikidata = result.checks.find((c) => c.id === 'geo.citation.wikidata');
  const thirdParty = result.checks.find((c) => c.id === 'geo.citation.third_party');
  const tierHits = thirdParty?.evidence.filter(
    (e) => e.kind === 'url' && /Tier [123]/.test(e.note ?? ''),
  ).length ?? 0;

  return {
    email,
    auditedHost: result.target.host,
    overallScore: result.overall.score,
    pagesDiscovered: result.stats.urlsDiscovered,
    openPageRank,
    hasWikidataEntity: wikidata?.status === 'pass',
    tier1to3CitationCount: tierHits,
    competitorsProvided: result.competitors.length > 0,
    budgetProvided,
  };
}
