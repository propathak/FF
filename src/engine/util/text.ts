/** Deterministic text analysis helpers. No model calls, no randomness. */

const WORD_RE = /[a-z0-9][a-z0-9'’-]*/gi;

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','than','that','this','these','those','of','to','in',
  'on','for','with','as','by','at','from','is','are','was','were','be','been','being','it','its',
  'we','our','you','your','they','their','he','she','his','her','i','me','my','us','not','no','do',
  'does','did','can','could','will','would','should','may','might','must','have','has','had','also',
  'more','most','other','some','such','only','own','same','so','too','very','just','about','into',
  'over','after','before','up','down','out','off','all','any','each','how','what','when','where',
  'which','who','why','get','got','make','made','use','used','using','new','best','top','free',
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []).map((w) => w.replace(/[’']s$/, ''));
}

export function contentTokens(text: string): string[] {
  return tokenize(text).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** FNV-1a — fast, stable, and adequate for shingle identity. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hashed 5-gram shingles, capped so page records stay small. */
export function shingles(text: string, size = 5, cap = 400): number[] {
  const words = contentTokens(text);
  if (words.length < size) return [];
  const out = new Set<number>();
  for (let i = 0; i + size <= words.length; i++) {
    out.add(hashString(words.slice(i, i + size).join(' ')));
    if (out.size >= cap * 4) break;
  }
  const arr = [...out].sort((a, b) => a - b);
  // Deterministic down-sample: keep the numerically smallest hashes (MinHash-style),
  // which preserves Jaccard similarity in expectation.
  return arr.slice(0, cap);
}

export function jaccard(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let intersection = 0;
  for (const x of a) if (setB.has(x)) intersection++;
  const union = a.length + b.length - intersection;
  return union === 0 ? 0 : intersection / union;
}

const QUESTION_STARTERS =
  /^(who|what|why|how|when|where|which|can|do|does|did|is|are|should|will|would|could|has|have|am)\b/i;

export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 6) return false;
  return t.endsWith('?') || QUESTION_STARTERS.test(t);
}

/**
 * A qualifying answer block: 40–320 characters, declarative (not itself a
 * question), and self-contained (doesn't open with a pronoun referring
 * backwards). This is the mechanically-checkable proxy for extractability.
 */
export function qualifiesAsAnswer(text: string | null): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 40 || t.length > 320) return false;
  if (t.endsWith('?')) return false;
  if (/^(it|this|that|they|these|those|he|she)\b/i.test(t)) return false;
  return true;
}

/** "X is a …", "X refers to …", "X means …" near a heading. */
const DEFINITION_RE =
  /\b[A-Z][\w .'-]{2,60}\s+(is|are|refers to|means|stands for|is defined as)\s+(a|an|the|when|any|two|three|\w)/;

export function countDefinitions(sentences: string[]): number {
  return sentences.filter((s) => DEFINITION_RE.test(s)).length;
}

/**
 * A statistic claim: a number with a unit, percentage, currency or explicit
 * magnitude, in a sentence with at least a few content words around it.
 */
const STAT_RE =
  /(\d{1,3}(,\d{3})+|\d+(\.\d+)?)\s*(%|percent|per cent|x\b|million|billion|crore|lakh|bn|mn|k\b|users|customers|hours|days|weeks|months|years|₹|\$|€|£)|[₹$€£]\s*\d/i;

export function countStatistics(sentences: string[]): number {
  return sentences.filter((s) => STAT_RE.test(s) && contentTokens(s).length >= 5).length;
}

/**
 * A quotable passage: a self-contained declarative sentence of 15–45 words
 * making a concrete claim. This is what actually gets lifted into an AI answer.
 */
export function countQuotable(sentences: string[]): number {
  return sentences.filter((s) => {
    const words = tokenize(s);
    if (words.length < 15 || words.length > 45) return false;
    if (s.trim().endsWith('?')) return false;
    if (/^(it|this|that|they|these|those|and|but|so|however|therefore)\b/i.test(s.trim())) return false;
    return contentTokens(s).length >= 7;
  }).length;
}

/** Most frequent non-stopword bigrams and unigrams across the corpus. */
export function topTerms(texts: string[], limit = 15): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const words = contentTokens(text);
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    for (let i = 0; i + 1 < words.length; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      counts.set(bigram, (counts.get(bigram) ?? 0) + 2); // bigrams are more informative
    }
  }
  return [...counts.entries()]
    .filter(([term, n]) => n > 1 && term.length > 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Linear ramp: 0 at or below `bad`, 1 at or above `good`. Works both directions. */
export function ramp(value: number, bad: number, good: number): number {
  if (bad === good) return value >= good ? 1 : 0;
  return clamp01((value - bad) / (good - bad));
}

export function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** "1 question" / "3 questions" — avoids "1 questions" in generated copy. */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`;
}
