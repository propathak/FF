import type { CheckResult, CheckStatus, Evidence, Pillar } from '../types';
import { clamp01 } from '../util/text';

export interface CheckSpec {
  id: string;
  pillar: Pillar;
  group: string;
  title: string;
  weight: number;
}

export function makeCheck(
  spec: CheckSpec,
  result: {
    status: CheckStatus;
    score: number;
    summary: string;
    confidence?: number;
    evidence?: Evidence[];
    affectedUrls?: string[];
  },
): CheckResult {
  return {
    id: spec.id,
    pillar: spec.pillar,
    group: spec.group,
    title: spec.title,
    status: result.status,
    score: clamp01(result.score),
    weight: spec.weight,
    confidence: clamp01(result.confidence ?? 1),
    summary: result.summary,
    evidence: result.evidence ?? [],
    affectedUrls: (result.affectedUrls ?? []).slice(0, 20),
  };
}

export function unavailable(spec: CheckSpec, reason: string): CheckResult {
  return makeCheck(spec, { status: 'unavailable', score: 0, summary: reason, confidence: 0 });
}

export function notApplicable(spec: CheckSpec, reason: string): CheckResult {
  return makeCheck(spec, { status: 'not_applicable', score: 0, summary: reason, confidence: 0 });
}

/**
 * Maps a graded 0..1 score onto a status using consistent thresholds so that a
 * "warning" means the same thing in every check.
 */
export function gradeStatus(
  score: number,
  options: { failBelow?: number; warnBelow?: number; opportunity?: boolean } = {},
): CheckStatus {
  const { failBelow = 0.4, warnBelow = 0.8, opportunity = false } = options;
  if (score >= warnBelow) return 'pass';
  if (score >= failBelow) return opportunity ? 'opportunity' : 'warn';
  return opportunity ? 'opportunity' : 'fail';
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
