/**
 * The engine's only network primitive. Injected everywhere so tests can run
 * against fixtures and Phase 3 can swap in a proxying fetcher without touching
 * analyser code.
 */

import { CRAWL_DEFAULTS } from '../config';

export interface FetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  redirectChain: string[];
  headers: Record<string, string>;
  body: string;
  bytes: number;
  loadMs: number;
  contentType: string;
  error?: string;
  truncated: boolean;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  method?: 'GET' | 'HEAD';
  accept?: string;
  /** Resolve redirects manually so we can record the chain. */
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface Fetcher {
  (url: string, options?: FetchOptions): Promise<FetchResult>;
}

function emptyResult(url: string, error: string, loadMs: number): FetchResult {
  return {
    ok: false,
    status: 0,
    finalUrl: url,
    redirectChain: [],
    headers: {},
    body: '',
    bytes: 0,
    loadMs,
    contentType: '',
    error,
    truncated: false,
  };
}

/**
 * Reads at most `maxBytes` then aborts. Prevents a single 400 MB "HTML" file
 * from taking the audit down, which happens more often than you'd expect.
 */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text();
    return { text, bytes: text.length, truncated: false };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytes += value.byteLength;
    chunks.push(value);
    if (bytes >= maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(merged), bytes, truncated };
}

export const defaultFetcher: Fetcher = async (url, options = {}) => {
  const {
    timeoutMs = CRAWL_DEFAULTS.pageTimeoutMs,
    maxBytes = CRAWL_DEFAULTS.maxBodyBytes,
    method = 'GET',
    accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    maxRedirects = 10,
    headers = {},
  } = options;

  const started = Date.now();
  const redirectChain: string[] = [];
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': CRAWL_DEFAULTS.userAgent,
          accept,
          'accept-language': 'en-US,en;q=0.9',
          ...headers,
        },
      });
      clearTimeout(timer);

      const status = response.status;
      const location = response.headers.get('location');
      if (status >= 300 && status < 400 && location && hop < maxRedirects) {
        const next = new URL(location, current).toString();
        redirectChain.push(current);
        current = next;
        continue;
      }

      const headerMap: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        headerMap[k.toLowerCase()] = v;
      });
      const contentType = headerMap['content-type'] ?? '';

      if (method === 'HEAD') {
        return {
          ok: response.ok, status, finalUrl: current, redirectChain, headers: headerMap,
          body: '', bytes: 0, loadMs: Date.now() - started, contentType, truncated: false,
        };
      }

      const { text, bytes, truncated } = await readCapped(response, maxBytes);
      return {
        ok: response.ok, status, finalUrl: current, redirectChain, headers: headerMap,
        body: text, bytes, loadMs: Date.now() - started, contentType, truncated,
      };
    } catch (err) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : String(err);
      const reason = message.includes('abort') ? `timeout after ${timeoutMs}ms` : message;
      return emptyResult(current, reason, Date.now() - started);
    }
  }
  return emptyResult(current, `too many redirects (>${maxRedirects})`, Date.now() - started);
};

/** Bounded-concurrency map. Keeps us polite and keeps memory flat. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchJson<T>(
  url: string,
  options: FetchOptions & { init?: RequestInit } = {},
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const { timeoutMs = 15_000, init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'user-agent': CRAWL_DEFAULTS.userAgent,
        accept: 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    clearTimeout(timer);
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, data: null, error: text.slice(0, 300) };
    }
    return { ok: true, status: response.status, data: JSON.parse(text) as T };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
