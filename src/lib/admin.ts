/**
 * Who may see the agency dashboard.
 *
 * Deliberately separate from `src/auth.ts`: this is a pure policy decision
 * with no dependency on the auth framework, which keeps it testable and makes
 * the rule easy to audit in one short file.
 */

export function adminEmails(): string[] {
  return (process.env['ADMIN_EMAILS'] ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = adminEmails();
  // Fail closed: an unset ADMIN_EMAILS locks everyone out rather than
  // silently meaning "no restriction".
  return allowed.length > 0 && allowed.includes(email.toLowerCase());
}

/**
 * Whether a signed-in visitor may run the one-click schema setup.
 *
 * Normally admin-only. The exception is a deployment whose database has no
 * tables at all, where the admin rule creates a deadlock: ADMIN_EMAILS is
 * itself an environment variable, so an operator who saves it wrong cannot
 * reach the only screen that would let them finish setup — which is exactly
 * what happened on the first real deployment of this app.
 *
 * Relaxing it costs nothing. An empty database holds no data to expose, the
 * migrations only create tables, and the exception closes the moment the
 * first table exists. A signed-in Google account is still required, so this
 * is never open to the internet at large.
 */
export function maySetUpSchema(email: string | null | undefined, schemaReady: boolean): boolean {
  if (!email) return false;
  return isAdminEmail(email) || !schemaReady;
}
