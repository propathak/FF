'use client';

import type { StageEvent } from '@/engine/types';

const ORDER = ['discovery', 'crawl', 'parse', 'enrich', 'analyse', 'score', 'interpret', 'recommend'] as const;

const FALLBACK_LABELS: Record<string, string> = {
  discovery: 'Checking how your site is set up',
  crawl: 'Reading your pages',
  parse: 'Working out who your brand is',
  enrich: 'Gathering outside evidence',
  analyse: 'Running visibility checks',
  score: 'Scoring',
  interpret: 'Writing up what it means',
  recommend: 'Building your action plan',
};

/**
 * Stage-by-stage progress with real findings streaming in.
 *
 * This exists because time-to-first-insight is the funnel: a 45-second spinner
 * loses most visitors, while a list of stages completing with actual detail
 * ("18 pages read", "3 critical issues") holds them.
 */
export function StageProgress({ stages, host }: { stages: StageEvent[]; host: string }) {
  const byStage = new Map(stages.map((s) => [s.stage, s]));
  const doneCount = stages.filter((s) => s.status === 'done').length;

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Auditing</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{host}</h1>

      <div
        className="mt-6 h-1 overflow-hidden rounded-full"
        style={{ background: 'var(--surface-3)' }}
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={ORDER.length}
        aria-label="Audit progress"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${(doneCount / ORDER.length) * 100}%`, background: 'var(--accent)' }}
        />
      </div>

      <ol className="mt-8 space-y-3">
        {ORDER.map((stage) => {
          const event = byStage.get(stage);
          const status = event?.status ?? 'pending';
          const isDone = status === 'done';
          const isRunning = status === 'running';
          return (
            <li key={stage} className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                {isDone ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" fill="var(--status-good)" />
                    <path d="M4.5 8.2 6.8 10.5 11.5 5.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : isRunning ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" className="animate-spin" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--surface-3)" strokeWidth="2" />
                    <path d="M8 1.5A6.5 6.5 0 0 1 14.5 8" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--surface-3)" strokeWidth="2" />
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <p
                  className="text-sm"
                  style={{
                    color: isDone || isRunning ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: isRunning ? 500 : 400,
                  }}
                >
                  {event?.label ?? FALLBACK_LABELS[stage]}
                </p>
                {event?.detail && (
                  <p className="animate-rise mt-0.5 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {event.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-10 text-xs" style={{ color: 'var(--text-muted)' }}>
        We crawl politely: your robots.txt is honoured, requests are rate-limited, and our crawler
        identifies itself with a contactable user agent.
      </p>
    </div>
  );
}
