'use client';

import { useId, useState } from 'react';
import type { CompetitorSummary } from '@/engine/types';

/**
 * Grouped horizontal bars: four pillars × (your brand + up to three competitors).
 *
 * Design decisions worth stating:
 *  - Categorical colour by *entity*, assigned in fixed slot order and never
 *    cycled, so filtering or reordering never repaints a brand.
 *  - Every bar is directly labelled with its value. Two of the light-mode
 *    series sit below 3:1 against the surface, and visible labels are the
 *    required relief for that — identity is never colour-alone.
 *  - A table view is always available beneath the chart.
 *  - Only pillars measured for BOTH sides are plotted. Comparing a measured
 *    score against an estimated one would be dishonest.
 */

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

interface Row {
  label: string;
  key: 'seo' | 'aeo' | 'geo' | 'overall';
}

const ROWS: Row[] = [
  { label: 'Overall', key: 'overall' },
  { label: 'SEO', key: 'seo' },
  { label: 'AEO', key: 'aeo' },
  { label: 'GEO', key: 'geo' },
];

export interface ChartEntity {
  /** Stable within a chart. Hosts can repeat (subdomains, duplicate entries),
   *  so the display name is not safe as a React key or a hover identity. */
  id: string;
  name: string;
  seo: number | null;
  aeo: number | null;
  geo: number | null;
  overall: number | null;
  isYou: boolean;
}

export function toChartEntities(
  own: { host: string; seo: number | null; aeo: number | null; geo: number | null; overall: number },
  competitors: CompetitorSummary[],
): ChartEntity[] {
  return [
    { id: 'you', name: own.host, seo: own.seo, aeo: own.aeo, geo: own.geo, overall: own.overall, isYou: true },
    ...competitors
      .filter((c) => c.status === 'ok')
      .slice(0, 3)
      .map((c, index) => ({
        id: `competitor-${index}`,
        name: c.host, seo: c.seo, aeo: c.aeo, geo: c.geo, overall: c.overall, isYou: false,
      })),
  ];
}

export function CompetitorChart({ entities }: { entities: ChartEntity[] }) {
  const [showTable, setShowTable] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const titleId = useId();

  if (entities.length < 2) return null;

  const barHeight = 14;
  const barGap = 2; // 2px surface gap between adjacent bars

  return (
    <figure className="m-0">
      <figcaption id={titleId} className="sr-only">
        Visibility scores compared across your brand and competitors, by pillar, out of 100.
      </figcaption>

      {/* Legend — always present for two or more series. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {entities.map((entity, i) => (
          <span key={entity.id} className="inline-flex items-center gap-2 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: SERIES[i % SERIES.length] }}
              aria-hidden="true"
            />
            <span style={{ color: entity.isYou ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {entity.name}
              {entity.isYou && <span className="ml-1 font-medium">(you)</span>}
            </span>
          </span>
        ))}
      </div>

      <div className="space-y-5" role="img" aria-labelledby={titleId}>
        {ROWS.map((row) => {
          const values = entities.map((e) => e[row.key]);
          if (values.every((v) => v === null)) return null;
          return (
            <div key={row.key}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm font-medium">{row.label}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>out of 100</span>
              </div>
              <div className="flex flex-col" style={{ gap: barGap }}>
                {entities.map((entity, i) => {
                  const value = entity[row.key];
                  const dim = hovered !== null && hovered !== entity.id;
                  return (
                    <div
                      key={entity.id}
                      className="flex items-center gap-2"
                      onMouseEnter={() => setHovered(entity.id)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <div
                        className="relative flex-1 rounded-sm"
                        style={{ height: barHeight, background: 'var(--surface-2)' }}
                      >
                        {value !== null && (
                          <div
                            className="h-full transition-all duration-500 ease-out"
                            style={{
                              width: `${Math.max(value, 1)}%`,
                              background: SERIES[i % SERIES.length],
                              // 4px rounded data-end anchored to the baseline
                              borderRadius: '2px 4px 4px 2px',
                              opacity: dim ? 0.35 : 1,
                            }}
                          />
                        )}
                      </div>
                      {/* Direct value label — required relief for the light-mode
                          contrast warning, and it removes the need to read the
                          bar against a gridline. */}
                      <span
                        className="w-16 shrink-0 text-right text-xs tabular-nums"
                        style={{
                          color: entity.isYou ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontWeight: entity.isYou ? 600 : 400,
                        }}
                      >
                        {value === null ? 'n/a' : value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowTable((s) => !s)}
        className="no-print mt-5 text-xs underline underline-offset-2"
        style={{ color: 'var(--text-secondary)' }}
        aria-expanded={showTable}
      >
        {showTable ? 'Hide' : 'Show'} the numbers as a table
      </button>

      {showTable && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Brand</th>
                {ROWS.map((r) => (
                  <th key={r.key} className="py-2 pr-4 text-right font-medium">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => (
                <tr key={entity.id} className="border-b">
                  <td className="py-2 pr-4" style={{ fontWeight: entity.isYou ? 600 : 400 }}>
                    {entity.name}{entity.isYou ? ' (you)' : ''}
                  </td>
                  {ROWS.map((r) => (
                    <td key={r.key} className="py-2 pr-4 text-right tabular-nums">
                      {entity[r.key] ?? 'n/a'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            Competitor scores are computed from the same deterministic checks, crawling up to 10
            pages each. Pillars we could not measure for a site show as &ldquo;n/a&rdquo; rather
            than an estimate.
          </p>
        </div>
      )}
    </figure>
  );
}
