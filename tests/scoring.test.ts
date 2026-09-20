import { describe, expect, it } from 'vitest';
import { bandFor, rankFindings, scoreOverall, scorePillar } from '@/engine/scoring/score';
import { PILLAR_WEIGHTS } from '@/engine/config';
import type { CheckResult, Pillar } from '@/engine/types';

function check(overrides: Partial<CheckResult> & { id: string }): CheckResult {
  return {
    pillar: 'seo', group: 'seo.index', title: 'test', status: 'pass', score: 1,
    weight: 10, confidence: 1, summary: '', evidence: [], affectedUrls: [],
    ...overrides,
  };
}

describe('pillar scoring', () => {
  it('excludes unavailable checks from both sides of the fraction', () => {
    const withUnavailable = scorePillar('seo', [
      check({ id: 'a', score: 1, status: 'pass' }),
      check({ id: 'b', score: 0, status: 'unavailable', confidence: 0 }),
    ]);
    const withoutUnavailable = scorePillar('seo', [check({ id: 'a', score: 1, status: 'pass' })]);

    // A missing API key must not drag the score down.
    expect(withUnavailable.score).toBe(withoutUnavailable.score);
    expect(withUnavailable.score).toBe(100);
  });

  it('excludes not_applicable checks the same way', () => {
    const pillar = scorePillar('aeo', [
      check({ id: 'a', pillar: 'aeo', group: 'aeo.answer', score: 0.8, status: 'pass' }),
      check({ id: 'b', pillar: 'aeo', group: 'aeo.answer', score: 0, status: 'not_applicable', confidence: 0 }),
    ]);
    expect(pillar.score).toBe(80);
  });

  it('reduces the effect of a low-confidence check without changing its score', () => {
    const confident = scorePillar('seo', [
      check({ id: 'a', score: 1, weight: 10 }),
      check({ id: 'b', score: 0, weight: 10, status: 'fail', confidence: 1 }),
    ]);
    const unsure = scorePillar('seo', [
      check({ id: 'a', score: 1, weight: 10 }),
      check({ id: 'b', score: 0, weight: 10, status: 'fail', confidence: 0.2 }),
    ]);
    expect(confident.score).toBe(50);
    expect(unsure.score ?? 0).toBeGreaterThan(confident.score ?? 0);
    expect(unsure.score).toBe(83);
  });

  it('refuses to report a pillar score below minimum coverage', () => {
    const pillar = scorePillar('geo', [
      check({ id: 'a', pillar: 'geo', group: 'geo.entity', status: 'unavailable', confidence: 0 }),
      check({ id: 'b', pillar: 'geo', group: 'geo.citation', status: 'unavailable', confidence: 0 }),
      check({ id: 'c', pillar: 'geo', group: 'geo.content', status: 'unavailable', confidence: 0 }),
      check({ id: 'd', pillar: 'geo', group: 'geo.machine', score: 1, status: 'pass' }),
    ]);
    expect(pillar.coverage).toBeLessThan(0.5);
    expect(pillar.score).toBeNull();
    expect(pillar.unmeasuredGroups.length).toBeGreaterThan(0);
  });

  it('grades scores rather than treating them as pass/fail cliffs', () => {
    expect(scorePillar('seo', [check({ id: 'a', score: 0.9, status: 'warn' })]).score).toBe(90);
    expect(scorePillar('seo', [check({ id: 'a', score: 0.1, status: 'fail' })]).score).toBe(10);
  });
});

describe('overall composite', () => {
  const pillars = (seo: number, aeo: number, geo: number, ai: number | null) =>
    [
      { pillar: 'seo' as Pillar, label: 'SEO', score: seo, coverage: 1, groups: [], unmeasuredGroups: [] },
      { pillar: 'aeo' as Pillar, label: 'AEO', score: aeo, coverage: 1, groups: [], unmeasuredGroups: [] },
      { pillar: 'geo' as Pillar, label: 'GEO', score: geo, coverage: 1, groups: [], unmeasuredGroups: [] },
      { pillar: 'ai' as Pillar, label: 'AI Presence', score: ai, coverage: ai === null ? 0 : 1, groups: [], unmeasuredGroups: [] },
    ];

  it('applies the documented weights when all four pillars are measured', () => {
    const overall = scoreOverall(pillars(80, 60, 40, 20), 'A');
    const expected = Math.round(80 * PILLAR_WEIGHTS.seo + 60 * PILLAR_WEIGHTS.aeo + 40 * PILLAR_WEIGHTS.geo + 20 * PILLAR_WEIGHTS.ai);
    expect(overall.score).toBe(expected);
    expect(overall.appliedWeights.ai).toBeCloseTo(PILLAR_WEIGHTS.ai, 5);
  });

  it('removes AI Presence from the composite in mode C rather than imputing it', () => {
    const overall = scoreOverall(pillars(80, 60, 40, null), 'C');

    expect(overall.appliedWeights.ai).toBe(0);
    const renormalised = PILLAR_WEIGHTS.seo + PILLAR_WEIGHTS.aeo + PILLAR_WEIGHTS.geo;
    expect(overall.appliedWeights.seo).toBeCloseTo(PILLAR_WEIGHTS.seo / renormalised, 5);
    expect(
      overall.appliedWeights.seo + overall.appliedWeights.aeo + overall.appliedWeights.geo,
    ).toBeCloseTo(1, 5);
    expect(overall.compositeNote).toMatch(/3 of 4 pillars/);
  });

  it('never lets an unmeasured pillar lower the headline score', () => {
    const measured = scoreOverall(pillars(80, 80, 80, 80), 'A');
    const unmeasured = scoreOverall(pillars(80, 80, 80, null), 'C');
    expect(unmeasured.score).toBe(measured.score);
  });

  it('computes AI visibility in mode C from the pillars shown to the reader', () => {
    // The number on screen must be recomputable from the other numbers on
    // screen: GEO 70% + AEO 30% = 40*0.7 + 60*0.3 = 46.
    const overall = scoreOverall(pillars(80, 60, 40, null), 'C');
    expect(overall.aiVisibility).toBe(46);
  });

  it('assigns the documented bands', () => {
    expect(bandFor(90).band).toBe('A');
    expect(bandFor(72).band).toBe('B');
    expect(bandFor(60).band).toBe('C');
    expect(bandFor(47).band).toBe('D');
    expect(bandFor(12).band).toBe('E');
  });
});

describe('finding rank', () => {
  const pillars = [
    { pillar: 'seo' as Pillar, label: 'SEO', score: 50, coverage: 1, groups: [], unmeasuredGroups: [] },
    { pillar: 'geo' as Pillar, label: 'GEO', score: 50, coverage: 1, groups: [], unmeasuredGroups: [] },
  ];

  it('puts failures above opportunities regardless of weight', () => {
    const ranked = rankFindings(
      [
        check({ id: 'geo.content.statistics', pillar: 'geo', group: 'geo.content', status: 'opportunity', score: 0, weight: 40 }),
        check({ id: 'seo.onpage.h1', group: 'seo.onpage', status: 'fail', score: 0, weight: 1 }),
      ],
      pillars,
    );
    expect(ranked[0]?.id).toBe('seo.onpage.h1');
  });

  it('promotes a gating failure above other failures', () => {
    const ranked = rankFindings(
      [
        check({ id: 'seo.onpage.title_present', group: 'seo.onpage', status: 'fail', score: 0, weight: 50 }),
        check({ id: 'geo.machine.ai_crawler_access', pillar: 'geo', group: 'geo.machine', status: 'fail', score: 0.5, weight: 18 }),
      ],
      pillars,
    );
    expect(ranked[0]?.id).toBe('geo.machine.ai_crawler_access');
  });

  it('excludes passing checks', () => {
    const ranked = rankFindings([check({ id: 'ok', status: 'pass', score: 1 })], pillars);
    expect(ranked).toHaveLength(0);
  });
});
