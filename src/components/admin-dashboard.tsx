'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LeadRow } from '@/lib/repository';
import { Badge, Button, Card, Field, StatusIcon, inputClass, inputStyle } from './ui/primitives';
import { toneForScore } from './ui/score-ring';

/**
 * Agency-side lead dashboard.
 *
 * The default sort is grade then recency, because the whole point is that the
 * A-grade leads — large site, poor visibility, real brand equity, work email
 * matching the audited domain — surface without anyone having to hunt.
 */

const STATUSES: { value: LeadRow['status']; label: string }[] = [
  { value: 'new_lead', label: 'New lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'meeting_booked', label: 'Meeting booked' },
  { value: 'proposal_sent', label: 'Proposal sent' },
  { value: 'client', label: 'Client' },
  { value: 'lost', label: 'Lost' },
];

const GRADE_TONE = { A: 'good', B: 'warning', C: 'serious', D: 'neutral' } as const;

export function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(async (key: string) => {
    const response = await fetch('/api/admin/leads', { headers: { 'x-admin-password': key } });
    if (!response.ok) {
      setError(response.status === 401 ? 'Incorrect password.' : 'Could not load leads.');
      setAuthed(false);
      return;
    }
    const data = (await response.json()) as { leads: LeadRow[] };
    setLeads(data.leads);
    setAuthed(true);
    setError(null);
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem('indexjoy-admin');
    if (stored) {
      setPassword(stored);
      void load(stored);
    }
  }, [load]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    sessionStorage.setItem('indexjoy-admin', password);
    await load(password);
  }

  async function updateStatus(id: string, status: LeadRow['status']) {
    setLeads((current) => current.map((l) => (l.id === id ? { ...l, status } : l)));
    await fetch('/api/admin/leads', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-password': password },
      body: JSON.stringify({ id, status }),
    });
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <Card>
          <h1 className="text-lg font-semibold">Agency dashboard</h1>
          <form onSubmit={signIn} className="mt-4">
            <Field label="Password" error={error ?? undefined}>
              <input
                className={inputClass}
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </Field>
            <Button type="submit" className="mt-4 w-full">Sign in</Button>
          </form>
          <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            V1 uses a shared secret set via <code>ADMIN_PASSWORD</code>. Replaced by real accounts
            in Phase 4.
          </p>
        </Card>
      </div>
    );
  }

  const filtered = leads
    .filter((l) => gradeFilter === 'all' || l.grade === gradeFilter)
    .filter((l) => statusFilter === 'all' || l.status === statusFilter)
    .sort((a, b) => a.grade.localeCompare(b.grade) || b.created_at.localeCompare(a.created_at));

  const gradeCounts = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.grade] = (acc[l.grade] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {leads.length} total · {gradeCounts['A'] ?? 0} grade A
          </p>
        </div>
        <div className="flex gap-2">
          <select className={inputClass} style={{ ...inputStyle, width: 'auto' }} value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} aria-label="Filter by grade">
            <option value="all">All grades</option>
            {['A', 'B', 'C', 'D'].map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </select>
          <select className={inputClass} style={{ ...inputStyle, width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <Button variant="secondary" onClick={() => void load(password)}>Refresh</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No leads yet. They appear here as soon as someone unlocks a report.
          </p>
        </Card>
      ) : (
        <Card className="mt-6 overflow-x-auto" padded={false}>
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-left" style={{ color: 'var(--text-secondary)' }}>
                {['Grade', 'Company', 'Website', 'Contact', 'Overall', 'Score', 'Booked', 'Date', 'Status'].map((h) => (
                  <th key={h} className="whitespace-nowrap p-3 text-xs font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id} className="border-b last:border-0">
                  <td className="p-3">
                    <Badge tone={GRADE_TONE[lead.grade]} icon={<StatusIcon tone={GRADE_TONE[lead.grade]} />}>
                      {lead.grade}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <p className="font-medium">{lead.company ?? '—'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{lead.designation ?? ''}</p>
                  </td>
                  <td className="p-3">
                    {lead.host ? (
                      <a href={`https://${lead.host}`} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                        {lead.host}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    <p>{lead.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <a href={`mailto:${lead.email}`} className="underline underline-offset-2">{lead.email}</a>
                      {lead.email_matches_domain && <Badge tone="good">matches domain</Badge>}
                      {lead.is_free_email && <Badge tone="neutral">free email</Badge>}
                    </p>
                  </td>
                  <td className="p-3 tabular-nums">
                    {lead.overall_score === null ? '—' : (
                      <span style={{ color: `var(--status-${toneForScore(lead.overall_score)})`, fontWeight: 600 }}>
                        {lead.overall_score}
                      </span>
                    )}
                  </td>
                  <td className="p-3 tabular-nums">{lead.lead_score}</td>
                  <td className="p-3">{lead.status === 'meeting_booked' ? 'Yes' : '—'}</td>
                  <td className="whitespace-nowrap p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    <select
                      className={inputClass}
                      style={{ ...inputStyle, width: 'auto', padding: '6px 8px' }}
                      value={lead.status}
                      onChange={(e) => void updateStatus(lead.id, e.target.value as LeadRow['status'])}
                      aria-label={`Status for ${lead.company ?? lead.email}`}
                    >
                      {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        Grade A = large site + poor visibility + real brand equity + a work email matching the
        audited domain. See docs/03-scoring-methodology.md §7 for the formula.
      </p>
    </div>
  );
}
