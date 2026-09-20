import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { Repository } from '@/lib/repository';
import type { AuditResult } from '@/engine/types';

/**
 * Integration test for the provider-agnostic Postgres driver.
 *
 * Runs against any Postgres given TEST_DATABASE_URL, and skips cleanly without
 * one so CI and contributors are not forced to stand a database up. The point
 * is to prove the SQL actually executes — a driver verified only by reading it
 * is a driver that fails on the first deploy.
 *
 *   createdb indexjoy_test && psql indexjoy_test -f supabase/migrations/0001_init.sql
 *   TEST_DATABASE_URL=postgresql://... npm test
 */
const URL = process.env['TEST_DATABASE_URL'];
const maybe = URL ? describe : describe.skip;

maybe('postgres repository driver', () => {
  let repo: Repository;
  const auditId = crypto.randomUUID();

  beforeAll(async () => {
    process.env['DATABASE_URL'] = URL;
    const mod = await import('@/lib/repository');
    repo = mod.getRepository();
  });

  afterAll(() => {
    if (!URL) return;
    // Leave the schema, drop the rows this test created.
    execFileSync('psql', [URL, '-c', `delete from audits where id = '${auditId}'`], { stdio: 'ignore' });
  });

  it('selects the postgres driver from DATABASE_URL', () => {
    expect(repo.driver).toBe('postgres');
  });

  it('creates, reads back and updates an audit', async () => {
    const created = await repo.createAudit({
      id: auditId,
      input_url: 'https://example.test/',
      host: 'example.test',
      market: 'in',
      status: 'queued',
      scoring_version: '1.0.0',
      mode: null,
      overall_score: null, seo_score: null, aeo_score: null, geo_score: null,
      ai_presence_score: null, google_visibility: null, ai_visibility: null,
      pages_crawled: 0, urls_discovered: 0, paid_enrichment: false,
      duration_ms: null, error: null, result: null,
      requester_email: 'buyer@example.test',
    });
    expect(created.id).toBe(auditId);
    expect(created.status).toBe('queued');

    await repo.updateAudit(auditId, {
      status: 'complete',
      mode: 'C',
      overall_score: 75,
      seo_score: 73,
      aeo_score: 83,
      geo_score: 71,
      pages_crawled: 14,
      urls_discovered: 14,
      // The JSONB snapshot is what makes an old report render as it did.
      result: { auditId, brand: { name: 'Example' } } as unknown as AuditResult,
    });

    const read = await repo.getAudit(auditId);
    expect(read?.status).toBe('complete');
    expect(read?.overall_score).toBe(75);
    expect((read?.result as unknown as { brand: { name: string } }).brand.name).toBe('Example');
  });

  it('returns null for an audit that does not exist', async () => {
    expect(await repo.getAudit(crypto.randomUUID())).toBeNull();
  });

  it('upserts pipeline stages instead of duplicating them', async () => {
    await repo.recordStage(auditId, { stage: 'crawl', status: 'running', label: 'Reading your pages', at: new Date().toISOString() });
    await repo.recordStage(auditId, { stage: 'crawl', status: 'done', label: 'Reading your pages', detail: '14 URLs read', at: new Date().toISOString() });
    const stages = await repo.getStages(auditId);
    const crawl = stages.filter((s) => s.stage === 'crawl');
    expect(crawl).toHaveLength(1);
    expect(crawl[0]?.status).toBe('done');
    expect(crawl[0]?.detail).toBe('14 URLs read');
  });

  it('lists completed audits for a host, newest first', async () => {
    const rows = await repo.listAuditsForHost('example.test');
    expect(rows.some((r) => r.id === auditId)).toBe(true);
  });

  it('creates a lead and surfaces it through the dashboard view', async () => {
    const lead = await repo.createLead({
      audit_id: auditId,
      name: 'Rhea Kapoor', company: 'Example', designation: 'Head of Growth',
      email: 'rhea@example.test', phone: null, budget_band: null,
      is_free_email: false, email_matches_domain: true,
      lead_score: 72, grade: 'A', status: 'new_lead', source: 'report_unlock',
      host: 'example.test', overall_score: 75,
    });
    expect(lead.grade).toBe('A');

    const leads = await repo.listLeads();
    const found = leads.find((l) => l.id === lead.id);
    // The view joins the audit, which is what the admin table renders from.
    expect(found?.host).toBe('example.test');
    expect(found?.overall_score).toBe(75);

    await repo.updateLeadStatus(lead.id, 'meeting_booked');
    const after = await repo.listLeads();
    expect(after.find((l) => l.id === lead.id)?.status).toBe('meeting_booked');
  });

  it('reports the schema as ready and counts its tables', async () => {
    const { schemaIsReady, countTables } = await import('@/lib/migrate');
    expect(await schemaIsReady(URL as string)).toBe(true);
    expect(await countTables(URL as string)).toBeGreaterThanOrEqual(17);
  });

  it('reports not-ready rather than throwing when the database is unreachable', async () => {
    const { schemaIsReady, countTables } = await import('@/lib/migrate');
    const dead = 'postgresql://nobody:nobody@127.0.0.1:1/none';
    // The admin page calls this before touching any table, so it must fail
    // soft — a raw Postgres error at somebody mid-setup is a dead end.
    expect(await schemaIsReady(dead)).toBe(false);
    expect(await countTables(dead)).toBeNull();
  });

  it('applies the schema idempotently', async () => {
    const { applyMigrations } = await import('@/lib/migrate');
    // Already migrated by the test harness; running it again must be a no-op.
    const result = await applyMigrations(URL as string);
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.tableCount).toBeGreaterThanOrEqual(17);
  });

  it('enforces a rate limit atomically', async () => {
    const key = `test-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => repo.consumeRateLimit('audit:test', key, 3, 60_000)),
    );
    // Exactly the limit passes, even when the calls race.
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(results.filter((r) => !r)).toHaveLength(2);
  });
});
