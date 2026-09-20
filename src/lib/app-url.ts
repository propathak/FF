/**
 * The site's own public address.
 *
 * Resolved rather than required, so a deployment works without anyone having
 * to set NEXT_PUBLIC_APP_URL by hand:
 *
 *   1. NEXT_PUBLIC_APP_URL          — an explicit override, if someone set one
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's own production domain
 *   3. VERCEL_URL                    — this specific deployment (preview builds)
 *   4. the production domain          — the last-resort default
 *
 * Vercel's variables carry no scheme, so https is added. VERCEL_URL sits below
 * the production one deliberately: preview URLs can sit behind deployment
 * protection, which would make any link built from them unreachable.
 */

const PRODUCTION_FALLBACK = 'https://indexjoy.com';

function withScheme(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function appUrl(): string {
  const explicit = withScheme(process.env['NEXT_PUBLIC_APP_URL']);
  if (explicit) return explicit;

  const production =
    withScheme(process.env['VERCEL_PROJECT_PRODUCTION_URL']) ??
    withScheme(process.env['NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL']);
  if (production) return production;

  const deployment =
    withScheme(process.env['VERCEL_URL']) ?? withScheme(process.env['NEXT_PUBLIC_VERCEL_URL']);
  if (deployment) return deployment;

  // Local development gets localhost; anything else gets the real domain.
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return PRODUCTION_FALLBACK;
}
