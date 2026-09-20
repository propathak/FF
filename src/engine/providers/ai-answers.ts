import type { Availability, AiAnswerData, AiMention } from '../types';
import { fetchJson } from '../util/http';
import { hostOf, registrableDomain } from '../util/url';

/**
 * AI answer sampling (audit Mode A).
 *
 * IMPORTANT, and stated in the UI wherever these numbers appear: an API answer
 * is not the same artefact as the consumer product's answer. There is no API
 * that reports what the ChatGPT app shows a user, so this module never claims
 * to measure ChatGPT. It samples engines that expose an answer + citations API,
 * and always reports the engine list, prompt set and sample count alongside the
 * number. See docs/06-limitations.md.
 *
 * Non-determinism is handled by sampling each prompt `samplesPerPrompt` times
 * (default 3) — a single sample is noise, not a measurement.
 */

export interface AiEngine {
  name: string;
  ask(prompt: string): Promise<{ ok: boolean; text: string; citedDomains: string[]; error?: string }>;
}

interface PerplexityResponse {
  choices?: { message?: { content?: string } }[];
  citations?: string[];
  search_results?: { url?: string }[];
}

export function createPerplexityEngine(apiKey: string, model = 'sonar'): AiEngine {
  return {
    name: 'perplexity',
    async ask(prompt) {
      const res = await fetchJson<PerplexityResponse>('https://api.perplexity.ai/chat/completions', {
        timeoutMs: 45_000,
        init: {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 700,
          }),
        },
      });
      if (!res.ok || !res.data) return { ok: false, text: '', citedDomains: [], error: res.error };
      const text = res.data.choices?.[0]?.message?.content ?? '';
      const urls = [
        ...(res.data.citations ?? []),
        ...(res.data.search_results ?? []).map((r) => r.url ?? ''),
      ];
      return {
        ok: true,
        text,
        citedDomains: [...new Set(urls.map(hostOf).filter(Boolean))],
      };
    },
  };
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; domain?: string } }[];
    };
  }[];
}

export function createGeminiEngine(apiKey: string, model = 'gemini-2.5-flash'): AiEngine {
  return {
    name: 'gemini',
    async ask(prompt) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetchJson<GeminiResponse>(url, {
        timeoutMs: 45_000,
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
          }),
        },
      });
      if (!res.ok || !res.data) return { ok: false, text: '', citedDomains: [], error: res.error };
      const candidate = res.data.candidates?.[0];
      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join(' ');
      const domains = (candidate?.groundingMetadata?.groundingChunks ?? [])
        .map((c) => c.web?.domain ?? hostOf(c.web?.uri ?? ''))
        .filter((d): d is string => Boolean(d));
      return { ok: true, text, citedDomains: [...new Set(domains)] };
    },
  };
}

export interface AiSamplingInput {
  brandName: string;
  host: string;
  competitorNames: string[];
  prompts: string[];
  samplesPerPrompt: number;
  /** Ceiling on total engine calls for this audit. */
  callBudget: number;
}

/** Deterministic mention extraction — the LLM is not asked to count anything. */
function analyseAnswer(
  text: string,
  citedDomains: string[],
  brandName: string,
  host: string,
  competitorNames: string[],
): Omit<AiMention, 'engine' | 'prompt' | 'sampleIndex'> {
  const lower = text.toLowerCase();
  const brandLower = brandName.toLowerCase();
  const index = lower.indexOf(brandLower);
  const mentioned = index >= 0;

  // Ordinal = how many distinct tracked brands appear before ours.
  const positions: { name: string; at: number }[] = [];
  for (const name of [brandName, ...competitorNames]) {
    const at = lower.indexOf(name.toLowerCase());
    if (at >= 0) positions.push({ name, at });
  }
  positions.sort((a, b) => a.at - b.at);
  const ordinal = mentioned ? positions.findIndex((p) => p.name === brandName) + 1 : null;

  const bare = registrableDomain(host);
  const cited = citedDomains.some((d) => registrableDomain(d) === bare);

  // Coarse three-band sentiment from the sentence containing the mention.
  let sentiment: AiMention['sentiment'] = null;
  if (mentioned) {
    const window = text.slice(Math.max(0, index - 160), index + 220).toLowerCase();
    const positive = /(best|leading|top|recommend|excellent|strong|popular|trusted|preferred|award)/.test(window);
    const negative = /(poor|worst|avoid|complaint|lawsuit|criticis|expensive|limited|drawback|downside)/.test(window);
    sentiment = positive && !negative ? 'positive' : negative && !positive ? 'negative' : 'neutral';
  }

  return {
    brandMentioned: mentioned,
    ordinal: ordinal && ordinal > 0 ? ordinal : null,
    citedBrandDomain: cited,
    competitorsMentioned: competitorNames.filter((n) => lower.includes(n.toLowerCase())),
    citedDomains,
    sentiment,
  };
}

export async function sampleAiAnswers(
  engines: AiEngine[],
  input: AiSamplingInput,
): Promise<Availability<AiAnswerData>> {
  if (engines.length === 0) {
    return { available: false, reason: 'No AI answer engines configured' };
  }
  const mentions: AiMention[] = [];
  let calls = 0;
  let failures = 0;

  outer: for (const engine of engines) {
    for (const prompt of input.prompts) {
      for (let sample = 0; sample < input.samplesPerPrompt; sample++) {
        if (calls >= input.callBudget) break outer;
        const result = await engine.ask(prompt);
        calls++;
        if (!result.ok) {
          failures++;
          continue;
        }
        mentions.push({
          engine: engine.name,
          prompt,
          sampleIndex: sample,
          ...analyseAnswer(
            result.text,
            result.citedDomains,
            input.brandName,
            input.host,
            input.competitorNames,
          ),
        });
      }
    }
  }

  if (mentions.length === 0) {
    return { available: false, reason: `All ${failures} AI answer calls failed` };
  }

  const brandMentions = mentions.filter((m) => m.brandMentioned).length;
  const competitorMentions = mentions.reduce((sum, m) => sum + m.competitorsMentioned.length, 0);
  const totalBrandMentions = brandMentions + competitorMentions;

  return {
    available: true,
    data: {
      engines: engines.map((e) => e.name),
      promptSet: input.prompts,
      samplesPerPrompt: input.samplesPerPrompt,
      mentions,
      shareOfVoice: {
        brandMentions,
        totalBrandMentions,
        pct: totalBrandMentions === 0 ? 0 : (brandMentions / totalBrandMentions) * 100,
      },
    },
  };
}
