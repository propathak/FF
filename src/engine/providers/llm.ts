import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { EnvBag } from '../types';

/**
 * The interpretation layer.
 *
 * Scope discipline (enforced by docs/03 §6 and by a dependency test):
 *   - The model NEVER produces a score, a count, a delta or a status.
 *   - It receives already-computed numbers and already-extracted signals, and
 *     turns them into sentences a marketing decision-maker can act on.
 *   - Raw page HTML never reaches it. It sees a ~2 KB aggregate signal object.
 *
 * Everything here is optional: with no API key the pipeline uses deterministic
 * templates, and the report says which one produced the prose.
 */

const QuestionSchema = z.object({
  question: z.string().min(8).max(160),
  intent: z.enum(['what_is', 'how_to', 'best_for', 'comparison', 'pricing']),
});

const QuestionsResponse = z.object({
  category: z.string().max(120).nullable().optional(),
  questions: z.array(QuestionSchema).min(1).max(24),
});

const TranslationSchema = z.object({
  id: z.string(),
  headline: z.string().max(120),
  business: z.string().max(420),
});

const NarrativeResponse = z.object({
  verdict: z.string().max(400),
  translations: z.array(TranslationSchema).max(8),
});

export interface LlmConfig {
  apiKey: string;
  proseModel: string;
  bulkModel: string;
}

export function readLlmConfig(env: EnvBag): LlmConfig | null {
  const apiKey = env['ANTHROPIC_API_KEY'];
  if (!apiKey) return null;
  return {
    apiKey,
    proseModel: env['ANTHROPIC_PROSE_MODEL'] || 'claude-opus-5',
    bulkModel: env['ANTHROPIC_BULK_MODEL'] || 'claude-haiku-4-5',
  };
}

/**
 * Models are asked for bare JSON and the result is validated with zod. Any
 * parse or schema failure falls back to templates rather than surfacing
 * malformed content — a report is a trust artefact.
 */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in response');
  return JSON.parse(candidate.slice(start, end + 1));
}

async function askJson(
  client: Anthropic,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<unknown> {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  return extractJson(text);
}

export interface QuestionGenerationInput {
  brandName: string;
  category: string | null;
  descriptor: string | null;
  topTerms: string[];
  market: string;
  sampleHeadings: string[];
}

const QUESTION_SYSTEM = `You generate the questions real buyers type into Google and ask AI assistants.

Rules:
- Output ONLY a JSON object: {"category": string|null, "questions": [{"question": string, "intent": "what_is"|"how_to"|"best_for"|"comparison"|"pricing"}]}
- Produce 14-18 questions.
- Write questions a PROSPECTIVE CUSTOMER would ask about this category — never questions about the company's own website or marketing.
- Do not invent competitor names, prices, statistics or product features.
- Mix intents: roughly 3 what_is, 3 how_to, 4 best_for, 4 comparison, 2 pricing.
- Use the market's language conventions and currency where a question implies cost.
- Keep each question under 100 characters and phrase it the way a person actually types.`;

export async function generateQuestions(
  config: LlmConfig,
  input: QuestionGenerationInput,
): Promise<{ questions: { question: string; intent: string }[]; category: string | null } | null> {
  const client = new Anthropic({ apiKey: config.apiKey });
  const user = [
    `Brand: ${input.brandName}`,
    `Stated category: ${input.category ?? 'unknown'}`,
    `Homepage descriptor: ${input.descriptor ?? 'unknown'}`,
    `Recurring terms across the site: ${input.topTerms.slice(0, 15).join(', ') || 'none extracted'}`,
    `Target market: ${input.market}`,
    `Sample page headings: ${input.sampleHeadings.slice(0, 25).join(' | ').slice(0, 1500)}`,
  ].join('\n');

  try {
    // Bulk model: this is classification-shaped work, not judgement-shaped.
    const raw = await askJson(client, config.bulkModel, QUESTION_SYSTEM, user, 2000);
    const parsed = QuestionsResponse.parse(raw);
    return { questions: parsed.questions, category: parsed.category ?? null };
  } catch {
    return null;
  }
}

export interface NarrativeInput {
  brandName: string;
  host: string;
  overall: number;
  band: string;
  mode: string;
  seo: number | null;
  aeo: number | null;
  geo: number | null;
  ai: number | null;
  /** Pre-computed, pre-worded findings. The model rewrites; it does not judge. */
  findings: { id: string; title: string; status: string; summary: string }[];
  unansweredQuestionCount: number;
  competitorSummary: string;
}

const NARRATIVE_SYSTEM = `You write the plain-English verdict on a brand's search and AI visibility audit for a marketing decision-maker.

Rules:
- Output ONLY a JSON object: {"verdict": string, "translations": [{"id": string, "headline": string, "business": string}]}
- "verdict": 2-3 sentences. State what the scores mean for the business — customers not finding them, competitors being surfaced instead. Direct, specific, no hype, no exclamation marks.
- "translations": one entry per finding id you are given, in the same order, maximum 6.
  - "headline": under 70 characters, business consequence, not the technical defect.
  - "business": 2 sentences on what this costs them in customers or credibility.
- Use ONLY the numbers and findings supplied. Never introduce a statistic, percentage, competitor name, ranking or claim that is not in the input.
- Never promise a specific revenue or traffic outcome.
- Never say the brand "ranks" in ChatGPT or any AI assistant — that is not measured.`;

export async function generateNarrative(
  config: LlmConfig,
  input: NarrativeInput,
): Promise<{ verdict: string; translations: { id: string; headline: string; business: string }[] } | null> {
  const client = new Anthropic({ apiKey: config.apiKey });
  const user = [
    `Brand: ${input.brandName} (${input.host})`,
    `Overall visibility score: ${input.overall}/100 — band: ${input.band}`,
    `Measurement mode: ${input.mode}`,
    `SEO: ${input.seo ?? 'not measured'} | AEO: ${input.aeo ?? 'not measured'} | GEO: ${input.geo ?? 'not measured'} | AI presence: ${input.ai ?? 'not measured'}`,
    `Unanswered high-intent customer questions found: ${input.unansweredQuestionCount}`,
    `Competitor position: ${input.competitorSummary}`,
    '',
    'Findings to translate (use these ids verbatim):',
    ...input.findings.map((f) => `- ${f.id} [${f.status}] ${f.title}: ${f.summary}`),
  ].join('\n');

  try {
    const raw = await askJson(client, config.proseModel, NARRATIVE_SYSTEM, user, 3000);
    const parsed = NarrativeResponse.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}
