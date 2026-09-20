import { runAudit } from '@/engine/pipeline';
import { SCORING_VERSION } from '@/engine/config';
import { normaliseInputUrl } from '@/engine/util/url';
import { getRepository, type AuditRow } from './repository';
import { recordAudit } from './sheets';
import { scoreLead, signalsFromAudit } from './lead-score';

/**
 * Job orchestration.
 *
 * Each stage checkpoints into `audit_stages` as it completes, so a function
 * timeout can be resumed rather than restarted. That matters because Vercel's
 * function ceiling depends on plan and Fluid-compute configuration, and we do
 * not want correctness to depend on a billing tier.
 */

export interface StartAuditInput {
  url: string;
  email?: string;
  market?: string;
  competitorUrls?: string[];
  /** Paid enrichment fires only for qualified (email-captured) runs. */
  enablePaidEnrichment?: boolean;
}

export function newAuditId(): string {
  return crypto.randomUUID();
}

export async function createAuditRecord(input: StartAuditInput, auditId: string): Promise<AuditRow> {
  const repo = getRepository();
  const normalised = normaliseInputUrl(input.url, {
    allowLocal: process.env['AUDIT_ALLOW_LOCAL'] === '1',
  });
  if (!normalised) throw new Error('Invalid website address');

  return repo.createAudit({
    id: auditId,
    input_url: normalised,
    host: new URL(normalised).hostname,
    market: input.market ?? 'global',
    status: 'queued',
    scoring_version: SCORING_VERSION,
    mode: null,
    overall_score: null, seo_score: null, aeo_score: null, geo_score: null,
    ai_presence_score: null, google_visibility: null, ai_visibility: null,
    pages_crawled: 0, urls_discovered: 0,
    paid_enrichment: input.enablePaidEnrichment === true,
    duration_ms: null, error: null, result: null,
    requester_email: input.email ?? null,
  });
}

/**
 * Executes the pipeline and persists the outcome. Intended to run after the
 * HTTP response has flushed (`after()` in a route handler, or a worker in
 * Phase 3) — the engine itself has no opinion about which.
 */
export async function executeAudit(auditId: string, input: StartAuditInput): Promise<void> {
  const repo = getRepository();
  await repo.updateAudit(auditId, { status: 'running' });

  try {
    const result = await runAudit(
      {
        auditId,
        url: input.url,
        market: input.market,
        competitorUrls: input.competitorUrls,
        enablePaidEnrichment: input.enablePaidEnrichment,
      },
      {
        env: process.env as Record<string, string | undefined>,
        onStage: (event) => {
          // Fire-and-forget: a checkpoint write must never fail the audit.
          void repo.recordStage(auditId, event).catch(() => undefined);
        },
      },
    );

    const pillar = (id: string) => result.pillars.find((p) => p.pillar === id)?.score ?? null;

    await repo.updateAudit(auditId, {
      status: 'complete',
      mode: result.mode,
      overall_score: result.overall.score,
      seo_score: pillar('seo'),
      aeo_score: pillar('aeo'),
      geo_score: pillar('geo'),
      ai_presence_score: pillar('ai'),
      google_visibility: result.overall.googleVisibility,
      ai_visibility: result.overall.aiVisibility,
      pages_crawled: result.stats.pagesCrawled,
      urls_discovered: result.stats.urlsDiscovered,
      duration_ms: result.durationMs,
      result,
      completed_at: new Date().toISOString(),
    });

    // Log to the sheet after the database write, and never let it fail the
    // audit: Postgres is the source of truth and the sheet is a reporting
    // surface that can be rebuilt from it.
    if (input.email) {
      const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? '';
      // The grade comes free from data we already hold — no form required.
      const grade = scoreLead(signalsFromAudit(result, input.email, false)).grade;
      void recordAudit({
        email: input.email,
        website: result.target.host,
        market: result.target.market,
        overall: result.overall.score,
        seo: pillar('seo'),
        aeo: pillar('aeo'),
        geo: pillar('geo'),
        googleVisibility: result.overall.googleVisibility,
        aiVisibility: result.overall.aiVisibility,
        pagesCrawled: result.stats.pagesCrawled,
        criticalCount: result.stats.criticalCount,
        leadGrade: grade,
        reportUrl: appUrl ? `${appUrl}/audit/${auditId}` : auditId,
      }).catch(() => undefined);
    }
  } catch (err) {
    await repo.updateAudit(auditId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    });
  }
}

/** Coarse hash so we can rate-limit by IP without storing one. */
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`indexjoy:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}
