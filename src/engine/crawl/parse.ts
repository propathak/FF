import * as cheerio from 'cheerio';
import type { HeadingNode, PageSignals, QuestionHeading } from '../types';
import { canonicaliseUrl, looksLikeHtmlUrl, sameSite } from '../util/url';
import {
  countDefinitions, countQuotable, countStatistics, isQuestion, median,
  qualifiesAsAnswer, shingles, splitSentences, tokenize,
} from '../util/text';
import type { FetchResult } from '../util/http';

const SEMANTIC_TAGS = ['main', 'article', 'section', 'nav', 'aside', 'header', 'footer', 'figure', 'dl', 'time'];

function collectJsonLdTypes(nodes: unknown[]): { types: string[]; hasIds: boolean } {
  const types = new Set<string>();
  let hasIds = false;
  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    const t = obj['@type'];
    if (typeof t === 'string') types.add(t);
    else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') types.add(x);
    if (typeof obj['@id'] === 'string') hasIds = true;
    for (const value of Object.values(obj)) walk(value, depth + 1);
  };
  walk(nodes, 0);
  return { types: [...types], hasIds };
}

/**
 * For each question-shaped heading, capture the first following paragraph.
 * This drives `aeo.answer.direct_answer_proximity` — the strongest mechanically
 * checkable extraction signal we have.
 */
function extractQuestionHeadings($: cheerio.CheerioAPI): QuestionHeading[] {
  const out: QuestionHeading[] = [];
  $('h1, h2, h3, h4, summary, dt').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text || !isQuestion(text)) return;

    let answer: string | null = null;
    // Walk forward through siblings until we hit prose or the next heading.
    let node = $(el).next();
    for (let i = 0; i < 4 && node.length > 0; i++) {
      const tag = (node.prop('tagName') ?? '').toLowerCase();
      if (/^h[1-6]$/.test(tag)) break;
      const candidate = node.text().replace(/\s+/g, ' ').trim();
      if (candidate.length > 0) {
        answer = candidate;
        break;
      }
      node = node.next();
    }
    // `<dt>`/`<summary>` answers often live inside the parent's `<dd>`/body.
    if (!answer) {
      const parentText = $(el).parent().text().replace(/\s+/g, ' ').trim();
      const after = parentText.split(text)[1]?.trim();
      if (after) answer = after.slice(0, 400);
    }

    out.push({
      text,
      answer: answer ? answer.slice(0, 400) : null,
      answerLength: answer?.length ?? 0,
      qualifies: qualifiesAsAnswer(answer),
    });
  });
  return out;
}

function firstMeta($: cheerio.CheerioAPI, names: string[]): string | null {
  for (const name of names) {
    const v =
      $(`meta[name="${name}"]`).attr('content') ??
      $(`meta[property="${name}"]`).attr('content');
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function extractDate($: cheerio.CheerioAPI, jsonLd: unknown[], keys: string[], metaNames: string[]): string | null {
  const fromMeta = firstMeta($, metaNames);
  if (fromMeta) return fromMeta;
  const walk = (node: unknown, depth: number): string | null => {
    if (depth > 6 || node === null || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = walk(child, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const obj = node as Record<string, unknown>;
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    for (const value of Object.values(obj)) {
      const found = walk(value, depth + 1);
      if (found) return found;
    }
    return null;
  };
  const fromLd = walk(jsonLd, 0);
  if (fromLd) return fromLd;
  const timeAttr = $('time[datetime]').first().attr('datetime');
  return timeAttr?.trim() ?? null;
}

function extractAuthor($: cheerio.CheerioAPI, jsonLd: unknown[]): { name: string | null; hasSchema: boolean } {
  let hasSchema = false;
  let name: string | null = null;
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    const author = obj['author'];
    if (author) {
      hasSchema = true;
      if (typeof author === 'string' && !name) name = author;
      else if (typeof author === 'object' && author !== null) {
        const n = (Array.isArray(author) ? author[0] : author) as Record<string, unknown>;
        if (typeof n?.['name'] === 'string' && !name) name = n['name'] as string;
      }
    }
    for (const value of Object.values(obj)) walk(value, depth + 1);
  };
  walk(jsonLd, 0);

  if (!name) {
    const byline =
      firstMeta($, ['author', 'article:author']) ||
      $('[rel="author"]').first().text().trim() ||
      $('.author, .byline, [class*="author"]').first().text().replace(/\s+/g, ' ').trim();
    if (byline && byline.length < 120) name = byline.replace(/^(by|written by)\s+/i, '').trim() || null;
  }
  return { name, hasSchema };
}

export function parsePage(url: string, depth: number, res: FetchResult): PageSignals {
  const base: PageSignals = {
    url,
    finalUrl: res.finalUrl,
    depth,
    statusCode: res.status,
    contentType: res.contentType,
    bytes: res.bytes,
    loadMs: res.loadMs,
    redirectChain: res.redirectChain,
    error: res.error,
    title: null, metaDescription: null, canonical: null,
    robotsMeta: { noindex: false, nofollow: false, raw: null },
    lang: null,
    headings: [], h1Count: 0, headingHierarchyBreaks: 0,
    wordCount: 0, textToHtmlRatio: 0, medianSentenceWords: 0, medianParagraphWords: 0,
    internalLinks: [], externalLinks: [], anchorTexts: [], nofollowOutbound: 0,
    images: { total: 0, withAlt: 0, decorative: 0 },
    jsonLd: [], jsonLdTypes: [], jsonLdHasIds: false, jsonLdParseErrors: 0,
    microdataTypes: [], openGraph: {},
    semanticTags: {}, lists: { ul: 0, ol: 0, table: 0, dl: 0 },
    questionHeadings: [], definitionBlocks: 0, statisticClaims: 0,
    quotablePassages: 0, blockquotes: 0,
    datePublished: null, dateModified: null, authorName: null, hasAuthorSchema: false,
    csrDependent: false, shingles: [], excerpt: '',
  };

  if (!res.ok || !res.body || !/html/i.test(res.contentType || '')) return base;

  const $ = cheerio.load(res.body);
  const htmlLength = res.body.length;

  // Strip non-content before measuring text so nav/script noise doesn't inflate
  // word counts — a very common source of wrong "content depth" numbers.
  const $content = cheerio.load(res.body);
  $content('script, style, noscript, svg, template, iframe').remove();
  const bodyText = $content('body').text().replace(/\s+/g, ' ').trim();

  base.title = $('title').first().text().trim() || null;
  base.metaDescription = firstMeta($, ['description']);
  base.canonical = $('link[rel="canonical"]').first().attr('href')?.trim() ?? null;
  base.lang = $('html').attr('lang')?.trim() ?? null;

  const robotsRaw = firstMeta($, ['robots']);
  base.robotsMeta = {
    raw: robotsRaw,
    noindex: /noindex/i.test(robotsRaw ?? ''),
    nofollow: /nofollow/i.test(robotsRaw ?? ''),
  };

  const headings: HeadingNode[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = (el as unknown as { tagName?: string }).tagName ?? 'h6';
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text) headings.push({ level: Number(tag.slice(1)), text: text.slice(0, 300) });
  });
  base.headings = headings.slice(0, 120);
  base.h1Count = headings.filter((h) => h.level === 1).length;
  base.headingHierarchyBreaks = headings.reduce((breaks, h, i) => {
    const prev = headings[i - 1];
    return prev && h.level - prev.level > 1 ? breaks + 1 : breaks;
  }, 0);

  const words = tokenize(bodyText);
  base.wordCount = words.length;
  base.textToHtmlRatio = htmlLength === 0 ? 0 : bodyText.length / htmlLength;

  const sentences = splitSentences(bodyText);
  base.medianSentenceWords = median(sentences.map((s) => tokenize(s).length));
  const paragraphs: number[] = [];
  $content('p').each((_, el) => {
    const n = tokenize($content(el).text()).length;
    if (n > 0) paragraphs.push(n);
  });
  base.medianParagraphWords = median(paragraphs);

  const internal = new Set<string>();
  const external = new Set<string>();
  const anchors: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    const abs = canonicaliseUrl(href, res.finalUrl);
    if (!abs) return;
    const anchorText = $(el).text().replace(/\s+/g, ' ').trim();
    if (anchorText) anchors.push(anchorText.slice(0, 120));
    if (sameSite(abs, res.finalUrl)) {
      if (looksLikeHtmlUrl(abs)) internal.add(abs);
    } else {
      external.add(abs);
      if (/nofollow/i.test($(el).attr('rel') ?? '')) base.nofollowOutbound++;
    }
  });
  base.internalLinks = [...internal].slice(0, 300);
  base.externalLinks = [...external].slice(0, 150);
  base.anchorTexts = anchors.slice(0, 300);

  let imgTotal = 0;
  let imgWithAlt = 0;
  let imgDecorative = 0;
  $('img').each((_, el) => {
    imgTotal++;
    const alt = $(el).attr('alt');
    if (alt === undefined) return;
    if (alt.trim() === '') imgDecorative++;
    else imgWithAlt++;
  });
  base.images = { total: imgTotal, withAlt: imgWithAlt, decorative: imgDecorative };

  const jsonLd: unknown[] = [];
  let parseErrors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      parseErrors++;
    }
  });
  base.jsonLd = jsonLd;
  base.jsonLdParseErrors = parseErrors;
  const { types, hasIds } = collectJsonLdTypes(jsonLd);
  base.jsonLdTypes = types;
  base.jsonLdHasIds = hasIds;

  const microdata = new Set<string>();
  $('[itemtype]').each((_, el) => {
    const t = $(el).attr('itemtype');
    if (t) microdata.add(t.split('/').pop() ?? t);
  });
  base.microdataTypes = [...microdata];

  $('meta[property^="og:"]').each((_, el) => {
    const key = $(el).attr('property');
    const value = $(el).attr('content');
    if (key && value) base.openGraph[key] = value;
  });

  for (const tag of SEMANTIC_TAGS) {
    const count = $(tag).length;
    if (count > 0) base.semanticTags[tag] = count;
  }
  base.lists = { ul: $('ul').length, ol: $('ol').length, table: $('table').length, dl: $('dl').length };
  base.blockquotes = $('blockquote, q, cite').length;

  base.questionHeadings = extractQuestionHeadings($);
  base.definitionBlocks = countDefinitions(sentences);
  base.statisticClaims = countStatistics(sentences);
  base.quotablePassages = countQuotable(sentences);

  base.datePublished = extractDate($, jsonLd, ['datePublished', 'dateCreated'],
    ['article:published_time', 'datePublished', 'publish-date']);
  base.dateModified = extractDate($, jsonLd, ['dateModified'],
    ['article:modified_time', 'dateModified', 'last-modified']);
  const author = extractAuthor($, jsonLd);
  base.authorName = author.name;
  base.hasAuthorSchema = author.hasSchema;

  // CSR detection: an empty-ish body plus a known SPA mount point means the
  // served HTML isn't the content. We flag rather than pretend to render.
  const spaRoot = $('#root, #app, #__next, [data-reactroot]');
  base.csrDependent =
    base.wordCount < 120 &&
    base.textToHtmlRatio < 0.02 &&
    (spaRoot.length > 0 || $('script[src]').length > 3);

  base.shingles = shingles(bodyText);
  base.excerpt = bodyText.slice(0, 1200);

  return base;
}
