import type { Availability, PerformanceData } from '../types';
import { fetchJson } from '../util/http';

/**
 * PageSpeed Insights v5. Free; 25,000 queries/day and 240/min with a key, and
 * there is no paid tier that raises the quota — so the audit budgets exactly
 * one call and caches aggressively.
 *
 * Field (CrUX) data is preferred; lab data is used as a labelled fallback so a
 * low-traffic site is never punished for having no real-user sample.
 */

interface PsiMetric {
  percentile?: number;
  category?: string;
}

interface PsiResponse {
  loadingExperience?: {
    metrics?: Record<string, PsiMetric>;
    overall_category?: string;
  };
  originLoadingExperience?: {
    metrics?: Record<string, PsiMetric>;
  };
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<string, { id: string; title: string; score: number | null; numericValue?: number }>;
  };
}

const LAB_AUDITS = [
  'largest-contentful-paint', 'cumulative-layout-shift', 'total-blocking-time',
  'server-response-time', 'viewport', 'font-size', 'tap-targets',
  'render-blocking-resources', 'uses-responsive-images', 'unused-javascript',
];

export async function fetchPerformance(
  url: string,
  apiKey: string | undefined,
  strategy: 'mobile' | 'desktop' = 'mobile',
): Promise<Availability<PerformanceData>> {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', strategy);
  for (const category of ['performance', 'seo', 'accessibility', 'best-practices']) {
    endpoint.searchParams.append('category', category);
  }
  if (apiKey) endpoint.searchParams.set('key', apiKey);

  // Lighthouse runs can legitimately take 30s+ on slow origins.
  const res = await fetchJson<PsiResponse>(endpoint.toString(), { timeoutMs: 60_000 });
  if (!res.ok || !res.data) {
    return { available: false, reason: res.error ? `PageSpeed Insights: ${res.error.slice(0, 160)}` : 'PageSpeed Insights unavailable' };
  }

  const data = res.data;
  const field = data.loadingExperience?.metrics ?? data.originLoadingExperience?.metrics;
  const audits = data.lighthouseResult?.audits ?? {};

  const hasField =
    Boolean(field?.['LARGEST_CONTENTFUL_PAINT_MS']?.percentile ?? field?.['CUMULATIVE_LAYOUT_SHIFT_SCORE']?.percentile);

  const auditSummary: PerformanceData['audits'] = {};
  for (const id of LAB_AUDITS) {
    const audit = audits[id];
    if (audit) auditSummary[id] = { score: audit.score, title: audit.title };
  }

  const labNumeric = (id: string): number | null => {
    const v = audits[id]?.numericValue;
    return typeof v === 'number' ? Math.round(v) : null;
  };

  return {
    available: true,
    data: {
      strategy,
      dataSource: hasField ? 'field' : 'lab',
      performanceScore: typeof data.lighthouseResult?.categories?.performance?.score === 'number'
        ? Math.round(data.lighthouseResult.categories.performance.score * 100)
        : null,
      lcpMs: hasField
        ? field?.['LARGEST_CONTENTFUL_PAINT_MS']?.percentile ?? null
        : labNumeric('largest-contentful-paint'),
      inpMs: hasField
        ? field?.['INTERACTION_TO_NEXT_PAINT']?.percentile
          ?? field?.['EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT']?.percentile
          ?? null
        : labNumeric('total-blocking-time'),
      cls: hasField
        ? (field?.['CUMULATIVE_LAYOUT_SHIFT_SCORE']?.percentile ?? 0) / 100
        : (audits['cumulative-layout-shift']?.numericValue ?? null),
      ttfbMs: hasField
        ? field?.['EXPERIMENTAL_TIME_TO_FIRST_BYTE']?.percentile ?? null
        : labNumeric('server-response-time'),
      audits: auditSummary,
    },
  };
}
