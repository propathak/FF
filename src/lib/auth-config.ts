/**
 * Whether Google sign-in is actually configured.
 *
 * This exists because of a failure mode that is silent by default. Auth.js
 * reads `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` from the environment, and when
 * they are absent it does not raise a configuration error — it builds the
 * authorisation URL anyway and redirects the visitor to
 *
 *   https://accounts.google.com/o/oauth2/v2/auth?...&client_id=undefined&...
 *
 * Google answers that with "Error 401: invalid_client — The OAuth client was
 * not found", which looks like a Google problem rather than a missing
 * variable. Verified against next-auth 5.0.0-beta.32: POSTing to
 * /api/auth/signin/google with no credentials set returns a 302 to exactly
 * that URL.
 *
 * So we check first and say what is missing, rather than sending someone to a
 * dead end on Google's side.
 *
 * No dependency on next-auth or on Next.js, so it can be unit tested against a
 * plain environment bag.
 */

export interface AuthConfigStatus {
  /** True when sign-in can actually complete. */
  ready: boolean;
  /** Names of the variables that still need to be set, in the order to set them. */
  missing: string[];
}

export function authConfigStatus(env: Record<string, string | undefined> = process.env): AuthConfigStatus {
  const missing: string[] = [];
  // AUTH_SECRET signs the session cookie. Auth.js generates one automatically
  // in development but refuses to start without it in production, so it is
  // only reported as missing where it is genuinely required.
  if (!present(env['AUTH_SECRET']) && !present(env['NEXTAUTH_SECRET']) && env['NODE_ENV'] === 'production') {
    missing.push('AUTH_SECRET');
  }
  if (!present(env['AUTH_GOOGLE_ID'])) missing.push('AUTH_GOOGLE_ID');
  if (!present(env['AUTH_GOOGLE_SECRET'])) missing.push('AUTH_GOOGLE_SECRET');
  return { ready: missing.length === 0, missing };
}

/**
 * The redirect URI Google must have on file, for a given site origin.
 *
 * Google matches this string exactly — scheme, host, port and path all have to
 * agree, and a trailing slash is a different URI. Taking the origin from the
 * live request rather than from configuration means the value shown to an
 * operator is the one their browser will actually send, which is the whole
 * point when a deployment is reachable at both a *.vercel.app address and a
 * custom domain.
 */
export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/auth/callback/google`;
}

function present(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
