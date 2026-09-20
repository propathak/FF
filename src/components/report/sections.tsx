'use client';

import { useState } from 'react';
import type {
  AuditResult, CheckResult, PillarScore, Recommendation,
} from '@/engine/types';
import { Badge, Card, NotMeasured, SectionHeading, StatusIcon, cn, type StatusTone } from '@/components/ui/primitives';
import { ScoreBar, ScoreRing, toneForScore } from '@/components/ui/score-ring';
import { CompetitorChart, toChartEntities } from '@/components/ui/competitor-chart';

const PILLAR_BLURB: Record<string, string> = {
  seo: 'Whether search engines can crawl, index and rank you.',
  aeo: 'Whether answer engines can extract a clean answer from your pages.',
  geo: 'Whether AI systems can understand, verify and cite your brand.',
  ai: 'Whether your brand actually appears in AI answers.',
};

// ---------------------------------------------------------------------------

export function ScoreHeader({ result }: { result: AuditResult }) {
  const { overall, brand, target } = result;
  return (
    <header className="border-b pb-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{brand.name}</h1>
        <a
          href={target.url}
          rel="noopener noreferrer nofollow"
          target="_blank"
          className="text-sm underline underline-offset-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {target.host}
        </a>
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        {new Date(result.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
        {' · '}{result.stats.pagesCrawled} of {result.stats.urlsDiscovered} URLs sampled
        {' · '}scoring v{result.scoringVersion}
      </p>

      <div className="mt-7 flex flex-col gap-7 sm:flex-row sm:items-center">
        <ScoreRing score={overall.score} size={148} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone={toneForScore(overall.score)} icon={<StatusIcon tone={toneForScore(overall.score)} />}>
              {overall.band.label}
            </Badge>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Overall visibility</span>
          </div>
          <p className="mt-3 text-pretty text-base leading-relaxed sm:text-lg">
            {result.narrative.verdict}
          </p>
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            {overall.compositeNote}
          </p>
        </div>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <RollUp
          label="Google visibility"
          value={overall.googleVisibility}
          note="SEO 65% + AEO 35%"
        />
        <RollUp
          label={overall.mode === 'C' ? 'AI citation readiness' : 'AI visibility'}
          value={overall.aiVisibility}
          note={
            overall.mode === 'C'
              ? 'Estimated from your site and entity signals — not a measurement of AI answers'
              : 'GEO 60% + AEO 25% + measured AI presence 15%'
          }
          estimated={overall.mode === 'C'}
        />
      </div>
    </header>
  );
}

function RollUp({
  label, value, note, estimated,
}: { label: string; value: number; note: string; estimated?: boolean }) {
  return (
    <Card className="flex items-center gap-4">
      <ScoreRing score={value} size={64} animate={false} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          {estimated && (
            <Badge tone="neutral">Estimated</Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{note}</p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function PillarGrid({ pillars, mode }: { pillars: PillarScore[]; mode: string }) {
  return (
    <section>
      <SectionHeading
        title="Your four pillars"
        description="Each pillar is scored from its own checks. Coverage tells you how much of it we could actually measure."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pillars.map((pillar) => {
          const isEstimatedAi = pillar.pillar === 'ai' && mode === 'C';
          return (
            <Card key={pillar.pillar} className="flex flex-col items-center text-center">
              <ScoreRing score={pillar.score} size={104} />
              <p className="mt-3 font-medium">{pillar.label}</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {PILLAR_BLURB[pillar.pillar]}
              </p>
              <div className="mt-3">
                {pillar.score === null ? (
                  <NotMeasured
                    reason={
                      isEstimatedAi
                        ? 'AI answer sampling is not enabled for this audit.'
                        : `Only ${Math.round(pillar.coverage * 100)}% of this pillar could be measured.`
                    }
                  />
                ) : pillar.coverage < 0.7 ? (
                  <Badge tone="warning" icon={<StatusIcon tone="warning" />}>
                    Partial — {Math.round(pillar.coverage * 100)}% measured
                  </Badge>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {Math.round(pillar.coverage * 100)}% measured
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

export function MoneyOnTable({ result }: { result: AuditResult }) {
  if (result.translations.length === 0) return null;
  return (
    <section>
      <SectionHeading
        eyebrow="What this is costing you"
        title="Money left on the table"
        description="The same findings, stated as business consequences. Technical detail is underneath each one."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {result.translations.map((item) => {
          const tone: StatusTone =
            item.severity === 'critical' ? 'critical' : item.severity === 'warning' ? 'warning' : 'accent';
          return (
            <Card key={item.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <span className="mt-1 shrink-0" style={{ color: `var(--status-${item.severity === 'opportunity' ? 'warning' : item.severity})` }}>
                  <StatusIcon tone={tone} />
                </span>
                <h3 className="text-base font-medium leading-snug">{item.headline}</h3>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {item.business}
              </p>
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                  Technical detail
                </summary>
                <p className="mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.technical}
                </p>
                <code className="mt-2 block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {item.checkIds.join(', ')}
                </code>
              </details>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const STATUS_GROUPS = [
  { status: 'fail' as const, title: 'Critical issues', tone: 'critical' as StatusTone, note: 'Actively costing you visibility right now.' },
  { status: 'warn' as const, title: 'Warnings', tone: 'warning' as StatusTone, note: 'Present but weak, partial or inconsistent.' },
  { status: 'opportunity' as const, title: 'Opportunities', tone: 'accent' as StatusTone, note: 'Nothing is broken — this is simply unexploited.' },
  { status: 'pass' as const, title: "What you're doing well", tone: 'good' as StatusTone, note: 'Healthy signals worth defending.' },
];

export function IssueSections({ checks }: { checks: CheckResult[] }) {
  return (
    <section>
      <SectionHeading
        title="Every finding, with its evidence"
        description="Each check shows what we observed and the artefact behind it, so you can verify any score yourself."
      />
      <div className="space-y-4">
        {STATUS_GROUPS.map((group) => {
          const items = checks.filter((c) => c.status === group.status);
          if (items.length === 0) return null;
          return (
            <Card key={group.status} padded={false}>
              <div className="flex items-start justify-between gap-4 border-b p-5">
                <div>
                  <h3 className="flex items-center gap-2 font-medium">
                    <span style={{ color: `var(--status-${group.tone === 'accent' ? 'good' : group.tone})` }}>
                      <StatusIcon tone={group.tone} />
                    </span>
                    {group.title}
                  </h3>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{group.note}</p>
                </div>
                <Badge tone={group.tone}>{items.length}</Badge>
              </div>
              <ul className="divide-y">
                {items.map((check) => <CheckRow key={check.id} check={check} />)}
              </ul>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false);
  const tone: StatusTone =
    check.status === 'fail' ? 'critical'
      : check.status === 'warn' ? 'warning'
        : check.status === 'pass' ? 'good' : 'accent';

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[var(--surface-2)]"
        aria-expanded={open}
      >
        <span className="mt-1 shrink-0" style={{ color: `var(--status-${tone === 'accent' ? 'good' : tone})` }}>
          <StatusIcon tone={tone} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{check.title}</span>
            {check.confidence < 0.8 && (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                lower confidence ({Math.round(check.confidence * 100)}%)
              </span>
            )}
          </span>
          <span className="mt-1 block text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {check.summary}
          </span>
        </span>
        <span
          className="mt-1 shrink-0 transition-transform"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(90deg)' : 'none' }}
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="animate-rise px-4 pb-4 pl-11">
          <dl className="grid gap-2 text-xs">
            {check.evidence.map((item, i) => (
              <div key={i} className="flex flex-wrap gap-x-2 gap-y-0.5">
                {item.kind === 'url' && (
                  <>
                    <dt style={{ color: 'var(--text-muted)' }}>{item.note ?? 'URL'}:</dt>
                    <dd className="min-w-0 break-all">
                      <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                        {item.url}
                      </a>
                    </dd>
                  </>
                )}
                {item.kind === 'text' && (
                  <><dt style={{ color: 'var(--text-muted)' }}>{item.label}:</dt><dd className="break-words">{item.value}</dd></>
                )}
                {item.kind === 'count' && (
                  <>
                    <dt style={{ color: 'var(--text-muted)' }}>{item.label}:</dt>
                    <dd className="tabular-nums">{item.value}{item.of !== undefined ? ` of ${item.of}` : ''}</dd>
                  </>
                )}
                {item.kind === 'metric' && (
                  <>
                    <dt style={{ color: 'var(--text-muted)' }}>{item.label}:</dt>
                    <dd className="tabular-nums">
                      {item.value}{item.unit ?? ''}{item.source ? ` (${item.source})` : ''}
                    </dd>
                  </>
                )}
                {item.kind === 'list' && (
                  <>
                    <dt style={{ color: 'var(--text-muted)' }}>{item.label}:</dt>
                    <dd className="break-words">{item.values.join(', ') || '—'}</dd>
                  </>
                )}
              </div>
            ))}
          </dl>
          {check.affectedUrls.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                {check.affectedUrls.length} affected URL{check.affectedUrls.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-1.5 space-y-0.5">
                {check.affectedUrls.map((url) => (
                  <li key={url} className="break-all" style={{ color: 'var(--text-secondary)' }}>{url}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="mt-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <code>{check.id}</code> · weight {check.weight} · score {check.score.toFixed(2)}
          </p>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

export function QuestionGapSection({ result }: { result: AuditResult }) {
  const unanswered = result.questionGaps.filter((g) => !g.answered);
  const answered = result.questionGaps.filter((g) => g.answered);
  if (result.questionGaps.length === 0) return null;

  return (
    <section>
      <SectionHeading
        eyebrow="Demand you are not serving"
        title={
          unanswered.length === 1
            ? 'One question your customers are asking that your website does not answer'
            : `${unanswered.length} questions your customers are asking that your website does not answer`
        }
        description={`We generated a question set for your category, then searched your crawled pages for each one. Your site answers ${answered.length} of ${result.questionGaps.length}.`}
      />
      <Card padded={false}>
        <ul className="divide-y">
          {unanswered.map((gap) => (
            <li key={gap.question} className="flex items-center justify-between gap-4 p-4">
              <span className="text-sm">{gap.question}</span>
              <Badge tone="neutral">{gap.intent.replace('_', ' ')}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      {answered.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            Questions your site already answers ({answered.length})
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {answered.map((gap) => (
              <li key={gap.question} className="flex flex-wrap items-baseline gap-2">
                <span style={{ color: 'var(--status-good)' }}><StatusIcon tone="good" /></span>
                {gap.question}
                {gap.matchedUrl && (
                  <a href={gap.matchedUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-xs underline underline-offset-2">
                    {gap.matchedUrl}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

export function CompetitorSection({
  result, insights,
}: { result: AuditResult; insights: string[] }) {
  const ok = result.competitors.filter((c) => c.status === 'ok');
  const failed = result.competitors.filter((c) => c.status === 'failed');

  if (result.competitors.length === 0) {
    return (
      <section>
        <SectionHeading title="Competitor comparison" />
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No competitors were supplied, so there is nothing to compare against. Re-run the audit
            with up to three competitor websites and we will score them against the identical
            checks — we would rather ask you than guess who you compete with.
          </p>
        </Card>
      </section>
    );
  }

  const seo = result.pillars.find((p) => p.pillar === 'seo')?.score ?? null;
  const aeo = result.pillars.find((p) => p.pillar === 'aeo')?.score ?? null;
  const geo = result.pillars.find((p) => p.pillar === 'geo')?.score ?? null;

  return (
    <section>
      <SectionHeading
        title="How you compare"
        description="Competitors are scored with the same deterministic checks, on free signals only, so the comparison is like for like."
      />
      {ok.length > 0 && (
        <Card>
          <CompetitorChart
            entities={toChartEntities(
              { host: result.target.host, seo, aeo, geo, overall: result.overall.score },
              result.competitors,
            )}
          />
        </Card>
      )}
      {insights.length > 0 && (
        <ul className="mt-4 space-y-2">
          {insights.map((insight) => (
            <li key={insight} className="flex gap-2.5 text-sm leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden="true" />
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      )}
      {failed.length > 0 && (
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Could not audit: {failed.map((c) => `${c.host} (${c.error})`).join('; ')}.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

const HORIZONS = [
  { key: 'now' as const, title: 'Fix immediately', note: 'High-impact problems that are actively suppressing you.' },
  { key: '30d' as const, title: 'Next 30 days', note: 'Content and structural optimisation.' },
  { key: '90d' as const, title: 'Next 90 days', note: 'Authority building and AI visibility strategy.' },
];

export function RecommendationSection({
  recommendations,
}: { recommendations: Recommendation[] }) {
  return (
    <section>
      <SectionHeading
        title="Your action plan"
        description="Ordered by how much visibility each fix actually recovers. Impact and effort are assigned by rule, not by an AI."
      />
      <div className="space-y-6">
        {HORIZONS.map((horizon) => {
          const items = recommendations.filter((r) => r.horizon === horizon.key);
          if (items.length === 0) return null;
          return (
            <div key={horizon.key}>
              <div className="mb-3 flex items-baseline gap-3">
                <h3 className="font-medium">{horizon.title}</h3>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{horizon.note}</span>
              </div>
              <div className="grid gap-3">
                {items.map((rec) => (
                  <RecommendationCard key={rec.id} rec={rec} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h4 className="font-medium">{rec.title}</h4>
        <div className="flex shrink-0 gap-2">
          <Badge tone={rec.impact === 'High' ? 'good' : rec.impact === 'Medium' ? 'warning' : 'neutral'}>
            Impact: {rec.impact}
          </Badge>
          <Badge tone={rec.effort === 'Low' ? 'good' : rec.effort === 'Medium' ? 'warning' : 'serious'}>
            Effort: {rec.effort}
          </Badge>
        </div>
      </div>
      <dl className="mt-3 space-y-2.5 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Problem</dt>
          <dd className="mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rec.problem}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Why it matters</dt>
          <dd className="mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rec.whyItMatters}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Recommended action
          </dt>
          <dd className="mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {rec.action}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function NotMeasuredSection({ result }: { result: AuditResult }) {
  return (
    <section>
      <SectionHeading
        title="What we could not measure"
        description="Listed here rather than estimated into your score. Unmeasured signals are removed from both sides of the scoring fraction so they cannot drag your score down."
      />
      <Card padded={false}>
        <ul className="divide-y text-sm">
          {result.notMeasured.map((item) => (
            <li key={item.label} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="w-full shrink-0 font-medium sm:w-64">{item.label}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{item.reason}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

export { ScoreBar };
