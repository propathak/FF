import type {
  AuditMode, CheckResult, GroupScore, OverallScore, Pillar, PillarScore, ScoreBand,
} from '../types';
import {
  COMPOSITE_WEIGHTS, GROUP_WEIGHTS, MIN_PILLAR_COVERAGE, PILLAR_WEIGHTS, SCORE_BANDS,
} from '../config';

/**
 * The scoring engine.
 *
 * Hard constraint: this module performs no I/O and holds no model client. It is
 * a pure function of CheckResult[] → scores, which is what makes an audit
 * reproducible and a trend line meaningful. A test asserts the import graph
 * stays free of network modules.
 */

const PILLAR_LABELS: Record<Pillar, string> = {
  seo: 'SEO',
  aeo: 'AEO',
  geo: 'GEO',
  ai: 'AI Presence',
};

/** `unavailable` and `not_applicable` leave both sides of the fraction. */
function isScored(check: CheckResult): boolean {
  return check.status !== 'unavailable' && check.status !== 'not_applicable';
}

function scoreGroup(group: string, checks: CheckResult[]): GroupScore {
  const scored = checks.filter(isScored);
  const effectiveWeight = (c: CheckResult) => c.weight * c.confidence;

  const denominator = scored.reduce((n, c) => n + effectiveWeight(c), 0);
  const numerator = scored.reduce((n, c) => n + c.score * effectiveWeight(c), 0);
  const possible = checks.reduce((n, c) => n + c.weight, 0);
  const measured = scored.reduce((n, c) => n + c.weight, 0);

  return {
    group,
    label: GROUP_WEIGHTS[group]?.label ?? group,
    score: denominator === 0 ? 0 : numerator / denominator,
    weight: GROUP_WEIGHTS[group]?.weight ?? 10,
    coverage: possible === 0 ? 0 : measured / possible,
    checks,
  };
}

export function scorePillar(pillar: Pillar, checks: CheckResult[]): PillarScore {
  const pillarChecks = checks.filter((c) => c.pillar === pillar);
  const groupIds = [...new Set(pillarChecks.map((c) => c.group))];
  const groups = groupIds.map((g) => scoreGroup(g, pillarChecks.filter((c) => c.group === g)));

  // A group with nothing measurable drops out of the pillar entirely rather
  // than contributing a zero.
  const live = groups.filter((g) => g.coverage > 0);
  const totalGroupWeight = groups.reduce((n, g) => n + g.weight, 0);
  const liveGroupWeight = live.reduce((n, g) => n + g.weight, 0);

  const coverage = totalGroupWeight === 0
    ? 0
    : groups.reduce((n, g) => n + g.weight * g.coverage, 0) / totalGroupWeight;

  const raw = liveGroupWeight === 0
    ? 0
    : live.reduce((n, g) => n + g.score * g.weight, 0) / liveGroupWeight;

  return {
    pillar,
    label: PILLAR_LABELS[pillar],
    // Below half coverage we say "insufficient data" instead of guessing.
    score: coverage < MIN_PILLAR_COVERAGE ? null : Math.round(raw * 100),
    coverage,
    groups: groups.sort((a, b) => b.weight - a.weight),
    unmeasuredGroups: groups.filter((g) => g.coverage === 0).map((g) => g.label),
  };
}

export function bandFor(score: number): ScoreBand {
  const match = SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS.at(-1);
  return { band: match?.band ?? 'E', label: match?.label ?? 'Unknown', tone: match?.tone ?? '' };
}

/**
 * Composite scoring with the renormalisation rule.
 *
 * When AI Presence is not measured (Mode C) it is REMOVED from the composite
 * and the remaining pillars are renormalised to 100%. An unmeasured pillar is
 * never imputed into a headline number — that is the whole basis of the
 * product's claim to be reproducible.
 */
export function scoreOverall(pillars: PillarScore[], mode: AuditMode): OverallScore {
  const byPillar = new Map(pillars.map((p) => [p.pillar, p]));
  const usable = (['seo', 'aeo', 'geo', 'ai'] as Pillar[]).filter((p) => {
    if (p === 'ai') return mode !== 'C' && byPillar.get('ai')?.score !== null;
    return byPillar.get(p)?.score !== null;
  });

  const weightSum = usable.reduce((n, p) => n + PILLAR_WEIGHTS[p], 0);
  const appliedWeights = Object.fromEntries(
    (['seo', 'aeo', 'geo', 'ai'] as Pillar[]).map((p) => [
      p,
      usable.includes(p) && weightSum > 0 ? PILLAR_WEIGHTS[p] / weightSum : 0,
    ]),
  ) as Record<Pillar, number>;

  const score = Math.round(
    usable.reduce((n, p) => n + (byPillar.get(p)?.score ?? 0) * appliedWeights[p], 0),
  );

  const seo = byPillar.get('seo')?.score ?? 0;
  const aeo = byPillar.get('aeo')?.score ?? 0;
  const geo = byPillar.get('geo')?.score ?? 0;
  const ai = byPillar.get('ai')?.score;

  const googleVisibility = Math.round(
    seo * COMPOSITE_WEIGHTS.googleVisibility.seo + aeo * COMPOSITE_WEIGHTS.googleVisibility.aeo,
  );

  const aiVisibility =
    mode !== 'C' && typeof ai === 'number'
      ? Math.round(
          geo * COMPOSITE_WEIGHTS.aiVisibilityMeasured.geo +
            aeo * COMPOSITE_WEIGHTS.aiVisibilityMeasured.aeo +
            ai * COMPOSITE_WEIGHTS.aiVisibilityMeasured.ai,
        )
      : // Mode C: the documented formula, so the reader can recompute this
        // number from the pillar rings shown directly above it. An extra,
        // separately-derived estimate here would be a second AI number that
        // disagrees with the first — exactly the kind of unverifiable figure
        // this product exists to avoid.
        Math.round(
          geo * COMPOSITE_WEIGHTS.aiVisibilityEstimated.geo +
            aeo * COMPOSITE_WEIGHTS.aiVisibilityEstimated.aeo,
        );

  const compositeNote =
    mode === 'C'
      ? `Overall score computed from ${usable.length} of 4 pillars — AI answer measurement is not enabled, so AI Presence was excluded rather than estimated into the total.`
      : mode === 'B'
        ? 'AI Presence measured from Google AI Overviews only.'
        : 'All four pillars measured.';

  return {
    score,
    band: bandFor(score),
    mode,
    appliedWeights,
    googleVisibility,
    aiVisibility,
    compositeNote,
  };
}

export function summariseChecks(checks: CheckResult[]) {
  return {
    criticalCount: checks.filter((c) => c.status === 'fail').length,
    warningCount: checks.filter((c) => c.status === 'warn').length,
    opportunityCount: checks.filter((c) => c.status === 'opportunity').length,
    passCount: checks.filter((c) => c.status === 'pass').length,
  };
}

/** Something actively broken always outranks something merely unexploited. */
const SEVERITY_RANK: Record<string, number> = { fail: 0, warn: 1, opportunity: 2 };

/**
 * Gating failures: defects that nullify other work rather than merely costing
 * points. While a site is blocked, noindexed or unreadable, no amount of
 * content or authority work can produce visibility — so these are promoted
 * above everything else when they fail, independent of their weight.
 *
 * This is a dependency relationship, not a weighting preference: fixing
 * anything else first is wasted effort.
 */
const GATING_CHECKS = new Set([
  'seo.index.robots_txt',
  'seo.index.noindex',
  'seo.index.https',
  'seo.index.status_code',
  'seo.index.canonical_host',
  'seo.index.csr_dependency',
  'geo.machine.ai_crawler_access',
]);

/**
 * Orders findings by severity first, then by how much headline score each fix
 * would actually recover.
 *
 * Severity has to lead. Ranking purely by recoverable score lets a
 * high-weight *opportunity* (content you could add) outrank an outright
 * *failure* (AI crawlers blocked in robots.txt) — which buries the most urgent,
 * cheapest fix on the page under a list of nice-to-haves.
 */
export function rankFindings(checks: CheckResult[], pillars: PillarScore[]): CheckResult[] {
  const pillarWeight = new Map(pillars.map((p) => [p.pillar, PILLAR_WEIGHTS[p.pillar]]));
  const groupWeight = (group: string) => GROUP_WEIGHTS[group]?.weight ?? 10;

  return [...checks]
    .filter((c) => c.status === 'fail' || c.status === 'warn' || c.status === 'opportunity')
    .map((c) => ({
      check: c,
      severity: (SEVERITY_RANK[c.status] ?? 3) - (c.status === 'fail' && GATING_CHECKS.has(c.id) ? 1 : 0),
      recoverable:
        (1 - c.score) * c.weight * c.confidence * groupWeight(c.group) * (pillarWeight.get(c.pillar) ?? 0.25),
    }))
    .sort((a, b) => a.severity - b.severity || b.recoverable - a.recoverable)
    .map((x) => x.check);
}
