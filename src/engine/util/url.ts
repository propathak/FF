/** URL normalisation helpers. Shared by the crawler, checks and dedup logic. */

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|msclkid|mc_cid|mc_eid|ref|_hs|igshid|yclid)/i;

/** Public-suffix-lite: enough to group hosts without shipping the full PSL. */
const MULTI_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.in', 'net.in', 'org.in', 'com.au', 'net.au',
  'org.au', 'co.nz', 'co.jp', 'com.br', 'com.sg', 'com.my', 'co.za', 'com.mx',
]);

export interface NormaliseOptions {
  /**
   * Permits localhost and bare IPs. Off in production (accepting them would
   * turn the public audit endpoint into an SSRF probe against internal hosts);
   * on for local development and tests against a fixture server.
   */
  allowLocal?: boolean;
}

export function normaliseInputUrl(input: string, options: NormaliseOptions = {}): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    const isLocal =
      u.hostname === 'localhost' ||
      u.hostname.endsWith('.localhost') ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) ||
      u.hostname === '[::1]';
    if (isLocal) return options.allowLocal ? u.toString() : null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Canonical form used as the crawl-visited key: drops the fragment, tracking
 * params and a trailing slash, lowercases the host, and sorts the query.
 */
export function canonicaliseUrl(raw: string, base?: string): string | null {
  try {
    const u = base ? new URL(raw, base) : new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of params) u.searchParams.append(k, v);
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) {
      u.port = '';
    }
    return u.toString();
  } catch {
    return null;
  }
}

export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join('.');
  return lastTwo;
}

export function sameSite(a: string, b: string): boolean {
  try {
    return registrableDomain(new URL(a).hostname) === registrableDomain(new URL(b).hostname);
  } catch {
    return false;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function pathDepth(url: string): number {
  try {
    const p = new URL(url).pathname.replace(/^\/|\/$/g, '');
    return p === '' ? 0 : p.split('/').length;
  } catch {
    return 0;
  }
}

/** Skips asset URLs the crawler should record as links but never fetch. */
const NON_HTML_EXT =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|zip|gz|rar|mp4|webm|mp3|wav|woff2?|ttf|eot|dmg|exe|pkg|csv|xlsx?|docx?|pptx?)$/i;

export function looksLikeHtmlUrl(url: string): boolean {
  try {
    return !NON_HTML_EXT.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function hostVariants(origin: string): string[] {
  const host = hostOf(origin);
  const apex = host.replace(/^www\./, '');
  return [`http://${apex}/`, `https://${apex}/`, `http://www.${apex}/`, `https://www.${apex}/`];
}
