import type { AuditContext, CheckResult, PageSignals, QuestionGap } from '../types';
import { gradeStatus, makeCheck, notApplicable, type CheckSpec } from './helpers';
import { clamp01, median, ramp, ratio } from '../util/text';

const spec = (id: string, group: string, title: string, weight: number): CheckSpec => ({
  id, pillar: 'aeo', group, title, weight,
});

function okPages(pages: PageSignals[]): PageSignals[] {
  return pages.filter((p) => p.statusCode >= 200 && p.statusCode < 300);
}

function hasType(pages: PageSignals[], type: string): PageSignals[] {
  return pages.filter((p) => p.jsonLdTypes.includes(type));
}

/** Heuristic for "is this site procedural?" — gates HowTo from being a penalty. */
function looksProcedural(pages: PageSignals[]): boolean {
  return pages.some(
    (p) =>
      /\b(how to|step[- ]by[- ]step|tutorial|guide|setup|install|configure)\b/i.test(
        `${p.title ?? ''} ${p.headings.map((h) => h.text).join(' ')}`,
      ) && p.lists.ol > 0,
  );
}

// ---------------------------------------------------------------------------
// aeo.answer — answerability
// ---------------------------------------------------------------------------

function answerChecks(ctx: AuditContext): CheckResult[] {
  const good = okPages(ctx.pages);
  const total = Math.max(good.length, 1);
  const out: CheckResult[] = [];
  const csrPenalty = good.some((p) => p.csrDependent) ? 0.5 : 1;

  const questionHeadings = good.flatMap((p) => p.questionHeadings);
  const pagesWithQuestions = good.filter((p) => p.questionHeadings.length > 0);
  const qScore = ramp(questionHeadings.length / total, 0, 2.5);
  out.push(
    makeCheck(spec('aeo.answer.question_headings', 'aeo.answer', 'Content is organised around questions', 14), {
      status: gradeStatus(qScore, { failBelow: 0.2, warnBelow: 0.6 }),
      score: qScore,
      confidence: csrPenalty,
      summary: questionHeadings.length === 0
        ? 'No headings on the crawled pages are phrased as questions. Answer engines look for question-shaped headings to locate extractable answers.'
        : `${questionHeadings.length} question-style headings found across ${pagesWithQuestions.length} of ${good.length} pages.`,
      evidence: [
        { kind: 'count', label: 'Question headings', value: questionHeadings.length },
        { kind: 'list', label: 'Examples', values: questionHeadings.slice(0, 5).map((q) => q.text) },
      ],
    }),
  );

  // The single strongest extraction signal we can check mechanically.
  const qualifying = questionHeadings.filter((q) => q.qualifies);
  const proximityScore = questionHeadings.length === 0 ? 0 : ratio(qualifying.length, questionHeadings.length);
  out.push(
    questionHeadings.length === 0
      ? makeCheck(spec('aeo.answer.direct_answer_proximity', 'aeo.answer', 'Direct answers follow questions', 16), {
          status: 'fail',
          score: 0,
          confidence: csrPenalty,
          summary: 'There are no question headings, so there are no direct answer blocks for an answer engine to lift.',
        })
      : makeCheck(spec('aeo.answer.direct_answer_proximity', 'aeo.answer', 'Direct answers follow questions', 16), {
          status: gradeStatus(proximityScore, { failBelow: 0.3, warnBelow: 0.7 }),
          score: proximityScore,
          confidence: csrPenalty,
          summary: `${qualifying.length} of ${questionHeadings.length} question headings are followed immediately by a self-contained 40–320 character answer.`,
          evidence: [
            { kind: 'count', label: 'Questions with an extractable answer', value: qualifying.length, of: questionHeadings.length },
            ...questionHeadings.filter((q) => !q.qualifies).slice(0, 4).map((q) => ({
              kind: 'text' as const,
              label: q.text.slice(0, 90),
              value: q.answer ? `Answer is ${q.answerLength} characters — outside the extractable range` : 'No paragraph follows this heading',
            })),
          ],
        }),
  );

  const definitions = good.reduce((n, p) => n + p.definitionBlocks, 0);
  const defScore = ramp(definitions / total, 0, 2);
  out.push(
    makeCheck(spec('aeo.answer.definitions', 'aeo.answer', 'Clear definitions', 8), {
      status: gradeStatus(defScore, { failBelow: 0.2, warnBelow: 0.6, opportunity: true }),
      score: defScore,
      confidence: csrPenalty,
      summary: definitions === 0
        ? 'No definition-style sentences ("X is a…", "X refers to…") were found. These are what answer engines quote for "what is" questions.'
        : `${definitions} definition-style statements found across the crawled pages.`,
    }),
  );

  const structureUnits = good.reduce((n, p) => n + p.lists.ul + p.lists.ol + p.lists.table + p.lists.dl, 0);
  const perThousandWords = good.reduce((n, p) => n + p.wordCount, 0) / 1000;
  const listDensity = perThousandWords === 0 ? 0 : structureUnits / perThousandWords;
  const listScore = ramp(listDensity, 0.3, 4);
  out.push(
    makeCheck(spec('aeo.answer.lists_tables', 'aeo.answer', 'Lists and tables', 8), {
      status: gradeStatus(listScore, { failBelow: 0.25, warnBelow: 0.65, opportunity: true }),
      score: listScore,
      confidence: csrPenalty,
      summary: `${structureUnits} lists and tables across the crawled content (${listDensity.toFixed(1)} per 1,000 words). Structured formats are extracted far more readily than prose.`,
    }),
  );

  const medianPara = median(good.filter((p) => p.medianParagraphWords > 0).map((p) => p.medianParagraphWords));
  // 30–90 words per paragraph is the readable, extractable range.
  const paraScore = medianPara === 0 ? 0.5 : medianPara <= 90 ? clamp01(ramp(medianPara, 5, 30)) : clamp01(ramp(medianPara, 180, 90));
  out.push(
    makeCheck(spec('aeo.answer.paragraph_length', 'aeo.answer', 'Readable paragraph length', 6), {
      status: gradeStatus(paraScore, { failBelow: 0.3, warnBelow: 0.7 }),
      score: paraScore,
      confidence: csrPenalty,
      summary: medianPara === 0
        ? 'No paragraph content was found to measure.'
        : `Median paragraph is ${Math.round(medianPara)} words.`,
    }),
  );

  const semanticPages = good.filter((p) => (p.semanticTags['main'] ?? 0) > 0 || (p.semanticTags['article'] ?? 0) > 0);
  const semScore = ratio(semanticPages.length, total);
  out.push(
    makeCheck(spec('aeo.answer.semantic_html', 'aeo.answer', 'Semantic HTML structure', 8), {
      status: gradeStatus(semScore, { failBelow: 0.3, warnBelow: 0.8 }),
      score: semScore,
      summary: `${semanticPages.length} of ${good.length} pages wrap their content in <main> or <article>, which tells parsers where the content is versus the navigation.`,
      affectedUrls: good.filter((p) => !semanticPages.includes(p)).map((p) => p.url),
    }),
  );

  return out;
}

// ---------------------------------------------------------------------------
// aeo.schema — structured answer markup
// ---------------------------------------------------------------------------

function answerSchemaChecks(ctx: AuditContext): CheckResult[] {
  const good = okPages(ctx.pages);
  const out: CheckResult[] = [];

  const faqPages = hasType(good, 'FAQPage');
  const qaPages = hasType(good, 'QAPage');
  const faqScore = clamp01(ratio(faqPages.length + qaPages.length, Math.max(good.length * 0.25, 1)));
  out.push(
    makeCheck(spec('aeo.schema.faq', 'aeo.schema', 'FAQ / Q&A structured data', 14), {
      status: faqPages.length + qaPages.length === 0 ? 'fail' : gradeStatus(faqScore, { failBelow: 0.2, warnBelow: 0.7 }),
      score: faqScore,
      summary: faqPages.length + qaPages.length === 0
        ? 'No FAQPage or QAPage structured data found. Question-and-answer markup is the most direct way to hand answer engines a pre-packaged answer.'
        : `${faqPages.length + qaPages.length} pages declare FAQ or Q&A structured data.`,
      affectedUrls: [...faqPages, ...qaPages].map((p) => p.url),
    }),
  );

  // HowTo is only relevant for procedural content — penalising a law firm for
  // not having HowTo markup would be noise, and noise costs credibility.
  const howToSpec = spec('aeo.schema.howto', 'aeo.schema', 'HowTo structured data', 6);
  const howToPages = hasType(good, 'HowTo');
  out.push(
    !looksProcedural(good)
      ? notApplicable(howToSpec, 'The site does not appear to publish step-by-step procedural content, so HowTo markup is not expected.')
      : makeCheck(howToSpec, {
          status: howToPages.length > 0 ? 'pass' : 'opportunity',
          score: howToPages.length > 0 ? 1 : 0,
          summary: howToPages.length > 0
            ? `${howToPages.length} pages declare HowTo structured data.`
            : 'The site publishes step-by-step content but does not mark it up as HowTo, so answer engines cannot present it as a procedure.',
        }),
  );

  const articlePages = good.filter((p) => p.jsonLdTypes.some((t) => /Article|BlogPosting|NewsArticle/.test(t)));
  const editorial = good.filter((p) => /\/(blog|article|news|insight|resource|guide)/i.test(p.url));
  const articleSpec = spec('aeo.schema.article', 'aeo.schema', 'Article structured data', 8);
  out.push(
    editorial.length === 0
      ? notApplicable(articleSpec, 'No editorial or blog content was crawled.')
      : makeCheck(articleSpec, {
          status: gradeStatus(ratio(articlePages.length, editorial.length), { failBelow: 0.3, warnBelow: 0.8 }),
          score: ratio(articlePages.length, editorial.length),
          summary: `${articlePages.length} of ${editorial.length} editorial pages declare Article structured data.`,
          affectedUrls: editorial.filter((p) => !articlePages.includes(p)).map((p) => p.url),
        }),
  );

  /**
   * Schema↔body alignment: FAQ markup whose answers do not appear in the visible
   * page is the most common real-world FAQ-schema defect, and it is treated by
   * search engines as a policy violation rather than a technicality.
   */
  const alignSpec = spec('aeo.schema.answer_alignment', 'aeo.schema', 'FAQ markup matches visible content', 10);
  if (faqPages.length === 0) {
    out.push(notApplicable(alignSpec, 'No FAQ structured data to verify against the page body.'));
  } else {
    let checked = 0;
    let aligned = 0;
    const mismatches: string[] = [];
    for (const page of faqPages) {
      for (const answer of extractFaqAnswers(page.jsonLd)) {
        checked++;
        const needle = answer.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase();
        if (needle.length < 20) continue;
        if (page.excerpt.toLowerCase().includes(needle) || page.questionHeadings.some((q) => (q.answer ?? '').toLowerCase().includes(needle))) {
          aligned++;
        } else if (mismatches.length < 5) {
          mismatches.push(`${page.url}: "${needle}…"`);
        }
      }
    }
    const alignScore = checked === 0 ? 0.5 : ratio(aligned, checked);
    out.push(
      makeCheck(alignSpec, {
        status: checked === 0 ? 'warn' : gradeStatus(alignScore, { failBelow: 0.5, warnBelow: 0.85 }),
        score: alignScore,
        // Body text is an excerpt, so a miss is suggestive rather than conclusive.
        confidence: 0.75,
        summary: checked === 0
          ? 'FAQ markup is present but contains no readable answers.'
          : `${aligned} of ${checked} FAQ answers in your markup also appear in the visible page text.`,
        evidence: mismatches.map((m) => ({ kind: 'text' as const, label: 'Not found in visible text', value: m })),
      }),
    );
  }

  return out;
}

function extractFaqAnswers(jsonLd: unknown[]): string[] {
  const answers: string[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    const accepted = obj['acceptedAnswer'] ?? obj['suggestedAnswer'];
    if (accepted && typeof accepted === 'object') {
      const text = (accepted as Record<string, unknown>)['text'];
      if (typeof text === 'string') answers.push(text);
    }
    for (const value of Object.values(obj)) walk(value, depth + 1);
  };
  walk(jsonLd, 0);
  return answers.slice(0, 40);
}

// ---------------------------------------------------------------------------
// aeo.eeat — trust & provenance
// ---------------------------------------------------------------------------

function eeatChecks(ctx: AuditContext): CheckResult[] {
  const good = okPages(ctx.pages);
  const total = Math.max(good.length, 1);
  const out: CheckResult[] = [];

  const editorial = good.filter((p) => /\/(blog|article|news|insight|resource|guide|case-stud)/i.test(p.url));
  const bylineSpec = spec('aeo.eeat.author_byline', 'aeo.eeat', 'Named authors on content', 12);
  out.push(
    editorial.length === 0
      ? notApplicable(bylineSpec, 'No editorial content was crawled, so author attribution is not expected.')
      : makeCheck(bylineSpec, {
          status: gradeStatus(ratio(editorial.filter((p) => p.authorName).length, editorial.length), { failBelow: 0.3, warnBelow: 0.8 }),
          score: ratio(editorial.filter((p) => p.authorName).length, editorial.length),
          summary: `${editorial.filter((p) => p.authorName).length} of ${editorial.length} editorial pages name an author. Answer engines resolve who said something before deciding whether to repeat it.`,
          affectedUrls: editorial.filter((p) => !p.authorName).map((p) => p.url),
        }),
  );

  const authorSchemaSpec = spec('aeo.eeat.author_schema', 'aeo.eeat', 'Author structured data', 8);
  out.push(
    editorial.length === 0
      ? notApplicable(authorSchemaSpec, 'No editorial content was crawled.')
      : makeCheck(authorSchemaSpec, {
          status: gradeStatus(ratio(editorial.filter((p) => p.hasAuthorSchema).length, editorial.length), { failBelow: 0.25, warnBelow: 0.75 }),
          score: ratio(editorial.filter((p) => p.hasAuthorSchema).length, editorial.length),
          summary: `${editorial.filter((p) => p.hasAuthorSchema).length} of ${editorial.length} editorial pages declare their author in structured data.`,
        }),
  );

  const hasAbout = good.some((p) => /\/(about|who-we-are|our-story|company|team)/i.test(p.url));
  const hasContact = good.some((p) => /\/(contact|get-in-touch|reach-us|support)/i.test(p.url));
  const hasAuthorPage = good.some((p) => /\/(author|people|team|leadership|experts)/i.test(p.url));
  const trustScore = (hasAbout ? 0.4 : 0) + (hasContact ? 0.35 : 0) + (hasAuthorPage ? 0.25 : 0);
  out.push(
    makeCheck(spec('aeo.eeat.trust_pages', 'aeo.eeat', 'About, contact and team pages', 12), {
      status: gradeStatus(trustScore, { failBelow: 0.4, warnBelow: 0.75 }),
      score: trustScore,
      summary: [
        hasAbout ? 'About page found' : 'No About page found',
        hasContact ? 'contact page found' : 'no contact page found',
        hasAuthorPage ? 'team or author page found' : 'no team or author page found',
      ].join(', ') + '.',
      confidence: 0.85, // limited to the crawled sample
    }),
  );

  const dated = good.filter((p) => p.datePublished || p.dateModified);
  const dateSpec = spec('aeo.eeat.dates', 'aeo.eeat', 'Publication and update dates', 10);
  out.push(
    editorial.length === 0
      ? notApplicable(dateSpec, 'No editorial content was crawled.')
      : makeCheck(dateSpec, {
          status: gradeStatus(ratio(dated.length, editorial.length), { failBelow: 0.3, warnBelow: 0.8 }),
          score: clamp01(ratio(dated.length, editorial.length)),
          summary: `${dated.length} of ${editorial.length} editorial pages carry a machine-readable publication or update date. Undated content is discounted as stale by answer engines.`,
          affectedUrls: editorial.filter((p) => !p.datePublished && !p.dateModified).map((p) => p.url),
        }),
  );

  const freshSpec = spec('aeo.eeat.freshness', 'aeo.eeat', 'Content freshness', 8);
  const dates = good
    .map((p) => p.dateModified ?? p.datePublished)
    .filter((d): d is string => Boolean(d))
    .map((d) => Date.parse(d))
    .filter((t) => !Number.isNaN(t));
  if (dates.length === 0) {
    out.push(notApplicable(freshSpec, 'No dated content found to assess freshness.'));
  } else {
    const newest = Math.max(...dates);
    const monthsOld = (Date.now() - newest) / (1000 * 60 * 60 * 24 * 30);
    out.push(
      makeCheck(freshSpec, {
        status: monthsOld <= 3 ? 'pass' : monthsOld <= 12 ? 'warn' : 'fail',
        score: ramp(monthsOld, 24, 2),
        summary: `The most recently dated content is ${Math.round(monthsOld)} months old.`,
        evidence: [{ kind: 'metric', label: 'Months since newest dated content', value: Math.round(monthsOld) }],
      }),
    );
  }

  const citingPages = good.filter((p) => p.externalLinks.length > 0);
  const citeScore = ratio(citingPages.length, total);
  out.push(
    makeCheck(spec('aeo.eeat.outbound_citations', 'aeo.eeat', 'Citing outside sources', 8), {
      status: gradeStatus(citeScore, { failBelow: 0.2, warnBelow: 0.6, opportunity: true }),
      score: citeScore,
      summary: `${citingPages.length} of ${good.length} pages cite an external source. Content that cites evidence is treated as more reliable by both search and answer engines.`,
    }),
  );

  return out;
}

// ---------------------------------------------------------------------------
// aeo.coverage — intent spread and question gap
// ---------------------------------------------------------------------------

export function intentOf(page: PageSignals): 'informational' | 'commercial' | 'transactional' | 'navigational' {
  const haystack = `${page.url} ${page.title ?? ''} ${page.headings.map((h) => h.text).join(' ')}`.toLowerCase();
  if (/\b(pricing|price|buy|checkout|cart|order|subscribe|book a|start free|sign ?up|demo)\b/.test(haystack)) return 'transactional';
  if (/\b(vs|versus|compare|comparison|alternative|best|top \d|review|case stud)\b/.test(haystack)) return 'commercial';
  if (/\b(what is|how to|guide|tutorial|why|when|glossary|faq|learn|blog|resource)\b/.test(haystack)) return 'informational';
  return 'navigational';
}

function coverageChecks(ctx: AuditContext, gaps: QuestionGap[]): CheckResult[] {
  const good = okPages(ctx.pages);
  const out: CheckResult[] = [];

  const intents = new Set(good.map(intentOf));
  const wanted = ['informational', 'commercial', 'transactional'] as const;
  const present = wanted.filter((i) => intents.has(i));
  const intentScore = ratio(present.length, wanted.length);
  out.push(
    makeCheck(spec('aeo.coverage.intent_spread', 'aeo.coverage', 'Coverage across search intents', 10), {
      status: gradeStatus(intentScore, { failBelow: 0.4, warnBelow: 0.99 }),
      score: intentScore,
      summary: present.length === wanted.length
        ? 'The site covers informational, comparison and transactional intent.'
        : `The crawled pages cover ${present.join(' and ') || 'no'} intent. Missing: ${wanted.filter((i) => !intents.has(i)).join(', ')}.`,
      evidence: [{ kind: 'list', label: 'Intents covered', values: [...intents] }],
    }),
  );

  const gapSpec = spec('aeo.coverage.question_gap', 'aeo.coverage', 'Questions customers ask are answered', 16);
  if (gaps.length === 0) {
    out.push(makeCheck(gapSpec, {
      status: 'unavailable',
      score: 0,
      confidence: 0,
      summary: 'Customer question set could not be generated for this brand.',
    }));
  } else {
    const answered = gaps.filter((g) => g.answered);
    const gapScore = ratio(answered.length, gaps.length);
    out.push(
      makeCheck(gapSpec, {
        status: gradeStatus(gapScore, { failBelow: 0.25, warnBelow: 0.7 }),
        score: gapScore,
        summary: `Your site answers ${answered.length} of ${gaps.length} high-intent questions customers are likely to ask about this category.`,
        evidence: [
          { kind: 'count', label: 'Questions answered', value: answered.length, of: gaps.length },
          { kind: 'list', label: 'Unanswered examples', values: gaps.filter((g) => !g.answered).slice(0, 6).map((g) => g.question) },
        ],
      }),
    );
  }

  return out;
}

export function runAeoChecks(ctx: AuditContext, gaps: QuestionGap[]): CheckResult[] {
  return [
    ...answerChecks(ctx),
    ...answerSchemaChecks(ctx),
    ...eeatChecks(ctx),
    ...coverageChecks(ctx, gaps),
  ];
}
