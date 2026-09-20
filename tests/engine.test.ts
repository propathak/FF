import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { runAudit } from '@/engine/pipeline';
import {
  challengedSite, clientRenderedSite, goodSite, poorSite, startFixtureServer,
  type FixtureServer,
} from './fixtures/site';

const ENV = { AUDIT_ALLOW_LOCAL: '1' };

describe('audit pipeline (end to end against a fixture site)', () => {
  let good: FixtureServer;
  let poor: FixtureServer;

  beforeAll(async () => {
    good = await startFixtureServer(goodSite());
    poor = await startFixtureServer(poorSite());
  });
  afterAll(async () => {
    await good.close();
    await poor.close();
  });

  it('crawls, scores and explains a well-optimised site', async () => {
    const result = await runAudit(
      { auditId: 'test-good', url: good.origin, maxPages: 12 },
      { env: ENV },
    );

    expect(result.stats.pagesCrawled).toBeGreaterThan(4);
    expect(result.brand.name).toBe('Acme Analytics');
    expect(result.brand.category).toContain('product analytics');

    const seo = result.pillars.find((p) => p.pillar === 'seo');
    const aeo = result.pillars.find((p) => p.pillar === 'aeo');
    const geo = result.pillars.find((p) => p.pillar === 'geo');
    expect(seo?.score ?? 0).toBeGreaterThan(55);
    expect(aeo?.score ?? 0).toBeGreaterThan(60);
    expect(geo?.score ?? 0).toBeGreaterThan(45);
    expect(result.overall.score).toBeGreaterThan(50);

    // Every score must be traceable to evidence.
    for (const check of result.checks) {
      expect(check.id).toMatch(/^(seo|aeo|geo|ai)\./);
      expect(check.score).toBeGreaterThanOrEqual(0);
      expect(check.score).toBeLessThanOrEqual(1);
      expect(check.summary.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('recognises entity and answer structure on the good site', async () => {
    const result = await runAudit({ auditId: 'test-good-2', url: good.origin, maxPages: 12 }, { env: ENV });
    const byId = new Map(result.checks.map((c) => [c.id, c]));

    expect(byId.get('geo.entity.organization_schema')?.status).toBe('pass');
    expect(byId.get('geo.entity.sameas')?.status).toBe('pass');
    expect(byId.get('aeo.answer.direct_answer_proximity')?.score ?? 0).toBeGreaterThan(0.6);
    expect(byId.get('aeo.schema.faq')?.status).not.toBe('fail');
    expect(byId.get('geo.content.comparisons')?.status).not.toBe('opportunity');
    expect(byId.get('geo.content.original_research')?.status).toBe('pass');
    // Blocking GPTBot (training) must never be a failure.
    expect(byId.get('geo.machine.ai_crawler_access')?.status).toBe('pass');
  }, 60_000);

  it('scores a poorly-optimised site far lower and names the AI crawler block', async () => {
    const result = await runAudit({ auditId: 'test-poor', url: poor.origin, maxPages: 8 }, { env: ENV });
    const byId = new Map(result.checks.map((c) => [c.id, c]));

    expect(result.overall.score).toBeLessThan(45);
    expect(byId.get('geo.machine.ai_crawler_access')?.status).toBe('fail');
    expect(byId.get('geo.machine.ai_crawler_access')?.summary).toMatch(/OAI-SearchBot|PerplexityBot/);
    expect(byId.get('geo.entity.organization_schema')?.status).toBe('fail');
    expect(byId.get('seo.onpage.title_duplicates')?.status).not.toBe('pass');
    expect(byId.get('seo.index.sitemap')?.status).toBe('fail');

    // The report must translate this into business language.
    expect(result.translations.some((t) => /AI assistants are locked out/i.test(t.headline))).toBe(true);
  }, 60_000);

  it('produces a strictly better score for the good site than the poor site', async () => {
    const [a, b] = await Promise.all([
      runAudit({ auditId: 'cmp-good', url: good.origin, maxPages: 10 }, { env: ENV }),
      runAudit({ auditId: 'cmp-poor', url: poor.origin, maxPages: 8 }, { env: ENV }),
    ]);
    expect(a.overall.score).toBeGreaterThan(b.overall.score + 20);
  }, 90_000);

  it('never invents a score for a site it could not read', async () => {
    const blocked = await startFixtureServer([
      { path: '/', status: 403, body: 'Forbidden' },
      { path: '/robots.txt', status: 403, contentType: 'text/plain', body: 'Forbidden' },
    ]);
    try {
      await expect(
        runAudit({ auditId: 'test-blocked', url: blocked.origin, maxPages: 5 }, { env: ENV }),
      ).rejects.toThrow(/blocking automated access|could not read/i);
    } finally {
      await blocked.close();
    }
  }, 30_000);

  it('emits every pipeline stage in order', async () => {
    const stages: string[] = [];
    await runAudit(
      { auditId: 'test-stages', url: good.origin, maxPages: 6 },
      { env: ENV, onStage: (e) => { if (e.status === 'done') stages.push(e.stage); } },
    );
    expect(stages).toEqual(['discovery', 'crawl', 'parse', 'enrich', 'analyse', 'score', 'interpret', 'recommend']);
  }, 60_000);

  it('compares a competitor using the same deterministic checks', async () => {
    const result = await runAudit(
      { auditId: 'test-competitor', url: good.origin, competitorUrls: [poor.origin], maxPages: 8, maxCompetitorPages: 5 },
      { env: ENV },
    );
    expect(result.competitors).toHaveLength(1);
    const competitor = result.competitors[0];
    expect(competitor?.status).toBe('ok');
    expect(competitor?.overall ?? 100).toBeLessThan(result.overall.score);
    // Competitors are never scored on enriched signals the primary site had.
    expect(competitor?.ai).toBeNull();
  }, 90_000);
});

describe('sites with no server-rendered text', () => {
  /**
   * These two are identical on a word count and opposite in meaning. Telling
   * them apart is the difference between withholding the most valuable
   * finding the audit has, and inventing a verdict about a page nobody saw.
   */
  it('reports a client-rendered site instead of refusing it', async () => {
    const site = await startFixtureServer(clientRenderedSite());
    try {
      const result = await runAudit(
        { auditId: 'csr', url: site.origin, maxPages: 5 },
        { env: ENV },
      );

      const csr = result.checks.find((c) => c.id === 'seo.index.csr_dependency');
      expect(csr?.status).toBe('fail');
      // The finding has to be prominent, not buried among 40 others.
      const { rankFindings } = await import('@/engine/scoring/score');
      const top = rankFindings(result.checks, result.pillars).slice(0, 5).map((c) => c.id);
      expect(top).toContain('seo.index.csr_dependency');
      // And it must not be quietly scored as an average site.
      expect(result.overall.score).toBeLessThan(45);
    } finally {
      await site.close();
    }
  });

  it('refuses a site behind bot protection, and names the vendor', async () => {
    const site = await startFixtureServer(challengedSite());
    try {
      await expect(
        runAudit({ auditId: 'challenged', url: site.origin, maxPages: 5 }, { env: ENV }),
      ).rejects.toThrow(/Cloudflare/);
    } finally {
      await site.close();
    }
  });
});
