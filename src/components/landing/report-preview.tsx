'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A looping, animated miniature of a real report.
 *
 * This is the page's main credibility device. A marketer who has been pitched
 * by three agencies cannot evaluate a claim, but they can evaluate a screen —
 * so the fastest way to be believed is to show the actual output before
 * asking for anything. The numbers below are an example and the card says so.
 */

type Phase = 'crawling' | 'scoring' | 'findings' | 'hold';

const STAGES = [
  'Reading robots.txt and sitemap',
  'Crawling 25 pages',
  'Checking AI crawler access',
  'Running 41 visibility checks',
];

const PILLARS = [
  { label: 'SEO', score: 68, tone: 'var(--status-warning)' },
  { label: 'AEO', score: 34, tone: 'var(--status-critical)' },
  { label: 'GEO', score: 41, tone: 'var(--status-serious)' },
];

const FINDINGS = [
  { tone: 'critical', title: 'PerplexityBot and OAI-SearchBot are blocked', meta: 'geo.machine.ai_crawler_access' },
  { tone: 'critical', title: 'No Organization markup found on any page', meta: 'geo.entity.organization_schema' },
  { tone: 'warning', title: '3 of 19 question headings have an extractable answer', meta: 'aeo.answer.direct_answer_proximity' },
  { tone: 'warning', title: '12 high-intent questions your site never answers', meta: 'aeo.coverage.question_gap' },
] as const;

const TONE_VAR: Record<string, string> = {
  critical: 'var(--status-critical)',
  warning: 'var(--status-warning)',
  good: 'var(--status-good)',
};

const OVERALL = 47;

export function ReportPreview() {
  const [phase, setPhase] = useState<Phase>('crawling');
  const [stage, setStage] = useState(0);
  const [score, setScore] = useState(0);
  const [shownFindings, setShownFindings] = useState(0);
  const [reduced, setReduced] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const run = useCallback(() => {
    clearTimers();
    setPhase('crawling');
    setStage(0);
    setScore(0);
    setShownFindings(0);

    STAGES.forEach((_, i) => later(() => setStage(i + 1), 420 * (i + 1)));

    later(() => {
      setPhase('scoring');
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1100);
        setScore(Math.round(OVERALL * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 420 * STAGES.length + 250);

    later(() => setPhase('findings'), 420 * STAGES.length + 1500);
    FINDINGS.forEach((_, i) =>
      later(() => setShownFindings(i + 1), 420 * STAGES.length + 1700 + i * 420),
    );

    later(() => setPhase('hold'), 420 * STAGES.length + 1700 + FINDINGS.length * 420 + 400);
    // Long hold so the finished state — the part worth reading — is what a
    // visitor sees most of the time.
    later(run, 420 * STAGES.length + 1700 + FINDINGS.length * 420 + 7000);
  }, [clearTimers, later]);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (prefersReduced) {
      setReduced(true);
      setPhase('hold');
      setStage(STAGES.length);
      setScore(OVERALL);
      setShownFindings(FINDINGS.length);
      return;
    }
    run();
    return clearTimers;
  }, [run, clearTimers]);

  const showResult = phase !== 'crawling';

  return (
    <div
      className="w-full rounded-2xl border p-4 sm:p-5"
      style={{ background: 'var(--surface-1)', boxShadow: 'var(--shadow-lg)' }}
      aria-label="Example visibility report"
    >
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex gap-1" aria-hidden="true">
            {['#ec6a5e', '#f4bf4f', '#61c454'].map((c) => (
              <span key={c} className="h-2 w-2 rounded-full" style={{ background: c }} />
            ))}
          </span>
          <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
            acmeanalytics.com
          </span>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
        >
          Example
        </span>
      </div>

      {/* crawling */}
      {!showResult && (
        <ul className="space-y-2.5 py-6">
          {STAGES.map((label, i) => (
            <li key={label} className="flex items-center gap-2.5 text-sm">
              <span className="shrink-0">
                {i < stage ? <Tick /> : i === stage ? <Spinner /> : <Idle />}
              </span>
              <span style={{ color: i <= stage ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* result */}
      {showResult && (
        <div className="pt-4">
          <div className="flex items-center gap-4">
            <Ring score={score} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Largely invisible</p>
              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                AI assistants cannot reliably verify this brand.
              </p>
              <div className="mt-3 space-y-1.5">
                {PILLARS.map((p) => (
                  <div key={p.label} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {p.label}
                    </span>
                    <span
                      className="h-1.5 flex-1 overflow-hidden rounded-full"
                      style={{ background: 'var(--surface-3)' }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${p.score}%`,
                          background: p.tone,
                          transition: reduced ? 'none' : 'width .8s cubic-bezier(.22,1,.36,1)',
                        }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right text-[11px] tabular-nums">{p.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ul className="mt-4 space-y-px border-t pt-3">
            {FINDINGS.map((f, i) => (
              <li
                key={f.meta}
                className="flex items-start gap-2.5 rounded-md px-1 py-2"
                style={{
                  opacity: i < shownFindings ? 1 : 0,
                  transform: i < shownFindings ? 'none' : 'translateY(6px)',
                  transition: reduced ? 'none' : 'opacity .35s ease, transform .35s ease',
                }}
              >
                <span className="mt-0.5 shrink-0" style={{ color: TONE_VAR[f.tone] }}>
                  {f.tone === 'critical' ? <Cross /> : <Bang />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] leading-snug">{f.title}</span>
                  <code className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{f.meta}</code>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Ring({ score }: { score: number }) {
  const size = 78;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--status-serious)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums leading-none">{score}</span>
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>/100</span>
      </div>
    </div>
  );
}

const svg = { width: 15, height: 15, viewBox: '0 0 16 16', 'aria-hidden': true as const };

function Tick() {
  return (
    <svg {...svg}>
      <circle cx="8" cy="8" r="7" fill="var(--status-good)" />
      <path d="M4.5 8.2 6.8 10.5 11.5 5.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg {...svg} className="animate-spin">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--surface-3)" strokeWidth="2" />
      <path d="M8 1.5A6.5 6.5 0 0 1 14.5 8" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function Idle() {
  return <svg {...svg}><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--surface-3)" strokeWidth="2" /></svg>;
}
function Cross() {
  return <svg {...svg} viewBox="0 0 12 12" width="12" height="12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>;
}
function Bang() {
  return (
    <svg {...svg} viewBox="0 0 12 12" width="12" height="12">
      <path d="M6 2v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="6" cy="9.5" r="1" fill="currentColor" />
    </svg>
  );
}
