'use client';

import { useState } from 'react';
import type { AuditResult } from '@/engine/types';
import { Badge, Button, Card, Field, SectionHeading, inputClass, inputStyle } from '@/components/ui/primitives';

/**
 * The gate.
 *
 * Principle: gate *implementation*, never *diagnosis*. Everything above this
 * point is the complete, honest diagnosis — free, with evidence. What is
 * withheld is the strategy and the roadmap, which is what the agency sells.
 *
 * The locked content stays in the DOM under a blur so the prospect can see the
 * shape and volume of what they are missing. That is the entire mechanism.
 */

const LOCKED_ITEMS = [
  ['Complete keyword opportunity map', 'Every query your category is searched with, mapped to the page that should own it.'],
  ['AI prompt visibility analysis', 'The prompts your buyers actually use, and who gets recommended when they do.'],
  ['Competitor gap analysis', 'Page-by-page, what they publish that you do not, ranked by commercial value.'],
  ['90-day implementation roadmap', 'Sequenced, owner-assigned, with the dependency order that avoids wasted work.'],
  ['Content architecture', 'The cluster and hub structure that makes your topical authority legible to machines.'],
  ['Schema implementation roadmap', 'Which schema type belongs on which template, and the @id graph that connects them.'],
  ['Authority and citation strategy', 'The specific publications, communities and platforms that get cited in your category.'],
  ['Backlink acquisition strategy', 'Targets prioritised by how often they already appear in answers about your topic.'],
  ['AI visibility strategy', 'How to become the source an AI assistant reaches for, rather than a brand it happens to name.'],
];

export function LockedRoadmap({
  result, unlocked, onUnlock,
}: {
  result: AuditResult;
  unlocked: boolean;
  onUnlock: (leadId: string, bookingUrl: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (unlocked) return null;

  const criticalCount = result.stats.criticalCount;
  const unanswered = result.questionGaps.filter((g) => !g.answered).length;

  return (
    <section className="no-print">
      <div
        className="relative overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface-1)' }}
      >
        <div className="p-6 sm:p-8">
          <Badge tone="accent">Locked</Badge>
          <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight">
            Your 90-day search &amp; AI visibility roadmap
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            You have seen the diagnosis: {criticalCount} critical{' '}
            {criticalCount === 1 ? 'issue' : 'issues'} and {unanswered} unanswered customer{' '}
            {unanswered === 1 ? 'question' : 'questions'}. The roadmap below is the sequenced plan
            for fixing them — what to do, in what order, and why that order matters.
          </p>

          <div className="relative mt-6">
            <ul className="locked-content grid gap-3 sm:grid-cols-2" aria-hidden="true">
              {LOCKED_ITEMS.map(([title, description]) => (
                <li key={title} className="rounded-lg border p-4" style={{ background: 'var(--surface-0)' }}>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {description}
                  </p>
                </li>
              ))}
            </ul>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-28"
              style={{ background: 'linear-gradient(to top, var(--surface-1), transparent)' }}
              aria-hidden="true"
            />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={() => setOpen(true)}>
              Unlock your 90-day roadmap
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setOpen(true)}>
              Book a free 30-minute strategy session
            </Button>
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Unlocking also runs a deeper enrichment pass on your report at no cost to you.
          </p>
        </div>
      </div>

      {open && (
        <LeadDialog
          result={result}
          onClose={() => setOpen(false)}
          onUnlock={(leadId, bookingUrl) => {
            setOpen(false);
            onUnlock(leadId, bookingUrl);
          }}
        />
      )}
    </section>
  );
}

const BUDGETS = [
  'Not sure yet',
  'Under ₹1L / $1k per month',
  '₹1–3L / $1–4k per month',
  '₹3–8L / $4–10k per month',
  'Over ₹8L / $10k per month',
];

function LeadDialog({
  result, onClose, onUnlock,
}: {
  result: AuditResult;
  onClose: () => void;
  onUnlock: (leadId: string, bookingUrl: string | null) => void;
}) {
  const [form, setForm] = useState({
    name: '', company: result.brand.name, designation: '', email: '', phone: '', budgetBand: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auditId: result.auditId, ...form }),
      });
      const data = (await response.json()) as { id?: string; bookingUrl?: string | null; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      onUnlock(data.id, data.bookingUrl ?? null);
    } catch {
      setError('Network problem — please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: 'rgb(11 11 11 / 0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card
        className="animate-rise max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-xl"
        padded={false}
      >
        <form onSubmit={submit} className="p-6">
          <h2 id="lead-dialog-title" className="text-lg font-semibold tracking-tight">
            Unlock your roadmap
          </h2>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            We will send the full report to your inbox and open your 90-day plan straight away.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <input className={inputClass} style={inputStyle} value={form.name} onChange={set('name')} autoComplete="name" required />
            </Field>
            <Field label="Company" required>
              <input className={inputClass} style={inputStyle} value={form.company} onChange={set('company')} autoComplete="organization" required />
            </Field>
            <Field label="Designation">
              <input className={inputClass} style={inputStyle} value={form.designation} onChange={set('designation')} autoComplete="organization-title" />
            </Field>
            <Field label="Work email" required>
              <input className={inputClass} style={inputStyle} type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
            </Field>
            <Field label="Phone" hint="optional">
              <input className={inputClass} style={inputStyle} type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
            </Field>
            <Field label="Monthly marketing budget" hint="optional">
              <select className={inputClass} style={inputStyle} value={form.budgetBand} onChange={set('budgetBand')}>
                <option value="">Prefer not to say</option>
                {BUDGETS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
          </div>

          {error && (
            <p className="mt-3 text-sm" role="alert" style={{ color: 'var(--status-critical)' }}>{error}</p>
          )}

          <div className="mt-6 flex gap-3">
            <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
              {submitting ? 'Unlocking…' : 'Unlock my roadmap'}
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function BookingCta({ bookingUrl }: { bookingUrl: string | null }) {
  return (
    <section className="no-print">
      <Card className="text-center">
        <SectionHeading title="Book a free 30-minute visibility strategy session" />
        <p className="mx-auto -mt-2 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          We will walk through your report, show you what the competitor gap actually costs in
          pipeline, and give you the sequenced plan — whether or not you work with us.
        </p>
        {bookingUrl ? (
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block">
            <Button size="lg">Choose a time</Button>
          </a>
        ) : (
          <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Set <code>NEXT_PUBLIC_BOOKING_URL</code> to embed your Cal.com or Calendly link here.
          </p>
        )}
      </Card>
    </section>
  );
}
