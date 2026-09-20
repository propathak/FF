import type { BrandProfile, PageSignals, QuestionGap } from './types';
import { contentTokens } from './util/text';

/**
 * Question-gap analysis.
 *
 * The model proposes candidate questions; the CRAWL decides whether each one is
 * answered. We never claim a question is unanswered without having searched the
 * crawled corpus for it, and the matching rule is stated in the report.
 */

const INTENT_VALUE: Record<QuestionGap['intent'], number> = {
  comparison: 1.0, // where purchase decisions and AI recommendations happen
  best_for: 0.9,
  pricing: 0.8,
  how_to: 0.6,
  what_is: 0.5,
};

/** Deterministic fallback set used when no LLM key is configured. */
export function templateQuestions(brand: BrandProfile): { question: string; intent: QuestionGap['intent'] }[] {
  const subject = brand.category?.replace(/^(we are|we're|a|an|the)\s+/i, '') ?? brand.topTerms[0] ?? 'this service';
  const name = brand.name;
  const short = subject.split(/\s+/).slice(0, 5).join(' ');
  return [
    { question: `What is ${short}?`, intent: 'what_is' },
    { question: `How does ${short} work?`, intent: 'what_is' },
    { question: `What should I look for when choosing ${short}?`, intent: 'best_for' },
    { question: `Who are the best providers of ${short}?`, intent: 'best_for' },
    { question: `Is ${name} any good?`, intent: 'best_for' },
    { question: `What are the alternatives to ${name}?`, intent: 'comparison' },
    { question: `How does ${name} compare to other providers?`, intent: 'comparison' },
    { question: `What are the pros and cons of ${short}?`, intent: 'comparison' },
    { question: `How much does ${short} cost?`, intent: 'pricing' },
    { question: `Is ${short} worth the money?`, intent: 'pricing' },
    { question: `How do I get started with ${short}?`, intent: 'how_to' },
    { question: `How long does ${short} take?`, intent: 'how_to' },
    { question: `What mistakes should I avoid with ${short}?`, intent: 'how_to' },
    { question: `Who needs ${short}?`, intent: 'best_for' },
  ];
}

/**
 * A question counts as answered when its distinctive terms are well covered by
 * a page AND that page has question-shaped structure addressing it — content
 * that merely mentions the words is not an answer.
 */
export function matchQuestions(
  candidates: { question: string; intent: QuestionGap['intent'] }[],
  pages: PageSignals[],
): QuestionGap[] {
  const indexed = pages
    .filter((p) => p.statusCode >= 200 && p.statusCode < 300)
    .map((p) => ({
      url: p.url,
      headingTokens: new Set(contentTokens(p.headings.map((h) => h.text).join(' '))),
      bodyTokens: new Set(contentTokens(`${p.title ?? ''} ${p.excerpt}`)),
      questionTexts: p.questionHeadings.map((q) => q.text.toLowerCase()),
      hasAnswerBlocks: p.questionHeadings.some((q) => q.qualifies),
    }));

  return candidates.map(({ question, intent }) => {
    const terms = contentTokens(question);
    if (terms.length === 0) {
      return { question, intent, answered: false, matchedUrl: null, value: INTENT_VALUE[intent] };
    }

    let best: { url: string; score: number } | null = null;
    for (const page of indexed) {
      const inHeading = terms.filter((t) => page.headingTokens.has(t)).length / terms.length;
      const inBody = terms.filter((t) => page.bodyTokens.has(t)).length / terms.length;
      // An existing near-identical question heading is conclusive.
      const exact = page.questionTexts.some((q) => {
        const qTerms = contentTokens(q);
        const overlap = terms.filter((t) => qTerms.includes(t)).length;
        return overlap / terms.length >= 0.7;
      });
      const score = exact ? 1 : inHeading * 0.7 + inBody * 0.3;
      if (!best || score > best.score) best = { url: page.url, score };
    }

    const matched = Boolean(best && best.score >= 0.6);
    return {
      question,
      intent,
      answered: matched,
      matchedUrl: matched ? (best?.url ?? null) : null,
      value: INTENT_VALUE[intent],
    };
  });
}

export function rankGaps(gaps: QuestionGap[]): QuestionGap[] {
  return [...gaps].sort((a, b) => {
    if (a.answered !== b.answered) return a.answered ? 1 : -1;
    return b.value - a.value;
  });
}
