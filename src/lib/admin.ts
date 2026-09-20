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
