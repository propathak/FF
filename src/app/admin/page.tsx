import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { adminEmails, isAdminEmail, maySetUpSchema } from '@/lib/admin';
import { databaseUrl, getRepository } from '@/lib/repository';
import { schemaIsReady } from '@/lib/migrate';
import { DbSetup } from '@/components/db-setup';
import { scoreLead, signalsFromAudit } from '@/lib/lead-score';
import { Badge, Card, StatusIcon } from '@/components/ui/primitives';
import { toneVarForScore } from '@/lib/tone';
import { isSheetsConfigured } from '@/lib/sheets';

export const metadata: Metadata = {
  title: 'Audits',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const GRADE_TONE = { A: 'good', B: 'warning', C: 'serious', D: 'neutral' } as const;

/**
 * Agency view: who signed in, and what they audited. The same two facts the
 * Google Sheet carries, so the sheet and this page can be checked against
 * each other.
 *
 * Access is a Google session whose email is in ADMIN_EMAILS — there is no
 * shared password to leak, and revoking access is one env var away.
 */
export default async function AdminPage() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) redirect('/signin?callbackUrl=%2Fadmin');

  // Checked before the admin rule, because an unfinished database changes who
  // is allowed to see this page. Otherwise ADMIN_EMAILS — itself an
  // environment variable — can lock an operator out of the only screen that
  // lets them finish setting the deployment up.
  const url = databaseUrl();
  const ready = Boolean(url) && (await schemaIsReady(url as string));

  if (!maySetUpSchema(email, ready)) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <Card>
          <h1 className="text-lg font-semibold">Not authorised</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {adminEmails().length === 0
              ? 'No administrators are configured. Set ADMIN_EMAILS to a comma-separated list of Google accounts.'
              : `${email} is not on the administrator list.`}
          </p>
        </Card>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <DbSetup connected={Boolean(url)} />
      </div>
    );
  }

  // Past this point the schema exists, so the relaxed rule no longer applies
  // and the dashboard itself stays admin-only.
  if (!isAdminEmail(email)) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <Card>
          <h1 className="text-lg font-semibold">Database is ready</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            The tables exist, so audits will run. This dashboard is restricted &mdash; add{' '}
            {email} to ADMIN_EMAILS and redeploy to see the lead list here.
          </p>
        </Card>
      </div>
    );
  }

  const audits = await getRepository().listRecentAudits(200);
  const completed = audits.filter((a) => a.status === 'complete' && a.result);
  const people = new Set(audits.map((a) => a.requester_email).filter(Boolean));

  const rows = audits.map((audit) => ({
    audit,
    grade:
      audit.result && audit.requester_email
        ? scoreLead(signalsFromAudit(audit.result, audit.requester_email, false)).grade
        : null,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audits</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {audits.length} {audits.length === 1 ? 'audit' : 'audits'} · {completed.length} completed ·{' '}
            {people.size} signed-in {people.size === 1 ? 'person' : 'people'}
          </p>
        </div>
        <Badge tone={isSheetsConfigured() ? 'good' : 'neutral'} icon={<StatusIcon tone={isSheetsConfigured() ? 'good' : 'neutral'} />}>
          {isSheetsConfigured() ? 'Google Sheet connected' : 'Sheet not configured'}
        </Badge>
      </div>

      {rows.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No audits yet. They appear here — and in your Google Sheet — as soon as somebody signs
            in and runs one.
          </p>
        </Card>
      ) : (
        <Card className="mt-6 overflow-x-auto" padded={false}>
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left" style={{ color: 'var(--text-secondary)' }}>
                {['Date', 'Signed-in email', 'Website audited', 'Overall', 'SEO', 'AEO', 'GEO', 'Grade', 'Status'].map((h) => (
                  <th key={h} className="whitespace-nowrap p-3 text-xs font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ audit, grade }) => (
                <tr key={audit.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(audit.created_at).toLocaleString(undefined, {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="p-3">
                    {audit.requester_email ? (
                      <a href={`mailto:${audit.requester_email}`} className="underline underline-offset-2">
                        {audit.requester_email}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    <a
                      href={`https://${audit.host}`}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline underline-offset-2"
                    >
                      {audit.host}
                    </a>
                  </td>
                  {(['overall_score', 'seo_score', 'aeo_score', 'geo_score'] as const).map((key) => (
                    <td key={key} className="p-3 tabular-nums">
                      {audit[key] === null ? '—' : (
                        <span
                          style={{
                            color: key === 'overall_score' ? toneVarForScore(audit[key] as number) : undefined,
                            fontWeight: key === 'overall_score' ? 600 : 400,
                          }}
                        >
                          {audit[key]}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="p-3">
                    {grade ? (
                      <Badge tone={GRADE_TONE[grade]} icon={<StatusIcon tone={GRADE_TONE[grade]} />}>{grade}</Badge>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    {audit.status === 'complete' ? (
                      <a href={`/audit/${audit.id}`} className="underline underline-offset-2">View</a>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>{audit.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        Grade is computed from the audit itself — site size, how poor the visibility is, brand
        equity, and whether the sign-in email matches the audited domain. No form required.
      </p>
    </div>
  );
}
