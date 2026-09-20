import { describe, expect, it } from 'vitest';
import { RECOMMENDATION_CATALOG } from '@/engine/recommend/catalog';
import { buildRecommendations } from '@/engine/recommend/build';
import { scoreLead } from '@/lib/lead-score';
import type { CheckResult, Pillar, PillarScore } from '@/engine/types';

const pillars: PillarScore[] = (['seo', 'aeo', 'geo', 'ai'] as Pillar[]).map((p) => ({
  pillar: p, label: p.toUpperCase(), score: 50, coverage: 1, groups: [], unmeasuredGroups: [],
}));

function check(id: string, overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id, pillar: 'seo', group: 'seo.index', title: 'test', status: 'fail', score: 0,
    weight: 10, confidence: 1, summary: 'observed summary', evidence: [], affectedUrls: [],
    ...overrides,
  };
}

describe('recommendation catalog quality', () => {
  it('never produces filler advice that just names the check id', () => {
    for (const [id, template] of Object.entries(RECOMMENDATION_CATALOG)) {
      expect(template.action, `${id} action must not reference its own check id`).not.toContain(id);
      expect(template.action.length, `${id} action is too short to be actionable`).toBeGreaterThan(40);
      expect(template.whyItMatters.length, `${id} rationale is too short`).toBeGreaterThan(40);
    }
  });

  it('drops checks with no template rather than padding the plan', () => {
    const recs = buildRecommendations(
      [check('seo.index.noindex'), check('some.check.with.no.template')],
      pillars,
    );
    expect(recs.map((r) => r.checkId)).toEqual(['seo.index.noindex']);
  });

  it('promotes a catalogued 30-day item to "fix now" when the check outright fails', () => {
    const recs = buildRecommendations([check('aeo.schema.faq', { pillar: 'aeo', group: 'aeo.schema' })], pillars);
    expect(recs[0]?.horizon).toBe('now');
  });

  it('demotes a catalogued urgent item when the check is only an opportunity', () => {
    const recs = buildRecommendations(
      [check('geo.machine.ai_crawler_access', { pillar: 'geo', group: 'geo.machine', status: 'opportunity', score: 0.5 })],
      pillars,
    );
    expect(recs[0]?.horizon).toBe('30d');
  });

  it('caps each horizon so the plan stays executable', () => {
    const many = Object.keys(RECOMMENDATION_CATALOG).map((id) =>
      check(id, { pillar: 'geo', group: 'geo.entity' }),
    );
    const recs = buildRecommendations(many, pillars);
    for (const horizon of ['now', '30d', '90d'] as const) {
      expect(recs.filter((r) => r.horizon === horizon).length).toBeLessThanOrEqual(8);
    }
  });

  it('gives every recommendation a full, readable action', () => {
    // Nothing is withheld any more: identity is captured at sign-in, so the
    // report is shown in full. Every action must therefore stand on its own.
    const recs = buildRecommendations(
      Object.keys(RECOMMENDATION_CATALOG).map((id) => check(id, { pillar: 'geo', group: 'geo.entity' })),
      pillars,
    );
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.action.length, `${rec.checkId} has no usable action`).toBeGreaterThan(40);
      expect(rec.whyItMatters.length).toBeGreaterThan(40);
    }
  });
});

describe('lead scoring', () => {
  const base = {
    email: 'rhea@acme.com',
    auditedHost: 'www.acme.com',
    overallScore: 40,
    pagesDiscovered: 900,
    openPageRank: 6,
    hasWikidataEntity: true,
    tier1to3CitationCount: 3,
    competitorsProvided: true,
    budgetProvided: true,
  };

  it('grades the named high-value pattern as A', () => {
    // Large site + poor visibility + real brand equity + matching work email.
    const result = scoreLead(base);
    expect(result.grade).toBe('A');
    expect(result.emailMatchesDomain).toBe(true);
    expect(result.isFreeEmail).toBe(false);
  });

  it('detects a free email address and scores intent lower', () => {
    const result = scoreLead({ ...base, email: 'someone@gmail.com' });
    expect(result.isFreeEmail).toBe(true);
    expect(result.emailMatchesDomain).toBe(false);
    expect(result.score).toBeLessThan(scoreLead(base).score);
  });

  it('treats a non-matching corporate email as a weaker signal than a matching one', () => {
    const agency = scoreLead({ ...base, email: 'analyst@someagency.com' });
    expect(agency.emailMatchesDomain).toBe(false);
    expect(agency.isFreeEmail).toBe(false);
    expect(agency.score).toBeLessThan(scoreLead(base).score);
  });

  it('matches across www and subdomain forms', () => {
    expect(scoreLead({ ...base, email: 'rhea@mail.acme.com' }).emailMatchesDomain).toBe(true);
  });

  it('scores a tiny, healthy, anonymous site as a low-priority lead', () => {
    const result = scoreLead({
      email: 'x@gmail.com', auditedHost: 'tiny.example', overallScore: 92,
      pagesDiscovered: 4, openPageRank: null, hasWikidataEntity: false,
      tier1to3CitationCount: 0, competitorsProvided: false, budgetProvided: false,
    });
    expect(result.grade).toBe('D');
  });

  it('always explains its factors', () => {
    expect(scoreLead(base).factors).toHaveLength(4);
    for (const factor of scoreLead(base).factors) {
      expect(factor.note.length).toBeGreaterThan(0);
    }
  });
});
