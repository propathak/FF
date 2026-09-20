'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuditResult, StageEvent } from '@/engine/types';
import { Button, Card } from '@/components/ui/primitives';
import { StageProgress } from './stage-progress';
import {
  CompetitorSection, IssueSections, MoneyOnTable, NotMeasuredSection, PillarGrid,
  QuestionGapSection, RecommendationSection, ScoreHeader,
} from './sections';
import { BookingCta } from './booking-cta';

interface AuditResponse {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  host: string;
  error: string | null;
  stages: StageEvent[];
  result: AuditResult | null;
  storage: 'memory' | 'supabase';
}

export function ReportView({ auditId, bookingUrl }: { auditId: string; bookingUrl: string | null }) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(`/api/audits/${auditId}`, { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = `/signin?callbackUrl=${encodeURIComponent(`/audit/${auditId}`)}`;
        return;
      }
      if (!response.ok) {
        setFetchError(response.status === 404 ? 'We could not find that audit.' : 'Could not load the audit.');
        return;
      }
      const json = (await response.json()) as AuditResponse;
      setData(json);
      if (json.status === 'queued' || json.status === 'running') {
        // Fast enough to feel live, slow enough not to hammer the function.
        timer.current = setTimeout(poll, 1200);
      }
    } catch {
      setFetchError('Network problem while loading the audit.');
    }
  }, [auditId]);

  useEffect(() => {
    void poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  if (fetchError) return <ErrorPanel title="Something went wrong" message={fetchError} />;

  if (!data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24">
        <div className="skeleton h-6 w-48 rounded" />
        <div className="skeleton mt-4 h-4 w-full rounded" />
        <div className="skeleton mt-2 h-4 w-3/4 rounded" />
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <ErrorPanel
        title="We could not audit that site"
        message={data.error ?? 'The audit failed for an unknown reason.'}
      />
    );
  }

  if (data.status !== 'complete' || !data.result) {
    return <StageProgress stages={data.stages} host={data.host} />;
  }

  const result = data.result;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-10">
      <ScoreHeader result={result} />

      <div className="mt-12 space-y-14">
        <PillarGrid pillars={result.pillars} mode={result.mode} />
        <MoneyOnTable result={result} />
        <QuestionGapSection result={result} />
        <CompetitorSection result={result} insights={result.competitorInsights} />
        <RecommendationSection recommendations={result.recommendations} />
        <IssueSections checks={result.checks} />
        <BookingCta bookingUrl={bookingUrl} />
        <NotMeasuredSection result={result} />
        <ReportActions result={result} />
      </div>

      {data.storage === 'memory' && (
        <p className="mt-10 rounded-lg border p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Running with the in-memory store — this report will not survive a restart. Set{' '}
          <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> for durable storage.
        </p>
      )}
    </div>
  );
}

function ReportActions({ result }: { result: AuditResult }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${result.brand.name} AI Visibility Report`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* the user dismissed the share sheet — nothing to report */
    }
  }

  const subject = encodeURIComponent(`${result.brand.name} — AI visibility report (${result.overall.score}/100)`);
  const body = encodeURIComponent(
    `${result.brand.name} scores ${result.overall.score}/100 for search and AI visibility.\n\n${result.narrative.verdict}\n\nFull report: ${typeof window === 'undefined' ? '' : window.location.href}`,
  );

  return (
    <section className="no-print">
      <Card>
        <h2 className="font-medium">{result.brand.name} AI Visibility Report</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Your brand scores {result.overall.score}/100 for AI search visibility.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}>Download PDF</Button>
          <a href={`mailto:?subject=${subject}&body=${body}`}>
            <Button variant="secondary">Email this report</Button>
          </a>
          <Button variant="secondary" onClick={share}>{copied ? 'Link copied' : 'Share'}</Button>
          <a href="/#audit"><Button variant="ghost">Re-run audit</Button></a>
        </div>
      </Card>
    </section>
  );
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <Card>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{message}</p>
        <a href="/#audit" className="mt-5 inline-block"><Button>Try another website</Button></a>
      </Card>
    </div>
  );
}
