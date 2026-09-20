'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, inputClass, inputStyle } from './ui/primitives';

const MARKETS = [
  { value: 'global', label: 'Global' },
  { value: 'in', label: 'India' },
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'ae', label: 'UAE' },
  { value: 'au', label: 'Australia' },
  { value: 'ca', label: 'Canada' },
  { value: 'sg', label: 'Singapore' },
];

export function AuditForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [market, setMarket] = useState('global');
  const [competitors, setCompetitors] = useState(['', '', '']);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!url.trim()) {
      setError('Enter the website you want to check.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          email: email.trim(),
          market,
          competitorUrls: competitors.map((c) => c.trim()).filter(Boolean),
        }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? 'We could not start that audit. Please try again.');
        setSubmitting(false);
        return;
      }
      router.push(`/audit/${data.id}`);
    } catch {
      setError('Network problem — please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div
        className="rounded-2xl border p-5 sm:p-6"
        style={{ background: 'var(--surface-1)', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
          <Field label="Your website" required>
            <input
              className={inputClass}
              style={inputStyle}
              type="text"
              inputMode="url"
              autoComplete="url"
              placeholder="yourcompany.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={Boolean(error)}
            />
          </Field>
          <Field label="Work email" hint="for your report">
            <input
              className={inputClass}
              style={inputStyle}
              type="email"
              autoComplete="email"
              placeholder="you@yourcompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          aria-expanded={expanded}
        >
          <svg
            width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
            style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}
          >
            <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Add competitors and market (optional)
        </button>

        {expanded && (
          <div className="animate-rise mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Competitors" hint="up to 3">
              <div className="space-y-2">
                {competitors.map((value, index) => (
                  <input
                    key={index}
                    className={inputClass}
                    style={inputStyle}
                    type="text"
                    placeholder={`competitor${index + 1}.com`}
                    value={value}
                    onChange={(e) => {
                      const next = [...competitors];
                      next[index] = e.target.value;
                      setCompetitors(next);
                    }}
                    aria-label={`Competitor ${index + 1}`}
                  />
                ))}
              </div>
            </Field>
            <Field label="Primary market">
              <select
                className={inputClass}
                style={inputStyle}
                value={market}
                onChange={(e) => setMarket(e.target.value)}
              >
                {MARKETS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm" role="alert" style={{ color: 'var(--status-critical)' }}>
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-5 w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Spinner /> Starting your audit…
            </>
          ) : (
            'Check my visibility'
          )}
        </Button>

        <p className="mt-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          No signup. No card. Results in under a minute.
        </p>
      </div>
    </form>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
