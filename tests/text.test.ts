import { describe, expect, it } from 'vitest';
import {
  countDefinitions, countQuotable, countStatistics, isQuestion, jaccard, qualifiesAsAnswer,
  ramp, shingles, splitSentences, topTerms,
} from '@/engine/util/text';
import { canonicaliseUrl, normaliseInputUrl, registrableDomain, sameSite } from '@/engine/util/url';

describe('answer qualification', () => {
  it('accepts a self-contained answer of the right length', () => {
    expect(qualifiesAsAnswer(
      'Product analytics is the practice of measuring how people use a software product to improve retention.',
    )).toBe(true);
  });

  it('rejects an answer that is too short to be useful', () => {
    expect(qualifiesAsAnswer('It depends.')).toBe(false);
  });

  it('rejects an answer that is too long to be extracted', () => {
    expect(qualifiesAsAnswer('a'.repeat(400))).toBe(false);
  });

  it('rejects an answer that opens with a backward-referring pronoun', () => {
    expect(qualifiesAsAnswer(
      'It is the practice of measuring how people use a software product in order to improve retention.',
    )).toBe(false);
  });

  it('rejects another question', () => {
    expect(qualifiesAsAnswer(
      'But what exactly do we mean when we talk about measuring product usage in a business context?',
    )).toBe(false);
  });
});

describe('question detection', () => {
  it('recognises question marks and question openers', () => {
    expect(isQuestion('What is product analytics?')).toBe(true);
    expect(isQuestion('How we work')).toBe(true);
    expect(isQuestion('Our solutions')).toBe(false);
  });
});

describe('content signal extraction', () => {
  it('counts definitional statements', () => {
    const sentences = splitSentences(
      'Product analytics is a discipline. We like it. Churn refers to the rate at which customers leave.',
    );
    expect(countDefinitions(sentences)).toBe(2);
  });

  it('counts statistics with units or currency', () => {
    const sentences = splitSentences(
      'Retention improved by 42 percent across the surveyed accounts. We think it went well. Pricing starts at $499 per month for standard plans.',
    );
    expect(countStatistics(sentences)).toBe(2);
  });

  it('counts quotable standalone sentences', () => {
    const sentences = splitSentences(
      'Account-level adoption is the single best leading indicator of business software renewal across every segment we measured. Yes.',
    );
    expect(countQuotable(sentences)).toBe(1);
  });

  it('surfaces recurring terms', () => {
    const terms = topTerms([
      'product analytics for teams', 'product analytics platform', 'analytics for product teams',
    ], 5);
    expect(terms.join(' ')).toContain('analytics');
  });
});

describe('near-duplicate detection', () => {
  it('scores identical text as fully overlapping', () => {
    const text = 'The quick brown fox jumps over the lazy dog every single morning without fail.';
    expect(jaccard(shingles(text), shingles(text))).toBe(1);
  });

  it('scores unrelated text as barely overlapping', () => {
    const a = shingles('Product analytics measures feature adoption across paying business accounts over time.');
    const b = shingles('Sourdough bread requires a mature starter, long fermentation and a very hot oven.');
    expect(jaccard(a, b)).toBeLessThan(0.1);
  });
});

describe('ramp', () => {
  it('clamps at both ends and interpolates between', () => {
    expect(ramp(0, 0, 10)).toBe(0);
    expect(ramp(10, 0, 10)).toBe(1);
    expect(ramp(5, 0, 10)).toBe(0.5);
    // Works in the inverted direction too (lower is better).
    expect(ramp(1000, 5000, 2000)).toBe(1);
    expect(ramp(6000, 5000, 2000)).toBe(0);
  });
});

describe('url handling', () => {
  it('adds a scheme and rejects nonsense', () => {
    expect(normaliseInputUrl('example.com')).toBe('https://example.com/');
    expect(normaliseInputUrl('not a url')).toBeNull();
    expect(normaliseInputUrl('')).toBeNull();
  });

  it('blocks local and IP targets unless explicitly allowed (SSRF guard)', () => {
    expect(normaliseInputUrl('http://localhost:3000')).toBeNull();
    expect(normaliseInputUrl('http://127.0.0.1:8080')).toBeNull();
    expect(normaliseInputUrl('http://192.168.1.1')).toBeNull();
    expect(normaliseInputUrl('http://127.0.0.1:8080', { allowLocal: true })).toBe('http://127.0.0.1:8080/');
  });

  it('canonicalises away fragments, tracking params and trailing slashes', () => {
    expect(canonicaliseUrl('https://EXAMPLE.com/a/?utm_source=x&b=2#frag'))
      .toBe('https://example.com/a?b=2');
  });

  it('resolves relative URLs against a base', () => {
    expect(canonicaliseUrl('/about', 'https://example.com/team/')).toBe('https://example.com/about');
  });

  it('understands multi-part public suffixes', () => {
    expect(registrableDomain('www.shop.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('blog.example.com')).toBe('example.com');
    expect(sameSite('https://blog.example.com/a', 'https://www.example.com/b')).toBe(true);
    expect(sameSite('https://example.com', 'https://other.com')).toBe(false);
  });
});
