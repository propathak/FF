import type { AuditContext, CheckResult, PageSignals } from '../types';
import { gradeStatus, makeCheck, notApplicable, pct, unavailable, type CheckSpec } from './helpers';
import { clamp01, jaccard, median, ramp, ratio } from '../util/text';
import { canonicaliseUrl } from '../util/url';

const spec = (id: string, group: string, title: string, weight: number): CheckSpec => ({
  id, pillar: 'seo', group, title, weight,
});

function okPages(pages: PageSignals[]): PageSignals[] {
  return pages.filter((p) => p.statusCode >= 200 && p.statusCode < 300);
}

// ---------------------------------------------------------------------------
// seo.index — indexability & crawl
// ---------------------------------------------------------------------------

function indexabilityChecks(ctx: AuditContext): CheckResult[] {
  const { discovery, pages } = ctx;
  const good = okPages(pages);
  const out: CheckResult[] = [];

  // HTTPS
  const s = spec('seo.index.https', 'seo.index', 'HTTPS and secure transport', 10);
  out.push(
    discovery.https
      ? makeCheck(s, { status: 'pass', score: 1, summary: 'The site is served over HTTPS.' })
      : makeCheck(s, {
          status: 'fail',
          score: 0,
          summary: 'The site is not served over HTTPS. Browsers mark it as not secure and search engines demote it.',
          evidence: [{ kind: 'url', url: discovery.resolvedUrl }],
        }),
  );

  // Homepage status
  const statusSpec = spec('seo.index.status_code', 'seo.index', 'Homepage responds correctly', 10);
  out.push(
    discovery.homepageStatus >= 200 && discovery.homepageStatus < 300
      ? makeCheck(statusSpec, { status: 'pass', score: 1, summary: `Homepage returns ${discovery.homepageStatus}.` })
      : makeCheck(statusSpec, {
          status: 'fail', score: 0,
          summary: `Homepage returns HTTP ${discovery.homepageStatus || 'no response'}.`,
          evidence: [{ kind: 'metric', label: 'Status', value: discovery.homepageStatus }],
        }),
  );

  // Redirect chain from the entered URL
  const redirSpec = spec('seo.index.redirect_chain', 'seo.index', 'Short redirect chains', 6);
  const hops = discovery.redirectChain.length;
  out.push(
    makeCheck(redirSpec, {
      status: hops <= 1 ? 'pass' : hops <= 2 ? 'warn' : 'fail',
      score: hops === 0 ? 1 : hops === 1 ? 0.9 : hops === 2 ? 0.6 : 0.2,
      summary: hops === 0
        ? 'The entered URL resolves directly with no redirects.'
        : `The entered URL passes through ${hops} redirect${hops === 1 ? '' : 's'} before resolving.`,
      evidence: discovery.redirectChain.map((url) => ({ kind: 'url' as const, url })),
    }),
  );

  // Canonical host convergence
  const hostSpec = spec('seo.index.canonical_host', 'seo.index', 'One canonical hostname', 8);
  out.push(
    makeCheck(hostSpec, {
      status: discovery.canonicalHostConsistent ? 'pass' : 'fail',
      score: discovery.canonicalHostConsistent ? 1 : 0.2,
      summary: discovery.canonicalHostConsistent
        ? 'All www/non-www and http/https variants resolve to a single hostname.'
        : 'Multiple hostname variants serve content independently, splitting ranking signals across duplicates.',
      evidence: discovery.hostVariants.map((v) => ({
        kind: 'text' as const, label: v.url, value: `${v.status} → ${v.finalUrl}`,
      })),
    }),
  );

  // robots.txt
  const robotsSpec = spec('seo.index.robots_txt', 'seo.index', 'robots.txt is present and sane', 8);
  const blanketBlock = discovery.robots.rules.some(
    (r) => r.userAgent === '*' && r.disallow.includes('/'),
  );
  out.push(
    blanketBlock
      ? makeCheck(robotsSpec, {
          status: 'fail', score: 0,
          summary: 'robots.txt contains "Disallow: /" for all crawlers — the entire site is blocked from search engines.',
          evidence: [{ kind: 'url', url: `${discovery.origin}/robots.txt` }],
        })
      : !discovery.robots.found
        ? makeCheck(robotsSpec, {
            status: 'warn', score: 0.6,
            summary: 'No robots.txt found. Crawlers will index everything, and you cannot declare your sitemap there.',
          })
        : makeCheck(robotsSpec, {
            status: discovery.robots.parseErrors.length > 0 ? 'warn' : 'pass',
            score: discovery.robots.parseErrors.length > 0 ? 0.7 : 1,
            summary: discovery.robots.parseErrors.length > 0
              ? `robots.txt is present but has ${discovery.robots.parseErrors.length} unparseable line(s).`
              : 'robots.txt is present and parses cleanly.',
            evidence: [{ kind: 'url', url: `${discovery.origin}/robots.txt` }],
          }),
  );

  // Sitemap
  const sitemapSpec = spec('seo.index.sitemap', 'seo.index', 'XML sitemap', 8);
  const sm = discovery.sitemap;
  const declaredInRobots = discovery.robots.sitemaps.length > 0;
  out.push(
    !sm.found
      ? makeCheck(sitemapSpec, {
          status: 'fail', score: 0.1,
          summary: 'No XML sitemap found. Search engines and AI crawlers have to discover every page by following links.',
        })
      : makeCheck(sitemapSpec, {
          status: sm.hasLastmod && declaredInRobots ? 'pass' : 'warn',
          score: 0.5 + (sm.hasLastmod ? 0.25 : 0) + (declaredInRobots ? 0.25 : 0),
          summary: `Sitemap found with ${sm.urlCount} URLs.` +
            (sm.hasLastmod ? '' : ' It has no lastmod dates, so crawlers cannot tell what changed.') +
            (declaredInRobots ? '' : ' It is not declared in robots.txt.'),
          evidence: [
            ...sm.sources.map((url) => ({ kind: 'url' as const, url })),
            { kind: 'count' as const, label: 'URLs in sitemap', value: sm.urlCount },
          ],
        }),
  );

  // noindex across crawled pages
  const noindexSpec = spec('seo.index.noindex', 'seo.index', 'Pages are indexable', 12);
  const noindexed = good.filter((p) => p.robotsMeta.noindex);
  out.push(
    makeCheck(noindexSpec, {
      status: noindexed.length === 0 ? 'pass' : noindexed.length / Math.max(good.length, 1) > 0.25 ? 'fail' : 'warn',
      score: 1 - ratio(noindexed.length, Math.max(good.length, 1)),
      summary: noindexed.length === 0
        ? 'No crawled page carries a noindex directive.'
        : `${noindexed.length} of ${good.length} crawled pages are set to noindex and cannot appear in search results.`,
      evidence: [{ kind: 'count', label: 'Pages with noindex', value: noindexed.length, of: good.length }],
      affectedUrls: noindexed.map((p) => p.url),
    }),
  );

  // Canonical tags
  const canonSpec = spec('seo.index.canonical_tags', 'seo.index', 'Canonical tags', 10);
  const withCanonical = good.filter((p) => p.canonical);
  const selfReferencing = withCanonical.filter((p) => {
    const c = canonicaliseUrl(p.canonical as string, p.finalUrl);
    return c === canonicaliseUrl(p.finalUrl);
  });
  const coverage = ratio(withCanonical.length, Math.max(good.length, 1));
  const selfRate = ratio(selfReferencing.length, Math.max(withCanonical.length, 1));
  const canonScore = clamp01(coverage * 0.6 + selfRate * 0.4);
  out.push(
    makeCheck(canonSpec, {
      status: gradeStatus(canonScore),
      score: canonScore,
      summary: `${withCanonical.length} of ${good.length} crawled pages declare a canonical URL; ${selfReferencing.length} of those point to themselves.`,
      evidence: [
        { kind: 'count', label: 'Pages with canonical', value: withCanonical.length, of: good.length },
        { kind: 'count', label: 'Self-referencing', value: selfReferencing.length, of: withCanonical.length },
      ],
      affectedUrls: good.filter((p) => !p.canonical).map((p) => p.url),
    }),
  );

  // Broken links discovered during the crawl
  const brokenSpec = spec('seo.index.broken_pages', 'seo.index', 'No broken pages in the crawl', 10);
  const broken = pages.filter((p) => p.statusCode >= 400 || (p.statusCode === 0 && p.error));
  out.push(
    makeCheck(brokenSpec, {
      status: broken.length === 0 ? 'pass' : broken.length > 2 ? 'fail' : 'warn',
      score: 1 - clamp01(broken.length / Math.max(pages.length, 1) * 3),
      summary: broken.length === 0
        ? 'Every internal link followed during the crawl resolved successfully.'
        : `${broken.length} internally linked page(s) returned an error or failed to load.`,
      evidence: broken.slice(0, 10).map((p) => ({
        kind: 'text' as const, label: p.url, value: p.error ?? `HTTP ${p.statusCode}`,
      })),
      affectedUrls: broken.map((p) => p.url),
    }),
  );

  // Crawl depth
  const depthSpec = spec('seo.index.crawl_depth', 'seo.index', 'Content is close to the homepage', 6);
  const deep = good.filter((p) => p.depth > 3);
  const depthScore = 1 - clamp01(ratio(deep.length, Math.max(good.length, 1)) * 2);
  out.push(
    makeCheck(depthSpec, {
      status: gradeStatus(depthScore, { failBelow: 0.5, warnBelow: 0.85 }),
      score: depthScore,
      summary: deep.length === 0
        ? 'All crawled pages are within three clicks of the homepage.'
        : `${deep.length} crawled pages sit more than three clicks from the homepage, where crawlers reach them last.`,
      affectedUrls: deep.map((p) => p.url),
    }),
  );

  // Client-side rendering dependency
  const csrSpec = spec('seo.index.csr_dependency', 'seo.index', 'Content is present in served HTML', 12);
  const csrPages = good.filter((p) => p.csrDependent);
  const csrRate = ratio(csrPages.length, Math.max(good.length, 1));
  out.push(
    makeCheck(csrSpec, {
      status: csrRate === 0 ? 'pass' : csrRate > 0.5 ? 'fail' : 'warn',
      score: 1 - csrRate,
      summary: csrRate === 0
        ? 'Page content is present in the HTML the server returns.'
        : `${csrPages.length} of ${good.length} pages return almost no content in the initial HTML and depend on JavaScript to render. Several AI crawlers do not execute JavaScript.`,
      evidence: [{ kind: 'count', label: 'JavaScript-dependent pages', value: csrPages.length, of: good.length }],
      affectedUrls: csrPages.map((p) => p.url),
    }),
  );

  return out;
}

// ---------------------------------------------------------------------------
// seo.onpage
// ---------------------------------------------------------------------------

function onPageChecks(ctx: AuditContext): CheckResult[] {
  const good = okPages(ctx.pages);
  const out: CheckResult[] = [];
  const total = Math.max(good.length, 1);

  const titled = good.filter((p) => p.title && p.title.trim().length > 0);
  out.push(
    makeCheck(spec('seo.onpage.title_present', 'seo.onpage', 'Every page has a title', 12), {
      status: gradeStatus(ratio(titled.length, total), { failBelow: 0.7, warnBelow: 1 }),
      score: ratio(titled.length, total),
      summary: `${titled.length} of ${good.length} crawled pages have a page title.`,
      affectedUrls: good.filter((p) => !p.title).map((p) => p.url),
    }),
  );

  // 30–60 characters is the practical range before truncation in Google results.
  const goodLength = titled.filter((p) => (p.title as string).length >= 30 && (p.title as string).length <= 60);
  const lenScore = ratio(goodLength.length, Math.max(titled.length, 1));
  out.push(
    makeCheck(spec('seo.onpage.title_length', 'seo.onpage', 'Titles are a usable length', 8), {
      status: gradeStatus(lenScore, { failBelow: 0.3, warnBelow: 0.75 }),
      score: lenScore,
      summary: `${goodLength.length} of ${titled.length} titles fall in the 30–60 character range that displays without truncation.`,
      affectedUrls: titled.filter((p) => !goodLength.includes(p)).map((p) => p.url),
    }),
  );

  const titleCounts = new Map<string, string[]>();
  for (const p of titled) {
    const key = (p.title as string).trim().toLowerCase();
    titleCounts.set(key, [...(titleCounts.get(key) ?? []), p.url]);
  }
  const dupeTitles = [...titleCounts.values()].filter((urls) => urls.length > 1);
  const dupeCount = dupeTitles.reduce((n, urls) => n + urls.length, 0);
  out.push(
    makeCheck(spec('seo.onpage.title_duplicates', 'seo.onpage', 'Titles are unique', 8), {
      status: dupeCount === 0 ? 'pass' : dupeCount > total * 0.3 ? 'fail' : 'warn',
      score: 1 - ratio(dupeCount, total),
      summary: dupeCount === 0
        ? 'Every crawled page has a unique title.'
        : `${dupeCount} pages share a title with another page, so search engines cannot tell them apart.`,
      affectedUrls: dupeTitles.flat(),
    }),
  );

  const described = good.filter((p) => p.metaDescription && p.metaDescription.trim().length > 0);
  out.push(
    makeCheck(spec('seo.onpage.meta_description', 'seo.onpage', 'Meta descriptions', 8), {
      status: gradeStatus(ratio(described.length, total), { failBelow: 0.4, warnBelow: 0.9 }),
      score: ratio(described.length, total),
      summary: `${described.length} of ${good.length} crawled pages have a meta description.`,
      affectedUrls: good.filter((p) => !p.metaDescription).map((p) => p.url),
    }),
  );

  const descCounts = new Map<string, number>();
  for (const p of described) {
    const key = (p.metaDescription as string).trim().toLowerCase();
    descCounts.set(key, (descCounts.get(key) ?? 0) + 1);
  }
  const dupeDesc = [...descCounts.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
  out.push(
    makeCheck(spec('seo.onpage.meta_duplicates', 'seo.onpage', 'Meta descriptions are unique', 5), {
      status: dupeDesc === 0 ? 'pass' : 'warn',
      score: 1 - ratio(dupeDesc, total),
      summary: dupeDesc === 0
        ? 'Meta descriptions are unique across crawled pages.'
        : `${dupeDesc} pages reuse the same meta description.`,
    }),
  );

  const withH1 = good.filter((p) => p.h1Count >= 1);
  const singleH1 = good.filter((p) => p.h1Count === 1);
  const h1Score = clamp01(ratio(withH1.length, total) * 0.7 + ratio(singleH1.length, total) * 0.3);
  out.push(
    makeCheck(spec('seo.onpage.h1', 'seo.onpage', 'Each page has a single H1', 10), {
      status: gradeStatus(h1Score, { failBelow: 0.5, warnBelow: 0.9 }),
      score: h1Score,
      summary: `${withH1.length} of ${good.length} pages have an H1; ${singleH1.length} have exactly one.`,
      affectedUrls: good.filter((p) => p.h1Count !== 1).map((p) => p.url),
    }),
  );

  const cleanHierarchy = good.filter((p) => p.headingHierarchyBreaks === 0);
  const hierScore = ratio(cleanHierarchy.length, total);
  out.push(
    makeCheck(spec('seo.onpage.heading_hierarchy', 'seo.onpage', 'Heading hierarchy', 7), {
      status: gradeStatus(hierScore, { failBelow: 0.4, warnBelow: 0.8 }),
      score: hierScore,
      summary: `${cleanHierarchy.length} of ${good.length} pages use headings in order without skipping levels.`,
      affectedUrls: good.filter((p) => p.headingHierarchyBreaks > 0).map((p) => p.url),
    }),
  );

  const imgTotal = good.reduce((n, p) => n + p.images.total, 0);
  const imgAlt = good.reduce((n, p) => n + p.images.withAlt + p.images.decorative, 0);
  const altScore = imgTotal === 0 ? 1 : ratio(imgAlt, imgTotal);
  out.push(
    imgTotal === 0
      ? notApplicable(spec('seo.onpage.image_alt', 'seo.onpage', 'Image alt text', 6), 'No images found on crawled pages.')
      : makeCheck(spec('seo.onpage.image_alt', 'seo.onpage', 'Image alt text', 6), {
          status: gradeStatus(altScore, { failBelow: 0.5, warnBelow: 0.9 }),
          score: altScore,
          summary: `${imgAlt} of ${imgTotal} images carry an alt attribute.`,
          evidence: [{ kind: 'count', label: 'Images with alt', value: imgAlt, of: imgTotal }],
        }),
  );

  const medianWords = median(good.map((p) => p.wordCount));
  const depthScore = ramp(medianWords, 150, 800);
  out.push(
    makeCheck(spec('seo.onpage.content_depth', 'seo.onpage', 'Content depth', 10), {
      status: gradeStatus(depthScore, { failBelow: 0.25, warnBelow: 0.65 }),
      score: depthScore,
      confidence: good.some((p) => p.csrDependent) ? 0.5 : 1,
      summary: `Median page length is ${Math.round(medianWords)} words.`,
      evidence: [{ kind: 'metric', label: 'Median words per page', value: Math.round(medianWords) }],
    }),
  );

  const thin = good.filter((p) => p.wordCount < 300 && !p.csrDependent);
  out.push(
    makeCheck(spec('seo.onpage.thin_pages', 'seo.onpage', 'Few thin pages', 6), {
      status: thin.length === 0 ? 'pass' : ratio(thin.length, total) > 0.4 ? 'fail' : 'warn',
      score: 1 - ratio(thin.length, total),
      summary: thin.length === 0
        ? 'No crawled page is unusually thin.'
        : `${thin.length} of ${good.length} pages have under 300 words of content.`,
      affectedUrls: thin.map((p) => p.url),
    }),
  );

  // Near-duplicate detection via MinHash-style shingle overlap.
  const dupSpec = spec('seo.onpage.duplicate_content', 'seo.onpage', 'Pages are not near-duplicates', 8);
  const comparable = good.filter((p) => p.shingles.length >= 40);
  if (comparable.length < 2) {
    out.push(notApplicable(dupSpec, 'Not enough substantial pages crawled to compare for duplication.'));
  } else {
    const pairs: { a: string; b: string; similarity: number }[] = [];
    for (let i = 0; i < comparable.length; i++) {
      for (let j = i + 1; j < comparable.length; j++) {
        const a = comparable[i] as PageSignals;
        const b = comparable[j] as PageSignals;
        const similarity = jaccard(a.shingles, b.shingles);
        if (similarity >= 0.7) pairs.push({ a: a.url, b: b.url, similarity });
      }
    }
    const dupScore = 1 - clamp01(pairs.length / Math.max(comparable.length, 1));
    out.push(
      makeCheck(dupSpec, {
        status: pairs.length === 0 ? 'pass' : pairs.length > 2 ? 'fail' : 'warn',
        score: dupScore,
        summary: pairs.length === 0
          ? 'No near-duplicate page pairs found in the crawled sample.'
          : `${pairs.length} pairs of crawled pages are 70%+ textually identical.`,
        evidence: pairs.slice(0, 6).map((p) => ({
          kind: 'text' as const, label: `${Math.round(p.similarity * 100)}% similar`, value: `${p.a} ≈ ${p.b}`,
        })),
        affectedUrls: pairs.flatMap((p) => [p.a, p.b]),
      }),
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// seo.perf
// ---------------------------------------------------------------------------

function performanceChecks(ctx: AuditContext): CheckResult[] {
  const specs = {
    score: spec('seo.perf.performance_score', 'seo.perf', 'Overall performance score', 12),
    lcp: spec('seo.perf.lcp', 'seo.perf', 'Largest Contentful Paint', 10),
    cls: spec('seo.perf.cls', 'seo.perf', 'Cumulative Layout Shift', 8),
    ttfb: spec('seo.perf.ttfb', 'seo.perf', 'Server response time', 6),
    mobile: spec('seo.perf.mobile_friendly', 'seo.perf', 'Mobile friendliness', 10),
  };

  if (!ctx.performance.available) {
    return Object.values(specs).map((s) => unavailable(s, ctx.performance.available ? '' : ctx.performance.reason));
  }
  const perf = ctx.performance.data;
  // Lab data is a simulation, so it informs the score at reduced confidence.
  const confidence = perf.dataSource === 'field' ? 1 : 0.6;
  const sourceLabel = perf.dataSource === 'field' ? 'real-user (CrUX) data' : 'lab simulation (no real-user data available)';
  const out: CheckResult[] = [];

  out.push(
    perf.performanceScore === null
      ? unavailable(specs.score, 'PageSpeed did not return a performance score.')
      : makeCheck(specs.score, {
          status: gradeStatus(perf.performanceScore / 100, { failBelow: 0.5, warnBelow: 0.9 }),
          score: perf.performanceScore / 100,
          confidence,
          summary: `Lighthouse performance score is ${perf.performanceScore}/100 (${sourceLabel}).`,
          evidence: [{ kind: 'metric', label: 'Performance score', value: perf.performanceScore, source: perf.dataSource }],
        }),
  );

  // Google's Core Web Vitals thresholds: LCP good ≤2500ms, poor >4000ms.
  out.push(
    perf.lcpMs === null
      ? unavailable(specs.lcp, 'No Largest Contentful Paint measurement available.')
      : makeCheck(specs.lcp, {
          status: perf.lcpMs <= 2500 ? 'pass' : perf.lcpMs <= 4000 ? 'warn' : 'fail',
          score: ramp(perf.lcpMs, 5000, 2000),
          confidence,
          summary: `Largest Contentful Paint is ${(perf.lcpMs / 1000).toFixed(1)}s (${sourceLabel}). Google's "good" threshold is 2.5s.`,
          evidence: [{ kind: 'metric', label: 'LCP', value: perf.lcpMs, unit: 'ms', source: perf.dataSource }],
        }),
  );

  out.push(
    perf.cls === null
      ? unavailable(specs.cls, 'No layout shift measurement available.')
      : makeCheck(specs.cls, {
          status: perf.cls <= 0.1 ? 'pass' : perf.cls <= 0.25 ? 'warn' : 'fail',
          score: ramp(perf.cls, 0.4, 0.05),
          confidence,
          summary: `Cumulative Layout Shift is ${perf.cls.toFixed(3)} (${sourceLabel}). Google's "good" threshold is 0.1.`,
          evidence: [{ kind: 'metric', label: 'CLS', value: perf.cls, source: perf.dataSource }],
        }),
  );

  out.push(
    perf.ttfbMs === null
      ? unavailable(specs.ttfb, 'No server response time measurement available.')
      : makeCheck(specs.ttfb, {
          status: perf.ttfbMs <= 800 ? 'pass' : perf.ttfbMs <= 1800 ? 'warn' : 'fail',
          score: ramp(perf.ttfbMs, 2500, 500),
          confidence,
          summary: `Server responds in ${perf.ttfbMs}ms.`,
          evidence: [{ kind: 'metric', label: 'TTFB', value: perf.ttfbMs, unit: 'ms', source: perf.dataSource }],
        }),
  );

  const mobileAudits = ['viewport', 'font-size', 'tap-targets'] as const;
  const scored = mobileAudits
    .map((id) => perf.audits[id]?.score)
    .filter((s): s is number => typeof s === 'number');
  out.push(
    scored.length === 0
      ? unavailable(specs.mobile, 'Mobile usability audits were not returned.')
      : makeCheck(specs.mobile, {
          status: gradeStatus(scored.reduce((a, b) => a + b, 0) / scored.length, { failBelow: 0.5, warnBelow: 0.95 }),
          score: scored.reduce((a, b) => a + b, 0) / scored.length,
          confidence,
          summary: `${scored.filter((s) => s >= 0.9).length} of ${scored.length} mobile usability audits pass (viewport, font size, tap targets).`,
        }),
  );

  return out;
}

// ---------------------------------------------------------------------------
// seo.schema
// ---------------------------------------------------------------------------

function schemaChecks(ctx: AuditContext): CheckResult[] {
  const good = okPages(ctx.pages);
  const total = Math.max(good.length, 1);
  const out: CheckResult[] = [];

  const withSchema = good.filter((p) => p.jsonLdTypes.length > 0 || p.microdataTypes.length > 0);
  const coverage = ratio(withSchema.length, total);
  const allTypes = [...new Set(good.flatMap((p) => p.jsonLdTypes))];
  out.push(
    makeCheck(spec('seo.schema.present', 'seo.schema', 'Structured data coverage', 14), {
      status: gradeStatus(coverage, { failBelow: 0.2, warnBelow: 0.7 }),
      score: coverage,
      summary: withSchema.length === 0
        ? 'No structured data found on any crawled page. Search engines and AI systems must infer everything from prose.'
        : `${withSchema.length} of ${good.length} crawled pages carry structured data (${allTypes.slice(0, 6).join(', ')}).`,
      evidence: [{ kind: 'list', label: 'Schema types found', values: allTypes.slice(0, 20) }],
      affectedUrls: good.filter((p) => p.jsonLdTypes.length === 0).map((p) => p.url),
    }),
  );

  const errorPages = good.filter((p) => p.jsonLdParseErrors > 0);
  out.push(
    makeCheck(spec('seo.schema.valid_jsonld', 'seo.schema', 'Structured data parses cleanly', 10), {
      status: errorPages.length === 0 ? 'pass' : 'fail',
      score: 1 - ratio(errorPages.length, total),
      summary: errorPages.length === 0
        ? 'All JSON-LD blocks parse without error.'
        : `${errorPages.length} pages contain JSON-LD that fails to parse and is therefore ignored entirely.`,
      affectedUrls: errorPages.map((p) => p.url),
    }),
  );

  const breadcrumbPages = good.filter((p) => p.jsonLdTypes.includes('BreadcrumbList'));
  const bcScore = ratio(breadcrumbPages.length, total);
  out.push(
    makeCheck(spec('seo.schema.breadcrumbs', 'seo.schema', 'Breadcrumb markup', 6), {
      status: bcScore >= 0.5 ? 'pass' : bcScore > 0 ? 'warn' : 'opportunity',
      score: bcScore,
      summary: breadcrumbPages.length === 0
        ? 'No breadcrumb structured data found. Breadcrumbs tell search and AI systems how your content is organised.'
        : `${breadcrumbPages.length} of ${good.length} pages declare breadcrumb markup.`,
    }),
  );

  return out;
}

// ---------------------------------------------------------------------------
// seo.links
// ---------------------------------------------------------------------------

function linkChecks(ctx: AuditContext): CheckResult[] {
  const good = okPages(ctx.pages);
  const total = Math.max(good.length, 1);
  const out: CheckResult[] = [];

  const medianInternal = median(good.map((p) => p.internalLinks.length));
  const densityScore = ramp(medianInternal, 3, 25);
  out.push(
    makeCheck(spec('seo.links.internal_density', 'seo.links', 'Internal linking density', 12), {
      status: gradeStatus(densityScore, { failBelow: 0.25, warnBelow: 0.7 }),
      score: densityScore,
      summary: `Median page links to ${Math.round(medianInternal)} other pages on the site.`,
      evidence: [{ kind: 'metric', label: 'Median internal links per page', value: Math.round(medianInternal) }],
    }),
  );

  const anchors = good.flatMap((p) => p.anchorTexts);
  const generic = anchors.filter((a) => /^(click here|here|read more|learn more|more|link|this|details)$/i.test(a.trim()));
  const diversity = anchors.length === 0 ? 0 : new Set(anchors.map((a) => a.toLowerCase())).size / anchors.length;
  const anchorScore = clamp01(diversity * 0.6 + (1 - ratio(generic.length, Math.max(anchors.length, 1))) * 0.4);
  out.push(
    anchors.length === 0
      ? notApplicable(spec('seo.links.anchor_quality', 'seo.links', 'Descriptive anchor text', 8), 'No anchor text captured.')
      : makeCheck(spec('seo.links.anchor_quality', 'seo.links', 'Descriptive anchor text', 8), {
          status: gradeStatus(anchorScore, { failBelow: 0.3, warnBelow: 0.7 }),
          score: anchorScore,
          summary: `${generic.length} of ${anchors.length} links use generic anchor text like "click here" or "read more".`,
        }),
  );

  const orphanCandidates = good.filter((p) => p.depth > 0).filter((p) => {
    const canonical = canonicaliseUrl(p.finalUrl);
    return !good.some((other) => other.url !== p.url && other.internalLinks.some((l) => l === canonical));
  });
  out.push(
    makeCheck(spec('seo.links.orphan_risk', 'seo.links', 'Pages are linked from elsewhere', 6), {
      status: orphanCandidates.length === 0 ? 'pass' : 'warn',
      score: 1 - ratio(orphanCandidates.length, total),
      confidence: 0.7, // limited to the crawled sample
      summary: orphanCandidates.length === 0
        ? 'Every crawled page is linked from at least one other crawled page.'
        : `${orphanCandidates.length} crawled pages were reached only via the sitemap, not via internal links.`,
      affectedUrls: orphanCandidates.map((p) => p.url),
    }),
  );

  const externalTotal = good.reduce((n, p) => n + p.externalLinks.length, 0);
  const extScore = ramp(externalTotal / total, 0, 3);
  out.push(
    makeCheck(spec('seo.links.outbound_references', 'seo.links', 'Outbound references', 6), {
      status: extScore >= 0.6 ? 'pass' : extScore > 0.2 ? 'opportunity' : 'opportunity',
      score: extScore,
      summary: externalTotal === 0
        ? 'The site links out to no external sources. Citing sources is a trust signal for both search and AI systems.'
        : `Pages link out to external sources ${(externalTotal / total).toFixed(1)} times on average.`,
    }),
  );

  return out;
}

export function runSeoChecks(ctx: AuditContext): CheckResult[] {
  return [
    ...indexabilityChecks(ctx),
    ...onPageChecks(ctx),
    ...performanceChecks(ctx),
    ...schemaChecks(ctx),
    ...linkChecks(ctx),
  ];
}
