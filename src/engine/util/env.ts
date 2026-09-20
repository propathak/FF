import type { EnvBag } from '../types';

/**
 * Reading environment variables that may be present but blank.
 *
 * `??` only falls back on undefined, so an empty value sails straight past a
 * default. That is not an edge case in practice: Vercel offers to import
 * every key from a repository's .env.example, which creates the whole set
 * with empty values. On this app's first real deployment that turned
 *
 *   Number(env['AUDITS_PER_DOMAIN_PER_DAY'] ?? 3)   into   0
 *
 * and produced the message "paytm.com has already been audited 0 times
 * today" — a limit of zero, refusing every audit. AUDIT_MAX_PAGES had the
 * same shape and would have crawled nothing.
 *
 * So: a blank value means "not set", everywhere, and a value that is present
 * but unusable falls back rather than propagating a nonsense number.
 */

export function envString(env: EnvBag, key: string): string | undefined {
  const raw = env[key];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function envNumber(env: EnvBag, key: string, fallback: number): number {
  const raw = envString(env, key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  // Rejects both unparseable text and a deliberate but unusable 0 or -1 for
  // the counts this is used for, where zero means "allow nothing".
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
