import type { StatusTone } from '@/components/ui/primitives';

/**
 * Score → status tone.
 *
 * Lives outside any `'use client'` module on purpose: both server components
 * (the admin table) and client components (the score rings) need it, and a
 * client-module export cannot be called from the server.
 */
export function toneForScore(score: number): StatusTone {
  if (score >= 70) return 'good';
  if (score >= 55) return 'warning';
  if (score >= 35) return 'serious';
  return 'critical';
}

export const TONE_COLOR: Record<StatusTone, string> = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  serious: 'var(--status-serious)',
  critical: 'var(--status-critical)',
  neutral: 'var(--text-muted)',
  accent: 'var(--accent)',
};

/** CSS custom-property name for a score's tone, e.g. `var(--status-good)`. */
export function toneVarForScore(score: number): string {
  return TONE_COLOR[toneForScore(score)];
}
