import { afterEach, describe, expect, it, vi } from 'vitest';
import { CRAWL_DEFAULTS } from '@/engine/config';

describe('crawler identity', () => {
  it('is contactable, because non-contactable agents get rate-limited', () => {
    const ua = CRAWL_DEFAULTS.userAgent;
    // Wikimedia buckets agents without contact details into a restrictive tier,
    // which would degrade the entity lookups the GEO pillar depends on.
    expect(ua).toMatch(/https:\/\/[^\s;)]+/);
    expect(ua).toMatch(/[\w.+-]+@[\w.-]+\.\w+/);
    expect(ua).toContain('IndexJoyBot');
  });

  it('points at a resolvable domain, not a placeholder', () => {
    expect(CRAWL_DEFAULTS.userAgent).not.toMatch(/\.example\b/);
    expect(CRAWL_DEFAULTS.userAgent).not.toMatch(/example\.(com|org)/);
  });

  it('declares the /bot page that exists in the app', () => {
    expect(CRAWL_DEFAULTS.userAgent).toContain('/bot');
  });
});

describe('own robots.txt and sitemap', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('keeps private surfaces out of the index but stays open to crawlers', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://indexjoy.com');
    vi.resetModules();
    const robots = (await import('@/app/robots')).default();
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;

    expect(rule?.userAgent).toBe('*');
    expect(rule?.allow).toBe('/');
    // Reports are unguessable but public; admin and the API are neither.
    expect(rule?.disallow).toContain('/audit/');
    expect(rule?.disallow).toContain('/admin');
    expect(rule?.disallow).toContain('/api/');
    expect(robots.sitemap).toBe('https://indexjoy.com/sitemap.xml');
  });

  it('never blocks an AI retrieval crawler — we flag sites that do', async () => {
    vi.resetModules();
    const robots = (await import('@/app/robots')).default();
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    const agents = rules.map((r) => String(r?.userAgent ?? '').toLowerCase());
    for (const blocked of ['oai-searchbot', 'perplexitybot', 'claude-searchbot', 'chatgpt-user']) {
      expect(agents).not.toContain(blocked);
    }
  });

  it('builds the sitemap from the configured origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://indexjoy.com');
    vi.resetModules();
    const entries = (await import('@/app/sitemap')).default();
    expect(entries.map((e) => e.url)).toEqual([
      'https://indexjoy.com',
      'https://indexjoy.com/methodology',
      'https://indexjoy.com/bot',
    ]);
    // /audit/[id] must never be listed — reports are per-prospect.
    expect(entries.some((e) => e.url.includes('/audit/'))).toBe(false);
  });
});

describe('durable-store guard', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('flags an in-memory store running in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.resetModules();
    const { isEphemeralInProduction } = await import('@/lib/repository');
    expect(isEphemeralInProduction()).toBe(true);
  });

  it('does not flag local development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    const { isEphemeralInProduction } = await import('@/lib/repository');
    expect(isEphemeralInProduction()).toBe(false);
  });

  it('does not flag production once Supabase is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.resetModules();
    const { isEphemeralInProduction } = await import('@/lib/repository');
    expect(isEphemeralInProduction()).toBe(false);
  });
});
