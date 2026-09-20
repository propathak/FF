import { describe, expect, it } from 'vitest';
import { evaluateAiCrawlers, isAllowed, parseRobots } from '@/engine/crawl/robots';
import type { RobotsTxt } from '@/engine/types';

function robots(raw: string): RobotsTxt {
  const { rules, sitemaps, errors } = parseRobots(raw);
  return { found: true, status: 200, raw, rules, sitemaps, parseErrors: errors };
}

describe('robots.txt parsing', () => {
  it('groups directives under their preceding user-agent run', () => {
    const r = robots(['User-agent: a', 'User-agent: b', 'Disallow: /x', '', 'User-agent: c', 'Disallow: /y'].join('\n'));
    expect(r.rules.find((x) => x.userAgent === 'a')?.disallow).toEqual(['/x']);
    expect(r.rules.find((x) => x.userAgent === 'b')?.disallow).toEqual(['/x']);
    expect(r.rules.find((x) => x.userAgent === 'c')?.disallow).toEqual(['/y']);
  });

  it('collects sitemap directives', () => {
    const r = robots('Sitemap: https://x.test/sitemap.xml\nUser-agent: *\nAllow: /');
    expect(r.sitemaps).toEqual(['https://x.test/sitemap.xml']);
  });

  it('ignores comments', () => {
    const r = robots('# a comment\nUser-agent: * # inline\nDisallow: /private # why');
    expect(r.rules[0]?.disallow).toEqual(['/private']);
  });

  it('treats an empty Disallow as allow-all', () => {
    const r = robots('User-agent: *\nDisallow:');
    expect(isAllowed(r, 'AnyBot', '/anything').allowed).toBe(true);
  });
});

describe('robots.txt matching', () => {
  it('lets the most specific path rule win, with ties going to Allow', () => {
    const r = robots('User-agent: *\nDisallow: /docs\nAllow: /docs/public');
    expect(isAllowed(r, 'Bot', '/docs/private').allowed).toBe(false);
    expect(isAllowed(r, 'Bot', '/docs/public/a').allowed).toBe(true);
  });

  it('supports wildcards and end anchors', () => {
    const r = robots('User-agent: *\nDisallow: /*.pdf$');
    expect(isAllowed(r, 'Bot', '/files/a.pdf').allowed).toBe(false);
    expect(isAllowed(r, 'Bot', '/files/a.pdf.html').allowed).toBe(true);
  });

  it('prefers a specific agent group over the wildcard group', () => {
    const r = robots('User-agent: *\nDisallow: /\n\nUser-agent: oai-searchbot\nAllow: /');
    expect(isAllowed(r, 'OAI-SearchBot', '/page').allowed).toBe(true);
    expect(isAllowed(r, 'SomeOtherBot', '/page').allowed).toBe(false);
  });
});

describe('AI crawler evaluation', () => {
  it('distinguishes retrieval crawlers from training crawlers', () => {
    const verdicts = evaluateAiCrawlers(robots('User-agent: GPTBot\nDisallow: /'));
    const gptbot = verdicts.find((v) => v.agent === 'GPTBot');
    const searchbot = verdicts.find((v) => v.agent === 'OAI-SearchBot');

    expect(gptbot?.purpose).toBe('training');
    expect(gptbot?.allowed).toBe(false);
    // Blocking the training crawler must not block the search crawler.
    expect(searchbot?.purpose).toBe('search');
    expect(searchbot?.allowed).toBe(true);
  });

  it('detects the blanket "block all AI" mistake', () => {
    const verdicts = evaluateAiCrawlers(robots('User-agent: *\nDisallow: /'));
    expect(verdicts.filter((v) => v.purpose === 'search').every((v) => !v.allowed)).toBe(true);
  });

  it('classifies Google-Extended as training only', () => {
    const verdicts = evaluateAiCrawlers(robots('User-agent: *\nAllow: /'));
    expect(verdicts.find((v) => v.agent === 'Google-Extended')?.purpose).toBe('training');
  });
});
