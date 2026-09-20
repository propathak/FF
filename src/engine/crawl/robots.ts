import type { AiCrawlerVerdict, RobotsRule, RobotsTxt } from '../types';
import { AI_CRAWLERS, CRAWL_DEFAULTS } from '../config';
import type { Fetcher } from '../util/http';

/**
 * robots.txt parser following the REP group semantics: directives accumulate
 * under the preceding run of `User-agent` lines, and the *most specific*
 * matching group wins for a given agent.
 */
export function parseRobots(raw: string): { rules: RobotsRule[]; sitemaps: string[]; errors: string[] } {
  const rules: RobotsRule[] = [];
  const sitemaps: string[] = [];
  const errors: string[] = [];

  // A run of consecutive `User-agent` lines forms ONE group that shares the
  // directives following it. A group ends at the first `User-agent` line that
  // appears *after* a directive.
  let currentGroup: RobotsRule[] = [];
  let seenDirectiveInGroup = false;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) {
      errors.push(`Unparseable line: ${line.slice(0, 80)}`);
      continue;
    }
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (seenDirectiveInGroup) {
        currentGroup = [];
        seenDirectiveInGroup = false;
      }
      const agent = value.toLowerCase();
      const rule: RobotsRule = { userAgent: agent, allow: [], disallow: [] };
      rules.push(rule);
      currentGroup.push(rule);
      continue;
    }
    if (currentGroup.length === 0) {
      errors.push(`Directive before any User-agent: ${field}`);
      continue;
    }
    seenDirectiveInGroup = true;
    for (const rule of currentGroup) {
      if (field === 'disallow') rule.disallow.push(value);
      else if (field === 'allow') rule.allow.push(value);
      else if (field === 'crawl-delay') {
        const n = Number(value);
        if (!Number.isNaN(n)) rule.crawlDelay = n;
      }
    }
  }
  return { rules, sitemaps, errors };
}

function patternToRegex(pattern: string): RegExp {
  // REP wildcards: `*` matches any run, `$` anchors the end.
  const escaped = pattern.replace(/[.+^{}()|[\]\\]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*');
  const anchored = withWildcards.endsWith('$')
    ? `^${withWildcards.slice(0, -1)}$`
    : `^${withWildcards}`;
  return new RegExp(anchored);
}

function specificity(pattern: string): number {
  return pattern.replace(/\*/g, '').length;
}

/** Picks the group whose user-agent token is the longest prefix match. */
function selectRule(rules: RobotsRule[], agent: string): RobotsRule | null {
  const lower = agent.toLowerCase();
  let best: RobotsRule | null = null;
  let bestLen = -1;
  for (const rule of rules) {
    if (rule.userAgent === '*') {
      if (bestLen < 0) {
        best = rule;
        bestLen = 0;
      }
      continue;
    }
    if (lower.includes(rule.userAgent) && rule.userAgent.length > bestLen) {
      best = rule;
      bestLen = rule.userAgent.length;
    }
  }
  return best;
}

export function isAllowed(robots: RobotsTxt, agent: string, path: string): { allowed: boolean; matchedBy: string } {
  if (!robots.found) return { allowed: true, matchedBy: 'no robots.txt' };
  const rule = selectRule(robots.rules, agent);
  if (!rule) return { allowed: true, matchedBy: 'no matching group' };

  let bestAllow = -1;
  let bestDisallow = -1;
  for (const p of rule.allow) {
    if (p && patternToRegex(p).test(path)) bestAllow = Math.max(bestAllow, specificity(p));
  }
  for (const p of rule.disallow) {
    if (p === '') continue; // `Disallow:` with an empty value means allow-all
    if (patternToRegex(p).test(path)) bestDisallow = Math.max(bestDisallow, specificity(p));
  }
  // Most specific wins; ties go to Allow, per Google's implementation.
  const allowed = bestDisallow < 0 || bestAllow >= bestDisallow;
  return { allowed, matchedBy: rule.userAgent };
}

export function evaluateAiCrawlers(robots: RobotsTxt): AiCrawlerVerdict[] {
  return AI_CRAWLERS.map(({ agent, operator, purpose }) => {
    const { allowed, matchedBy } = isAllowed(robots, agent, '/');
    return { agent, operator, purpose, allowed, matchedBy };
  });
}

export async function fetchRobots(origin: string, fetcher: Fetcher): Promise<RobotsTxt> {
  const res = await fetcher(new URL('/robots.txt', origin).toString(), {
    accept: 'text/plain,*/*',
    timeoutMs: 8000,
  });
  // A 404 is a valid outcome, not an error: it means "crawl everything".
  if (!res.ok || !res.body.trim()) {
    return { found: false, status: res.status, raw: null, rules: [], sitemaps: [], parseErrors: [] };
  }
  // Some hosts serve an HTML 404 page with a 200 status.
  if (/<html|<!doctype/i.test(res.body.slice(0, 200))) {
    return {
      found: false,
      status: res.status,
      raw: null,
      rules: [],
      sitemaps: [],
      parseErrors: ['robots.txt returned HTML — treating as absent'],
    };
  }
  const { rules, sitemaps, errors } = parseRobots(res.body);
  return { found: true, status: res.status, raw: res.body.slice(0, 20_000), rules, sitemaps, parseErrors: errors };
}

export function crawlDelayFor(robots: RobotsTxt): number {
  const rule = selectRule(robots.rules, CRAWL_DEFAULTS.userAgent);
  return rule?.crawlDelay ?? 0;
}
