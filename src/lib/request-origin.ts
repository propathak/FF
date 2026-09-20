import { headers } from 'next/headers';
import { appUrl } from '@/lib/app-url';

/**
 * The origin the visitor's browser is actually using.
 *
 * Distinct from `appUrl()`, which answers "where does this product live" for
 * links inside reports and emails. This one answers "what host is this request
 * on", which is what OAuth redirect matching cares about: a deployment is
 * commonly reachable at both a *.vercel.app address and a custom domain, and
 * Google only accepts the exact URI it has on file.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return appUrl();
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
